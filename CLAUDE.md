# Tracker — complete project record

The single canonical record of this project: what it is, what every part does, everything that
has been changed, and why. Written so a session that has lost its chat history can pick the
project up cold.

**A new session starts here, in `CLAUDE.md` — not in `README.md`.** The README is the public
page on GitHub and has no "Resume here" section; any instruction elsewhere pointing to one is out
of date. Update the README on every push with what changed (user-facing, keyed to the build stamp).

**Which file does what**

| File | Role |
|---|---|
| `CLAUDE.md` (this file) | Complete reference + append-only session log. Start here |
| `README.md` | Public-facing overview and dated changelog keyed to the build stamp |
| `TRACKER-PROJECT.md` | The original deep architecture doc. Still accurate on *how* it is built |
| `BUILD-SPEC.md` | From-scratch brief for rebuilding this kind of app. Requirements and traps, no personal preferences |
| `HANDOFF.md` | Sep-13 supplement, reconstructed from lost transcripts. **Untracked — holds an API key** |

Per the global "always record what you changed" rule: this project keeps its session log **here**,
in `CLAUDE.md`, rather than in `README.md`. The README changelog is user-facing and release-keyed;
the session log below is operational and append-only.

**Provenance note.** Everything dated before 2026-09-24 is reconstructed from git history,
`TRACKER-PROJECT.md` and `HANDOFF.md` — not from direct observation. The 2026-09-24 entries
onward were done directly and verified.

---

## 1. What it is

A personal spending tracker for one person. **One `index.html`** containing markup, CSS and
JavaScript — no framework, no build step, no backend, no accounts, no analytics. Served by GitHub
Pages and installed to an iPhone Home Screen as a PWA. All data lives in `localStorage` on the
device, with optional sync through a private GitHub Gist.

Owner: Fayzal, Gqeberha, South Africa. Primary currency rand.

## 2. The files

| File | Purpose |
|---|---|
| `index.html` | The entire app, ~3,730 lines |
| `test.js` | jsdom suite, `node test.js`. Boots the real `index.html` with a frozen clock |
| `sw.js` | Service worker. Network-first, `cache: 'reload'` on the document |
| `manifest.json` | PWA name, icons, standalone display |
| `icon-192.png`, `icon-512.png`, `icon-maskable.png` | Launcher icons |
| `package.json` | Dev-only; its single dependency is jsdom for the tests |

## 3. Running, testing, deploying

```bash
node test.js
```

**456 checks.** The suite boots the real `index.html` in jsdom with `Date` frozen (usually at
`2026-08-31`; some sections install their own clock because the bug under test only exists on a
particular date). It asserts on rendered DOM, not on internals. It has caught a dozen genuine
bugs that code review missed. Run it before and after every change.

Harness facts worth knowing:

- jsdom lacks `showModal`, `close`, `scrollIntoView`, `URL.createObjectURL` — all stubbed.
  **`close()` must dispatch a `close` event**, or dialog-driven behaviour silently passes.
- Seeds are plain objects written straight into `localStorage` under `slip:v4`.
- Sections 44, 71 and 71c install their own clocks (`2026-09-01`, `2026-09-24`).

**To deploy:** edit `index.html`, **bump the `slip-build` meta tag on line 7**, commit, push to
`main`. Pages redeploys in about a minute. A running app polls that tag and offers the update;
accepting it calls `hardRefresh()`, which clears caches, unregisters the service worker and
reloads.

## 4. The money model

```
available   = money in − money spent − money moved to savings
for living  = available − unpaid expected bills − savings goal not yet banked
today       = (for living + spent today) ÷ days left, minus spent today
this week   = today + one day's allowance for each remaining day of the week
this month  = for living, exactly
```

One rate drives all three figures so they cannot drift apart — they were computed separately once
and disagreed by a few rand. Today's figure going negative means "done for today", not "you owe
this".

Only categories on the **Kept out** list (default `Rent`, `Water / levies`) sit outside the daily
and weekly figures. Everything else — subscriptions, fibre, electricity — counts against the day.
Kept-out spending still reduces `available`; it just does not make a week look blown. Paying rent
*does* lower today's allowance, because the money is gone; it simply is not counted as *living*
spend for the bars and percentages.

