# Tracker

A personal spending tracker for one person. **One `index.html`** — markup, CSS and JavaScript in
a single file. No framework, no build step, no backend, no accounts. Installed to an iPhone Home
Screen from GitHub Pages.

`CLAUDE.md` is the complete project record — every feature, the full change history and an
append-only session log. **Start there.** This README is the release-facing view: what each piece
does and what changed in each build. `TRACKER-PROJECT.md` goes deeper on the architecture and on
bugs that must not be reintroduced — read it before changing the money maths. `BUILD-SPEC.md` is a
from-scratch brief for building this kind of app independently: requirements and every trap found
the hard way, with the owner-specific choices stripped out.

---

## The files

| File | What it is |
|---|---|
| `index.html` | The entire app. ~3,700 lines |
| `test.js` | jsdom test suite, run with `node test.js`. Boots the real `index.html` with a frozen clock |
| `sw.js` | Service worker. Network-first, `cache: 'reload'` on the document |
| `manifest.json` | PWA name and icons |
| `icon-*.png` | Launcher icons |
| `TRACKER-PROJECT.md` | Architecture, the money model, and a list of fixed bugs |

## Running the tests

```bash
node test.js
```

**672 checks, all passing.** Run it before and after every change — it has caught genuine bugs
that code review missed, several in the same session they were introduced.

## Deploying

1. Edit `index.html`
2. **Bump the `slip-build` meta tag** (line 7) — a running app compares against this to notice an update
3. Commit and push to `main`
4. GitHub Pages redeploys in about a minute; the app offers the update on next open

---

## How the money works

```
available   = money in − money spent − money moved to savings
for living  = available − unpaid expected bills − savings goal not yet banked
today       = (for living + spent today) ÷ days left, minus spent today
this week   = today + one day's allowance for each remaining day of the week
this month  = for living, exactly
```

One rate drives all three figures, so they can't drift apart. Today's number going negative means
"done for today", not "you owe this".

Only categories on the **Kept out** list (default `Rent`, `Water / levies`) sit outside the daily
and weekly figures. Everything else — subscriptions, fibre, electricity — counts against the day.
Kept-out spending still reduces `available`; it just doesn't make a week look blown.

## The month is not a calendar month

Months run **allowance day to allowance day**, because that's when money arrives. A cycle is
**named for the month it ends in**: 25 Aug – 24 Sep is *September*.

- `data.day` — the default allowance day (fallback when a month has no explicit start)
- `data.starts` — per-month overrides, e.g. `{'2026-09': '2026-09-23'}`. One anchor per calendar
  month. Setting one never affects any other month
- Entries auto-refile when a boundary moves, **unless** moved by hand (`e.man = true`)

### Working with a payday that moves

Payday here lands somewhere in the last week of the month and is different every month, so the
allowance day is only ever an approximation. The workflow is:

**When you log the allowance, set "Counts toward" to the next month** (or tick the
"start the month from…" checkbox). That files the money *and* pins the new month's start to the
day it actually arrived. Each month's end then auto-corrects when the following month's start is
set — a cycle showing 28 Sept – 24 Oct stretches to 29 Oct by itself once pay lands on the 30th.

Money filed into a future cycle stays out of every current figure until that cycle opens: `carry`
only pulls from cycles *earlier* than the current one.

Logging ahead of payday is supported and useful — the current month stretches to absorb the gap
and the daily allowance drops to match, which is the honest answer when payday slips later.

## Data model

Storage key **`slip:v4`**. Boot migrates from `v3` and `v2`.

```js
data = {
  day, starts, goal, exclude, potCats, theme, glass,
  rates, ratesAt, cycCur, cycRate, homeCur,   // currency
  groups, cats, bills, incomes, ticks,
  holdings, invHist, invAt,                   // investments
  plans, planBuf, planSave,                   // planned purchases
  deleted,                                    // tombstones, pruned at 120 days
  lastBackup, gistId, tok, rev, syncedRev,    // sync
  entries: []
}

entry = { id, amt, cat, note, date, cyc, type, refund, man, hold, cur, orig, rate }
plan  = { id, o, n, price, m, only, status, note, link, paid, at, rev }
budgets = { 'YYYY-MM': { inc, rev, lines: [{ id, n, cat, a, bill }] } }
```

A **budget** is keyed like a plan, by the month its cycle is named for, so it stays attached when
payday moves the boundary. `inc` is the money expected that month, each line a planned amount for a
category (`bill` links a line made from a bill). Spending is matched to lines by category; savings
moves count against a line in the `Savings` category. Sync merges budgets **month by month**, the
higher per-month `rev` winning. Imported entries carry `imp` (the batch time) so an import can be undone.

