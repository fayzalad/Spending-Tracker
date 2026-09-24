# Tracker

A personal spending tracker for one person. **One `index.html`** — markup, CSS and JavaScript in
a single file. No framework, no build step, no backend, no accounts. Installed to an iPhone Home
Screen from GitHub Pages.

`CLAUDE.md` is the complete project record — every feature, the full change history and an
append-only session log. **Start there.** This README is the release-facing view: what each piece
does and what changed in each build. `TRACKER-PROJECT.md` goes deeper on the architecture and on
bugs that must not be reintroduced — read it before changing the money maths.

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

**425 checks, all passing.** Run it before and after every change — it has caught genuine bugs
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
  deleted,                                    // tombstones, pruned at 120 days
  lastBackup, gistId, tok, rev, syncedRev,    // sync
  entries: []
}

entry = { id, amt, cat, note, date, cyc, type, refund, man, hold, cur, orig, rate }
```

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