## 5. The month model

Months run **allowance day to allowance day**, not calendar months, because that is when money
arrives. A cycle is **named for the month it ends in**: 25 Aug – 24 Sep is *September*.

- `data.day` — default allowance day, the fallback when a month has no explicit start
- `data.starts` — per-month overrides, `{'2026-09': '2026-09-23'}`. **One anchor per calendar
  month.** Setting one never affects another month
- `anchorFor(y,m)` returns that month's start; `cycStart(date)` picks the cycle a date falls in
- Entries auto-refile when a boundary moves, **unless** pinned by hand (`e.man = true`)

### Variable payday — the intended workflow

Payday lands somewhere in the last week of the month and differs every month, so `data.day` is
only ever an approximation. The workflow is: **log the allowance and set "Counts toward" to the
next month.** That files the money *and* starts the new month on the day it actually arrived.
Each month's end then auto-corrects when the following month's start is set — a cycle showing
28 Sept – 24 Oct stretches to 29 Oct by itself once pay lands on the 30th.

Money filed into a future cycle stays out of every current figure until that cycle opens, because
`carry` only pulls from cycles *earlier* than the current one. Logging ahead of payday is
supported and useful: the current month stretches to absorb the gap and the daily allowance drops
to match, which is the honest answer when payday slips later.

## 6. Data model

Storage key **`slip:v4`**; boot migrates from `v3` and `v2`. Renaming the key orphans every entry.

```js
data = {
  day, starts, goal, exclude, potCats, theme, glass,
  rates, ratesAt, cycCur, cycRate, homeCur,   // currency
  groups, cats, bills, incomes, ticks,
  holdings, invHist, invAt, avKey,            // investments
  deleted,                                    // tombstones, pruned at 120 days
  lastBackup, gistId, tok, rev, syncedRev,    // sync
  entries: []
}

entry = { id, amt, cat, note, date, cyc, type, refund, man, hold, cur, orig, rate }
bill  = { id, n, a, cur, zar, rate, zarManual, rateAt, cat, note, labels, every, month, spread }
holding = { id, n, kind, sym, cur, in, units, price, val, note, at }
```

- `amt` is **always in rand**; negative means a refund
- `cyc` is which cycle the entry belongs to; `man` means "I moved this by hand, leave it"
- `hold` marks income deliberately filed into a later month *without* moving the boundary — the
  launch sweep skips it
- `id` is `Date.now()` **plus a random suffix**; timestamps alone collided

**Use the entry-type helpers** — `isIn`, `isSave`, `isUnsave`, `isSpend`, `isBill`, `isLiving` —
never test `type` directly. Testing `e.type !== 'in'` is how savings movements once got counted
as spending.

## 7. Feature inventory

**Logging.** Three kinds: Spent, Received, Refund. A refund stores a negative `amt` with
`type:'out'`, so it reduces spending without counting as income. Amounts can be entered in a
foreign currency and are converted at that day's rate, then **never re-converted**. A repeat of
the same amount and category within 20 seconds asks before logging twice. Typing an amount
previews its cost in days of allowance.

**Savings.** The **goal** holds money back from the daily rate; the **vault** is money actually
moved. Money already banked counts toward the goal so it is not held back twice. A deliberate
withdrawal permanently lowers what is still protected this cycle rather than snapping the goal
back to unmet. When a month closes with money left the card offers to bank it, filed back into
the month it came from; if a backdated entry later pushes that month negative, the card flags the
shortfall and offers to pull the money back. Each pot keeps its own currency.