A **plan** is one planned purchase. `o` is its order, `m` the month its pay cycle is named for
(`'2026-11'` is the cycle ending in November), `only` the "only if the safety amount is left"
flag, `status` one of `planned` / `bought` / `skipped`. `planBuf` is the safety amount (default
1000), `planSave` per-month overrides of expected saving (`{'2026-11': 4000}`); with no override a
month uses `data.goal`.

`amt` is **always in rand**; negative means a refund. Currency is a display layer — a cycle's
currency converts through a rate frozen at the moment it was chosen (`data.cycRate`), so a closed
month never drifts when the rate table is edited later.

`hold` marks an income entry you deliberately filed into a later month without moving the
month boundary — the launch sweep skips it.

**Use the entry-type helpers** — `isIn`, `isSave`, `isUnsave`, `isSpend`, `isBill`, `isLiving` —
never test `type` directly. Testing `e.type !== 'in'` is how savings movements once got counted
as spending.

---

## Changelog

Newest first. Each entry is keyed to the `slip-build` stamp it shipped under.

### `2026-10-21-9` — the statement reader understands reversed charges

- A card line that **adds** to the balance is money coming back, so it is read as a refund, not a second purchase.
- A charge and a refund of the same amount under the **same bank reference** (a payment the bank reversed) cancel
  out: both go to *Skipped* ("charged and then refunded: nothing was spent"). Found on a real statement where
  a R1,439.66 shop and a R195.09 order were each charged and then reversed.

### `2026-10-21-6` — read statements and receipts (Windows app only)

Hand the Windows app a bank statement or a receipt and it fills in the entries for you.

- **How:** *Add → Read statements or receipts…*, or *Settings → Data → Read statements and receipts*, or just
  **drop the files on the window**. PDFs and photos (JPG, PNG) are read **on this PC only**: the app's host reads
  the text layer of a PDF, and uses Windows' own offline OCR for scans and photos. Nothing is uploaded.
- **What it understands:** Wise statements (card payments, with the amount the shop charged; transfers; money
  in), a generic "date, description, amount" bank layout (Cr/Dr or minus signs), and single receipts (total,
  date, shop).
- **A review page, then nothing happens until you press Add.** Lines are grouped: *To add*, *Already in your
  tracker* (held back so nothing is entered twice, including by bank reference), and *Skipped* (conversions and
  moves between your own pots). Fix the category or note on any line; unknown shops wait for a category.
- **It learns.** The category you choose for a shop, and "Not mine" on a line, become rules (Settings-level data,
  synced to every device). *What it has learned from you* lists them with Forget.
- One undo for the whole import. Phones and the browser never show any of this.

### `2026-10-21-4` — the savings card no longer says "goal is done" when money was taken out

- With money taken out, the card now reads "no goal held back — you took money out this month" instead of
  "this month's R3 500 goal is done" (which is only said when the goal was actually saved).

### `2026-10-21-3` — Put in / Take out switch for savings moves

- **Fixed:** a withdrawal could end up recorded as a deposit. The green *Add more* button sits next to
  *Take some out*, and once the dialog was open there was no way to change direction, so a £138 withdrawal
  (note "Brokeee") was logged as £138 put **in**: the £ pot went from £138 to £276 and "put away this month"
  read R5 936 after everything had been taken out.
- The savings dialog now has a **Put in | Take out** switch at the top. Flipping it keeps the amount, note
  and currency (a withdrawal only offers pots that have money in them). A sweep that comes with its figure
  already worked out (the "September leftover" buttons) has no switch.
- A pot within half a unit of zero now reads as empty: R61 taken from R60.55 showed "−R0".

### `2026-10-21-2` — dark scrollbars, no inner scroll in the bills list

- Native scrollbars, date pickers and form controls now follow the colour scheme (dark, Midnight, Forest and Grape tell the browser they are dark) instead of staying bright white.
- On a wide desktop window the bills list no longer scrolls inside the page.

### `2026-10-21-1` — the remaining pages in the Figma look

- **Subscriptions & bills**: a warning ("2 bills aren't logged yet. Their money is still safely held back."),
  a **Paid / Still due** summary card, and each row says *Paid* or *Held back* beside its amount.
- **Planned purchases**: a **Next up** card for the first purchase (name, price, how much is saved as a bar,
  and when it is ready); rows keep their buttons on the same line on a wide window.
- **Budget**: a month switcher (‹ October · 25 Sept – 24 Oct ›), a summary card with **Free** in green, and
  the four actions as a grid: Add a line, Add my bills, Copy last month, Clear this month. Clear is greyed
  out for a month with no budget.
- **Settings (Month, Rules, Bills, Data)** on desktop: small-caps section headings, quiet descriptions,
  categories and bills as pill chips inside a card, rates in rows, buttons at their natural width.
- Wording: "this phone" became "this device" in Settings, the backup banner and the delete prompt.
- The month-by-month table in Planned purchases scrolls in its own box instead of widening the sheet.

### `2026-10-20-11` — Add amount polish

- The amount box no longer shows the number spinner (a white block in the Windows app), and its placeholder on the Add page is smaller.

### `2026-10-20-10` — the Figma pages, and a Windows-style desktop

- **Desktop looks like the Figma Windows design, not the phone.** Tighter corners (9 px cards, 6 px
  buttons), hairline borders, white flat surfaces, a nav pane with the logo tile and a **Synced** status
  at the bottom (it opens Settings → Data; "Not synced / Set up in Settings" until a backup is connected).
- **Investments**: a teal summary card with the total, a gain pill and bars from the daily snapshots; two
  tiles (past month, return); holdings as cards with their share of the portfolio. Same layout on phones.
- **Months**: a "2026 so far" summary card; rows show what was *saved* (kept: in − bills − living) and what
  came in, with the goal badge and CSV/PDF. Same on phones. Also fixed: the "Tap a month…" hint repeated
  every time the page was opened.
- **Search**: a large field with its shortcut shown (/, or Ctrl F inside the Windows app), filter chips
  (All, Spent, Received, Food, This month) that combine with the query and work on their own, and a count
  and total line. Plain hairline rows on desktop.
- **Add** is a page on a wide desktop window: the same form moved into it (so saving is unchanged), a large
  amount with the currency in front, category pills grouped Living / Shopping / Bills, date beside note,
  "That's 0.4 days of your allowance", one wide **Add R384 spent** button, and *Add a list of entries
  instead*. It stays open for the next entry; Esc closes it. Phones keep the card on the dashboard.
- **Settings → Look**: round-swatch scheme cards with a tick, and a real on/off switch for frosted glass.
- Main screens on phones now share one header (close at the left, centred title and subtitle).

### `2026-10-20-9` — desktop screens are pages, not pop-ups

On a wide desktop window (900 px and up) Settings, Months, Search, Investments, Subscriptions &
bills, Planned purchases and Budget now open as full pages beside the left navigation, as in the Figma
design, instead of as sheets floating over everything. The nav stays clickable and lights the page you
are on; opening one page replaces the last; **Esc** closes it; the small edit and confirm dialogs still
appear as centred sheets on top. New **Home** button at the top of the nav (wide desktop only). **N** and
**/** work from inside a page. Phones, and narrow windows, are unchanged: sheets as before.

### `2026-10-20-8` — screen pass with real settings

Gone through Months, Settings (all five tabs), Subscriptions & bills, Search, Planned purchases and
Investments at phone and desktop sizes, dark, with frosted glass on. They take the new colours and
shapes cleanly; two small fixes:

- Unselected category chips (Settings → Rules) were too faint (45% opacity); now 62%, the tick still
  marks the chosen ones.
- Wording no longer assumes an iPhone: the frosted-glass hint says "your device", and the receipt tip
  now covers Android (Google Lens / Photos *Copy text*) and Windows (Snipping Tool *Text actions*).

### `2026-10-20-7` — the hero keeps its colour with frosted glass on

- **Fixed:** with *Frosted glass surfaces* switched on, the glass styling replaced the new filled hero
  with a see-through card (found on the Android phone; the browser checks had glass off). The hero now
  keeps its gradient in glass mode.

### `2026-10-20-6` — new look, native to each platform

The design from the Figma Make export, applied in stages. Only the look changed: every feature,
every figure and all stored data work exactly as before.

- **Colours.** Light and dark move from violet to teal (`#087E8B` / `#63D1DA`) with the Figma
  greys. Contrast checked: muted text is a touch darker than the export's so it passes AA, and dark
  mode uses dark text on its light-teal buttons (`--on-accent`). The other six colour schemes are
  unchanged.
- **The hero card** (this week / this month) is now a filled gradient with white type. Teal and dark
  set their own stops; every other scheme derives its gradient from its own accent (`--hero-a/b`).
- **Three looks, one foundation.** `data-platform` is set before first paint from the user agent
  (`ios` / `android` / `desktop`; `?platform=android` forces one, for checking). iOS keeps the soft
  floating tab bar and gets bordered rounded cards. Android gets Material 3: Roboto, outlined pill
  switches with a tonal selected state, pill buttons, and a full-width bottom bar with a highlighted
  icon. Desktop gets Segoe UI Variable, squarer 6–9 px corners and, from 900 px wide, a **left
  navigation pane** (the same five buttons, restyled) with **N** (new entry) and **/** (search)
  shortcuts that ignore typing and open sheets.