**Planned purchases (main tracker only).** A list of big purchases funded from the vault in
order, on the savings card (one "Next:" line) and a sheet with a month-by-month projection. Data:
`data.plans` (`{id,o,n,price,m,only,status,note,link,paid,at,rev}`), `data.planBuf` (safety
amount, default 1000), `data.planSave` (per-month expected saving; falls back to `data.goal`).
`m` is the month the target cycle is **named for** (`'2026-11'` = 25 Oct – 24 Nov); one in the
past means "now". Only the **rand pot** counts: plans are in rand and Bought it can only withdraw
rand. Funding is in order (an item's saved/missing is the vault minus the items above it);
"ready" is the first cycle where vault + expected saving covers it (plus the safety amount for an
`only` item). The projection buys each item at the **start** of its target cycle; a cycle's
saving lands at the start of the next. A conditional (`only`) item that would leave under the
safety amount is shown skipped and not subtracted. **Bought it** = one `unsave` (capped at the
rand pot) + one `out` spend in **Big purchases** (Living group), through the normal paths, so the
§7.2 withdrawal rule holds. Sync: `mergeStores` merges plans item by item with tombstones and the
per-item `rev`. Real plan amounts live only in the user's `localStorage`, never in the repo.

**Expected bills.** Unpaid ones are reserved off the top so the daily figure is honest from day
one. A payment ticks one off when the category matches and the amount is within 25%; an entry
whose note names the bill wins outright. **One payment settles exactly one bill.** Bills can be
yearly, appearing only in their month, optionally **spread** so a twelfth is held back in the
other eleven. A bill can be marked paid without logging, for something that came off another
account. Foreign-currency bills lock their rand figure at save time. Payment **labels** let one
entry say what it covered, and an optional **split** peels the excess off onto another category.

**Recurring income.** A nudge only — never auto-logged, never reserved. Matched on amount alone.

**Currency.** Four currencies (R, £, $, ₵) in the personal build. A cycle's currency is a display
layer; the ledger stays in rand, converted through a rate frozen at `data.cycRate` the moment the
currency was chosen, so a closed month never drifts when the rate table is edited later. Rates
refresh from `open.er-api.com` and are editable by hand.

**Investments.** Completely separate from the spending maths, verified by test, behind its own
bottom tab. Prices best-effort: CoinGecko for crypto (in the holding's own currency), Alpha
Vantage for shares and ETFs, spaced ~1.1s apart for its burst limit. One snapshot a day into
`invHist` gives a trend against roughly a month ago. Per-holding currency; a mixed portfolio
falls back to a raw rand sum for the total rather than adding unlike numbers.

**Receipts.** No image storage — photos could never fit the ~5MB budget. iOS Live Text does the
OCR; paste the text in and the parser pulls out the total (preferring a line saying "total",
ignoring subtotal and VAT, else the largest amount), the date in several formats, the merchant,
and a category guess from a list of SA retailers. It fills the form rather than logging silently.

**History and exports.** Search covers everything ever logged. The Months sheet steps through
every closed cycle with a category recap. CSV per month or everything. PDF is **generated by
hand** — `window.print()` does nothing inside an iOS Home Screen app — writing real PDF objects,
a content stream, an xref table and a trailer, with pagination and repeated headers.

**Sync.** Entry-by-entry merge, not last-write-wins. Union by id, deletions honoured via
tombstones, newer `rev` wins on a conflicting edit. Two devices logging offline keep everything
from both. The token needs only the `gist` scope and is stripped from downloaded backups.

**Interface.** Bottom floating capsule bar (Add, Search, Months, Invest, Settings) that shrinks
while scrolling down. Header collapses past 110px. Every sheet has a grab handle and a nav bar —
× at top level, ‹ when stacked — and drags down to dismiss with velocity-aware physics, so a
quick flick dismisses short of the 110px threshold while a stale velocity after a pause does not.
Eight colour schemes plus an optional frosted-glass mode that stands down when iOS has Reduce
Transparency on. Convention: raised or tinted means pressable, flat outline means information.

## 8. The two repos

| | Personal | Share |
|---|---|---|
| Remote | `fayzalad/Spending-Tracker` | `fayzalad/Spending-Tracker-Share` |
| Working clone | `Claude code/Spending tracker` | `Claude code/Spending tracker (Share)` |
| Currency | R / £ / $ / ₵, `homeCur` ZAR | **GBP only**, `homeCur` GBP |
| Default allowance day | 25 | 1 |
| Investments | Yes | Removed |
| Locale | `en-ZA` | `en-GB` |
| Tests | 456 | 355 |
| README | Technical reference + changelog | Plain-language guide for the friend |

Independent history — a commit in one never touches the other. Changes are ported by hand. The
share fork kept the "default currency" setting and the first-time user guide; the personal repo
reverted those and re-applied a subset.

## 9. Complete change history

### September 5 — overhaul

`3509f3e` snapshot before the work. `8d10ee3` fixed the suite to run locally. Then a staged
overhaul: `058f6ff` deduped search row rendering and debounced the All-entries filter; `97db2c1`
paired colour-only signals with text and announced dynamic regions to screen readers; `f499524`
added the live days-of-allowance preview while typing; `cc46965` added a nudge for a bill nobody
logged; `8edb074` added the category breakdown to the closed-month recap; `9cab864` made the
statement PDF keep cents, matching the CSV, for reconciling against a bank statement; `e217ca4`
added recurring income, nudged not auto-logged; `d24de74` made a failed price fetch name the
symbols it could not reach; `851d08f` gave sheet drag-to-dismiss velocity-aware spring physics.
`1a90261`, `e9a1242`, `74fe1b6` restored the README and PWA files and bumped the stamp.

### September 6 — investments

`8148f0a` auto-refreshes prices once a day on open, since a PWA cannot run in the background.
`58dfaaa` replaced Stooq with Alpha Vantage — Stooq's CSV endpoint was discontinued and never
sent CORS headers, so it could never have worked from a browser. `96a1a53` gave each holding its
own currency so USD stays USD. `cc938c7` fixed the symbol format and a rate-limit collision.

### September 11 — investments move out

`c61617f` moved Investments to its own bottom-tab sheet — it is not day-to-day, so it is out of
the main flow — and fixed two real bugs found while auditing the move.

### September 12 — configurable currency, reverted, re-applied

Built in stages: `332aab4` EUR as a fifth currency, `693b43b` per-month main currency, `ca38881`
savings pots with their own currency, `adfbd3f` regression fixes from auditing that rewrite,
`aa040da` hiding Rent & the like from the week view, `e263620` a first-time user guide, `6e451a2`
a default currency.

Then `2d8c2a1` **reverted the whole day**, and a chosen subset was re-applied under new hashes:
`027b148`, `2733a19`, `ecaf59f`, `26c516b`, `7df8f32`, and finally `71aa608` which dropped EUR
while keeping the per-month and per-pot currency work. **Net result: four currencies, no EUR, no
default-currency setting** — which is why the allowance day still defaults to the 25th. This is
the single most confusing stretch of the history.

### September 14 — the savings-goal bug

`663619e`. Reported as "I took out 3500 from my savings to buy something but it didn't record it
and now I'm very in the negative." Not data loss: saving toward the £3,500 goal correctly stopped
reserving it, but **withdrawing made the goal unmet again, so the app immediately re-reserved the
same £3,500**. The withdrawal freed zero spendable money, and the purchase came out of protected
funds. Fixed so a deliberate withdrawal permanently lowers what is protected toward that cycle's
goal.

### September 24 — the month turns over when the money arrives

`6e3ebf2` made filing money forward move the month boundary onto the entry's date; `85ae64a` made
a stranded entry correct itself on launch. Full detail in the session log below.

## 10. Bugs fixed — do not reintroduce

1. **`cycEnd(t)` instead of `cycEnd(cs)`.** The worst one. `cycEnd` takes a *cycle start*, not an
   arbitrary date. From the 1st of a month until the allowance day, today and the cycle start sit
   in different months, so the cycle looked ~30 days longer. On 1 September the daily allowance
   read R98 instead of R295. Every test froze at 31 August, where the two share a month.
2. **A version check that matched its own source.** A regex written in the page found itself and
   showed an update banner forever. Use `DOMParser`.
3. **IDs from `Date.now()` alone collide.** Two bills added in the same millisecond shared an id,
   so editing one edited both.
4. **`innerHTML` after `appendChild` wipes the child.** An undo button never appeared.
5. **Rebuilding a `<select>` resets the user's choice.** Track it in a variable.
6. **`position: sticky` pins to the viewport, not the padding box.** The safe-area inset must live
   on the sticky element.
7. **A zero-length round-capped SVG arc renders as stray dots.** Rings became horizontal bars.
8. **iOS Home Screen apps have separate storage and cache from Safari** (16.4+). A fix visible in
   Safari can still be stale in the installed app.
9. **Deleting the Home Screen icon deletes the data.** Never suggest re-adding it as a fix.
   Renaming the repo orphans the data too — storage is per-origin.
10. **Date inputs inside `<dialog>` may not fire `change` when dismissed.** Settings commit on
    dialog close, not only on change.
11. **A hidden flex cell still occupies its slot**, so `:first-child` alignment hit the wrong
    column.
12. **Label max-height must account for line-height** or the text clips.
13. **Money swept to savings was counted both as saved and as left over** in month summaries.
14. **One payment settling several bills.** A single R210 cleared both iCloud (R200) and Netflix
    (R230) and released money that was never spent.
15. **The income row was built once and never rebuilt**, so changing the date afterwards left the
    month dropdown and the checkbox label describing the wrong day. Fixed 2026-09-24.

## 11. Known gaps and limitations

- **One month start per calendar month.** `data.starts` is keyed `YYYY-MM`, so being paid twice in
  one calendar month would overwrite the earlier boundary. A last-week payday cannot trigger this,
  since consecutive paydays land in different months. Not fixed — it is a data-model property, and
  fixing it means changing `anchorFor`.
- **The launch sweep runs at boot only**, not on the visibility-change sync. An entry synced in
  from another device while the app is open is healed on the next launch, not immediately.
- **Android is far behind** — a Java WebView wrapper in `Android-Tracker`, 9+ builds back, built
  locally because a $0 Actions budget blocks CI.
- **"Bills" means two things**: the chart hatches the *Bills group*, the daily figures exclude the
  *Kept out* list. They can disagree.
- **No month-end recap** beyond the history sheet.
- **Investment price fetching is only partly tested** against the live APIs.
- **Display rounds to whole rands.** Stored values keep cents; the CSV and PDF entry list keep them
  too, for reconciling against a bank statement.
- **Accessibility unaudited.** Amber-vs-green carries meaning in places with no second signal.
- **One 3,700-line file**, and `render()` recomputes everything on every keystroke in search.

## 12. Deliberately not in git

- `HANDOFF.md` — contains the Alpha Vantage key in plaintext. Both repos are public.
- `full-transcript-part1.txt`, `full-transcript-part2.txt` — 385KB of raw session logs, and they
  repeat that key five times. Superseded by this file.
- `.agents/`, `.claude/`, `node_modules/`, `skills-lock.json`, `investments/` — gitignored.

---

## Session log

Newest first. Append-only: never rewrite or delete an older entry. If a later change undoes an
earlier one, record the undo as its own entry.

### 2026-10-06 — Planned purchases (build `2026-10-06-1`, DESKTOP)

- **Changed:** Added the Planned purchases feature in `index.html`: `data.plans` / `planBuf` /
  `planSave` (defaults in the `data` literal and in `boot`), `planProject()` projection, a "Next:"
  line on the savings card (`#planLine`), three sheets (`planDlg`, `planEdit`, `planBuy`), a
  **Big purchases** built-in category in the Living group (icon 🛋), item-by-item merge of `plans`
  and union of `planSave` in `mergeStores`, and the visibility/push sync paths now also adopt a
  plans-only change. Build stamp bumped to `2026-10-06-1`. Added section 72 to `test.js` (31
  checks, invented numbers only). README: data-model note, test count, changelog entry.
- **Why:** Requested from the Decisions handoff (read in place, not copied into the repo): hold the
  user's buying plan and answer what is next, whether it is affordable, and whether the plan stays
  above a safety amount. User's choices: starting savings already in the vault; savings card +
  sheet, no new tab; expected saving defaults to the goal with per-month overrides; Bought it is a
  withdrawal plus a spend; main tracker only; category **Big purchases** in Living.
- **Files:** `index.html`, `test.js`, `README.md`, `CLAUDE.md`
- **Revert:** `git revert` the feature commit, then bump `slip-build` and push. Saved `plans`
  fields in `localStorage` are harmless to an older build (it carries unknown fields through).
- **Verified:** `node test.js` 456 passed, 0 failed (425 before). The two "Not implemented:
  navigation" lines in the output are pre-existing (same count on the stashed baseline). Looked
  at in the browser pane at 375px, dark mode, with invented data: the list rows were cramped, so
  the buttons were moved under the text; the month table reads fine. Not tried on the phone itself.
- **Known limits:** only the rand pot funds plans; a month override is keyed by the cycle's
  naming month; `planSave` is unioned per key (newer device wins) so a cleared override can come
  back from the other device, and `planBuf` is last-write-wins.

### 2026-10-06 — Pulled `main-h0rr3u` onto local `main` (DESKTOP)

- **Changed:** `git pull --ff-only origin main-h0rr3u`, fast-forwarding local `main` from `9ae64be`
  to `546e69f`. This brings down the cloud session's `CLAUDE.md` update only. The local-machine
  audit steps it lists (skill deletions, parent `CLAUDE.md` edit) are **not done yet**.
- **Why:** Requested, to get the cloud session's `CLAUDE.md` change onto this machine before
  planning the Planned purchases feature.
- **Files:** `CLAUDE.md` (via the pull), local `main` ref
- **Revert:** `git reset --hard 9ae64be` (local only; nothing was pushed)
- **Verified:** `git log` shows `546e69f` at HEAD; diff is `CLAUDE.md` only (+20 lines).

### 2026-10-04 — Acted on the prompt audit: CLAUDE.md is the starting point

- **Changed:** Stated at the top of this file that a new session starts here, not at the README,
  and that the README is updated on every push. Owner's choices on the rest of the audit, to be
  applied on the local machine (not reachable from the cloud session): delete the project-level
  skill copies (`.claude/skills`, `.agents/skills`) and keep the user-level ones; remove the
  `modern-web-design` skill; remove the 43 OmniRoute skills (`omni-*`, `cli-*`,
  `config-codex-cli`); in `Claude code/CLAUDE.md`, point the start-here line at this file and drop
  the every-5-hours README rule. `interview-me` rewrite: not chosen, left as is.
- **Why:** The parent folder's note sent new sessions to a README "Resume here" section that does
  not exist, and two rules disagreed on when to update the README. Owner picked option (b) and
  "every push".
- **Files:** `CLAUDE.md`
- **Revert:** `git revert` this commit
- **Verified:** Docs-only change; `node test.js` unaffected. Local-machine steps not yet done.

### 2026-10-04 — Locally excluded the key-holding files; moved session to cloud

- **Changed:** Appended `HANDOFF.md`, `full-transcript-part1.txt`, `full-transcript-part2.txt` to
  `.git/info/exclude` (machine-local ignore, never committed), so the working tree reads clean and
  the session could move to a Claude Code cloud session. The files themselves are untouched and
  stay on this machine only. Also ran a prompt audit of the loaded configuration; its findings
  were reported, not applied.
- **Why:** The move-to-cloud check refuses a working tree with untracked files, and these three
  must never be committed — they hold the Alpha Vantage key and the repo is public.
- **Files:** `.git/info/exclude` (local, not in the repo), `CLAUDE.md`
- **Revert:** delete the last four lines of `.git/info/exclude`
- **Verified:** `git status --short` empty afterwards.

### 2026-09-25 — Added BUILD-SPEC.md, a from-scratch specification

- **Changed:** Wrote `BUILD-SPEC.md`: a build-from-scratch brief for this kind of app. Numbered
  MUST/SHOULD/MAY requirements for the money model and the period model, functional and
  non-functional requirements, a decision log of ten choices the original made with what you lose
  by diverging from each, a 19-entry bug catalogue written as symptom + cause + invariant, the
  testing strategy, a staged build order, an acceptance checklist, and an explicit list of what
  was stripped. Owner-specific choices are excluded throughout — no currency, income day, savings
  amount, category list, merchant patterns, palette, investments, sync provider or repo names.
- **Why:** Requested, to start a fresh session and see how the app would be built differently.
  The point is to carry the hard-won knowledge across without carrying the personal preferences,
  so a new build can diverge on the choices while still avoiding the known traps.
- **Files:** `BUILD-SPEC.md` (new), `README.md` (pointer line)
- **Revert:** `git rm BUILD-SPEC.md && git commit`
- **Verified:** Every bug-catalogue entry traced back to a real commit, a fixed-bug list in
  `TRACKER-PROJECT.md`, or a failure observed in this session. Not committed to the share fork —
  it is implementation-neutral and would duplicate.

### 2026-09-25 — Created CLAUDE.md as the canonical project record

- **Changed:** Wrote this file — complete reference (architecture, money model, month model, data
  model, full feature inventory, both repos, commit-by-commit history, fixed bugs, known gaps)
  plus this append-only session log. Chose `CLAUDE.md` over appending to `README.md`, because the
  README changelog is user-facing and release-keyed while this log is operational; stated that
  choice at the top of the file.
- **Why:** Requested — "a file explaining every single thing we have done to this tracker, so all
  edits all features and all are known". Also satisfies the global always-record rule, which asks
  for `CLAUDE.md` in the project root unless an existing file already serves that purpose.
- **Files:** `CLAUDE.md` (new)
- **Revert:** `git rm CLAUDE.md && git commit`
- **Verified:** Commit history cross-checked against `git log` for both repos; currency sets,
  default allowance days and locales confirmed by reading `index.html` in each. Pre-2026-09-24
  history is reconstructed from git and the existing docs, not observed.

### 2026-09-24 — A stranded allowance turns the month over on launch

- **Changed:** Added `healForwardIncome()`, run once from `boot()`. Any income entry filed into a
  month later than its own date moves that month's start onto the entry's date and lets everything
  unpinned refile. Two guards: it never touches a cycle earlier than the live one, so settled
  history cannot be reshuffled; and an entry carrying `hold: true` is skipped. `e.hold` is written
  in `add()` when you pick a forward month and untick the start-the-month checkbox — the opt-out
  now survives relaunches. `moveSave` deletes `hold`, since asking there is an explicit override.
  Build stamp `2026-09-24-2`.
- **Why:** The earlier fix that day only changed what happens when you *log* an entry. The entry
  already recorded the old way still needed a settings change or an edit-and-save, which is the
  wrong shape for a fix — the app should notice by itself. Reported as "I wanted it to move on its
  own without me having to go change a setting".
- **Files:** `index.html`, `test.js`, `README.md` in both repos. Personal `85ae64a`, share
  `888024e`
- **Revert:** `git revert 85ae64a` (personal), `git revert 888024e` (share), then bump the build
  stamp and push
- **Verified:** 425 tests personal, 355 share, all passing. Section 71 asserts the fix lands with
  nothing tapped, that relaunching is a no-op, and that a closed month filed forward months ago is
  left alone; 71c covers the `hold` opt-out surviving launch and the edit sheet overriding it.
  Both Pages sites polled until they served `2026-09-24-2`.

### 2026-09-24 — Filing money forward turns the month over on the day it arrived

- **Changed:** Extracted `incomeRow()` and `startRow()` in `index.html`. Choosing "the next one"
  under Counts toward now auto-ticks the "start the month from …" checkbox, so the new month
  starts on the entry's date. The income row rebuilds on any date or month change instead of being
  built once when Received is tapped, and the checkbox label now names the month being started as
  well as the day. The same correction runs from the edit sheet in `moveSave`, so an entry already
  logged the old way is fixed by opening it and saving. Unticking the box keeps the old behaviour,
  and a manual toggle is not overridden (`startTouched`). Build `2026-09-24-1`. `README.md`
  rewritten from a one-line stub into the recovery doc.
- **Why:** Pay arrived 23 Sept and was logged with "Counts toward: October", but the boundary
  stayed on the 25th, so on the 24th the money was invisible and the allowance was still spread
  over a month that had really ended. Payday is not fixed — it lands somewhere in the last week
  and differs every month — so the allowance day is only ever an approximation.
- **Files:** `index.html`, `test.js`, `README.md` in both repos. Personal `6e3ebf2`, share
  `70d4a49`
- **Revert:** `git revert 6e3ebf2` (personal), `git revert 70d4a49` (share), then bump and push
- **Verified:** 398 → 424 tests personal, 329 → 351 share. New sections 70, 70b, 70c, 71, 71b.
  The behaviour was reproduced in jsdom against the reported dates before the change was written.
  One test seed initially failed and exposed the one-anchor-per-calendar-month limitation; that
  seed was unrealistic (two paydays three days apart) and was fixed, not the code.