- Not done from the export: the sync indicator in the left pane and the per-platform bottom-sheet vs
  side-panel behaviour (sheets stay centred panels on desktop and bottom sheets on phones as before).

### `2026-10-20-5` — the token can't be used as the gist ID

- **Fixed:** pasting the token into the gist-ID box was accepted, so the device synced with nothing
  ("Could not reach GitHub") and showed the token on screen as its "gist ID". Both boxes now accept
  only a real gist ID (20–40 letters a–f and digits) and explain the mix-up otherwise.

### `2026-10-20-4` — Join another device's backup

- **New:** Settings → Data → *Join another device's backup*. Paste the other device's gist ID; it
  checks the ID opens, shows how many entries that backup has, then joins it (its settings win,
  anything logged here is added). The way back for a device that ended up on its own backup.

### `2026-10-20-3` — a blank gist ID no longer starts a second backup

- **Fixed:** leaving the "paste the gist ID" box blank (or dismissing it) silently created a new,
  empty cloud backup, so the device synced with nothing. It now asks first; Cancel forgets the
  token so you can paste it again and enter the ID. Happened on the Android phone during setup.

### `2026-10-20-2` — joining the cloud copy is safe

- **Fixed:** a new device that had changed any setting before you connected it counted as "newer"
  than the cloud copy, so its empty bills, default allowance day and month starts overwrote the
  real ones on every device. Joining (pasting the gist ID, or connecting with nothing logged) now
  defers to the cloud on everything but entries, which still merge one by one. Found while setting
  up the Android app and the desktop window; covered by test section 75.

### `2026-10-20-1` — budget, add a list of entries, desktop layout

- **Budget.** A card under savings ("Budget · November — R4 200 free · every line on track") opens a
  sheet: the money you expect, lines per category (several lines can share one, like four
  subscriptions), planned vs spent with a bar each, spending with no line, and what is still free.
  Add my bills, Copy last month, Clear. It is a plan only: the daily, weekly and monthly figures
  are unchanged, verified by test.
- **Add a list of entries** (Settings → Data). Paste `date, amount, category, note` lines (`+` for
  money received, `−` for a refund) or a JSON list. Every line is previewed; unknown categories,
  impossible or future dates and thousands commas are refused, and an amount already logged within
  a day, or a line repeated exactly, is held back unticked. One Undo for the whole import.
- **`tools/import.js`** (desktop) drives that same sheet against the cloud copy, so entries read
  from bank screenshots reach every device through the normal sync. See *Adding spending from the
  desktop* in `CLAUDE.md`.
- **Wide screens** get two columns and larger type; the phone layout is unchanged.
- **Fixed:** every checkbox in the app showed no tick, because the global input style stripped the
  native box. They now draw normally.

### `2026-10-06-1` — planned purchases

A list of big purchases, paid for from the savings vault in order, with a month-by-month
projection. Nothing new is stored as money: the vault is still the only pot.

- **Savings card** gets one line — "Next: *item* — R3 500 · short R500, ready 25 Oct", or "you have
  it", amber when the plan dips under the safety amount. Tapping it opens the **Planned
  purchases** sheet (no new tab).
- **The sheet** lists purchases (add, edit, reorder, skip, delete) and shows a table: for each pay
  cycle, the balance at its start, what is bought in it, what is left, and an editable "You save"
  that overrides the goal for that month. A month that ends under the safety amount is flagged.
- **Funded in order.** An item's "saved toward it" is what the vault holds after the items above it
  are paid; "ready" is the first cycle in which the vault plus expected saving covers it.
- **Only if the safety amount is left.** A conditional item that would leave less than the safety
  amount is shown as skipped in the projection and is not subtracted, so it cannot sink the
  months after it.
- **Bought it** asks what you actually paid, then logs one *Taken from savings* entry (capped at
  what the rand pot holds) and one spend in the new **Big purchases** category (Living group, so
  it counts against the day). The withdrawal goes through the normal `unsave` path, so the §7.2
  rule applies: the goal is not re-reserved. The money is moved once, not counted twice.
- **Sync and backup.** `mergeStores` now merges `plans` item by item (union by id, tombstones in
  `data.deleted`, newer `rev` wins per item) and unions `planSave`. `planBuf` follows the newer
  device like other settings. Old saves without these fields boot with defaults. The visibility
  and push paths now also adopt a plans-only change.
- **Not in the Share fork.** Main tracker only.

**Tests:** 425 → 456. Section 72 uses invented numbers and covers the projection, per-month
overrides, the buffer flag, conditional items, the next-up line, Bought it (one withdrawal, one
spend, no double count, goal not re-reserved), add/edit/reorder/delete, merge, and old data.

### `2026-09-24-2` — and it corrects itself on launch

`2026-09-24-1` changed what happens when you *log* an entry, but it did nothing for an entry
already sitting in the wrong state — that still needed a settings change or an edit-and-save.
That's the wrong shape for a fix: the app should notice by itself.

**What changed:**

- **`healForwardIncome()`, run once on launch.** Any income entry filed into a month later than
  its own date now moves that month's start onto the entry's date, and everything unpinned
  refiles. So an allowance logged before the old allowance day appears the moment the app opens,
  with nothing tapped. Taking an in-app update triggers this, because `hardRefresh()` reloads
  the page and boot runs again.
- **Two guards on the sweep.** It never touches a cycle earlier than the live one, so settled
  history can't be reshuffled by an old entry that was deliberately filed forward. And an entry
  carrying `hold: true` is skipped entirely.
- **`e.hold`** is set on an income entry when you pick a forward month *and untick* the
  "start the month from …" checkbox. That's the opt-out, and it now survives relaunches instead
  of being undone by the sweep. Saving the entry from the edit sheet clears the hold, since
  asking for it there is an explicit override.

**Tests:** 424 → 425. Section 71 now asserts the launch fix happens with no interaction, that a
relaunch is a no-op, and that a closed month filed forward months ago is left alone. New 71c
covers the `hold` opt-out surviving launch and the edit sheet overriding it on demand.

### `2026-09-24-1` — the month turns over when the money actually arrives

**The problem.** Pay arrived on 23 Sept and was logged with *Counts toward: October*. That filed
the money into the October cycle but left the boundary on the 25th, so on the 24th the money was
nowhere on the dashboard — "In this month" still read the old figure, and the allowance was being
computed off a month that had already ended in practice.

**What changed:**

- **Choosing "the next one" under Counts toward now starts that month on the entry's date.** It
  auto-ticks the "start the month from…" checkbox, so filing money forward *is* the statement
  that the month has turned over. Implemented in a new `incomeRow()` in `index.html`.
- **The same correction works from the edit sheet.** In `$('moveSave')`, an income entry whose
  cycle is later than its own date now moves that month's start to the entry's date and lets the
  entry refile. This is what makes an already-stranded entry fixable in place — open it, save it.
- **The checkbox label now names the month and follows the date field.** The income row used to
  be built once, when Received was tapped, and never rebuilt — so changing the date afterwards
  left the dropdown and the label describing the wrong day. The label read "Start the month from
  20 Sept" while the date field said the 28th. It now reads e.g. *"Start October from 23 Sept
  instead of the 25th"* and rebuilds on any date or month change.
- **Unticking the checkbox restores the old behaviour** — the money waits for the allowance day.
  A manual toggle is remembered (`startTouched`) and not overridden.
- An ordinary spend edit, or re-saving income already in the right month, moves nothing.

**Tests:** 398 → 424. New sections 70 (add form), 70b (opt-out), 70c (the row follows the date
field), 71 (the edit-sheet correction, on its own 24 Sept clock because the bug only exists
between payday and the allowance day), 71b (no boundary movement on ordinary edits).

**Known limitation, not fixed:** `data.starts` holds one anchor per calendar month. Being paid
twice in the same calendar month would overwrite the earlier boundary. A last-week-of-the-month
payday can't trigger this, since consecutive paydays always land in different calendar months.

### `2026-09-14-1` and earlier

See `TRACKER-PROJECT.md` for the architecture and the list of fixed bugs. In summary: the savings
goal no longer re-reserves money after a deliberate withdrawal; currency is configurable per
month and per savings pot (4 currencies, no EUR); investments live behind their own bottom tab;
rent and the like are hidden from the week view.
