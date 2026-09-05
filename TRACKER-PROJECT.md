# Tracker — project handoff

A personal spending tracker for one person. Single HTML file, no framework, no build step,
no backend. Installed to an iPhone Home Screen from GitHub Pages, with a separate Android
build. This document is written so a fresh session can pick the project up cold.

**Owner:** Fayzal, Gqeberha, South Africa. Everything is in ZAR.
**Current build:** `2026-09-01-25` (stamped in a `<meta name="slip-build">` tag).
**Tests:** 309 checks, all passing.
**Size:** ~3,300 lines, ~160KB, one file.

---

## 1. Files and where they live

| File | Purpose | Changes often? |
|---|---|---|
| `index.html` | The entire app — markup, CSS and JS in one file | Yes, every time |
| `manifest.json` | PWA name and icons | Rarely |
| `sw.js` | Service worker. Network-first, `cache: 'reload'` on the document | Rarely |
| `icon-192.png` `icon-512.png` `icon-maskable.png` | Launcher icons | Rarely |
| `test.js` | jsdom test suite, run with `node test.js` | With every change |

**iPhone:** repo `Spending-Tracker`, public, Pages from `main` / root. Violet palette.
**Android:** repo `Android-Tracker` — a Java WebView wrapper around the same app in a
cream-and-red design. Currently **9+ builds behind** and untouched by recent work.
GitHub Actions is blocked on the account by a $0 Actions budget that can't be changed
without a card on file, so the APK is built locally in Android Studio.

### Deploying

Edit `index.html`, **bump the `slip-build` meta tag**, upload with the lowercase filename
(Pages ignores `Index.html`), commit. Pages redeploys in about a minute and the running app
detects the new build stamp and offers an update.

---

## 2. Testing — read this before changing anything

`test.js` boots the real `index.html` inside jsdom with a frozen clock and asserts on
rendered DOM output. It has caught a dozen genuine bugs that code review missed, including
two in the same session they were introduced. **Run it after every change.**

```bash
cd /path/to/project && node test.js     # ~30s, prints "309 passed, 0 failed"
```

Conventions in the suite:

- The clock is frozen at `2026-08-31` via a `Date` subclass in `beforeParse`.
- Section 44 deliberately freezes at `2026-09-01` instead, because a real bug only appeared
  when today and the cycle start fell in different calendar months.
- jsdom lacks `showModal`, `close`, `scrollIntoView` and `URL.createObjectURL` — all stubbed.
  **`close()` must dispatch a `close` event**, or dialog-driven behaviour silently passes.
- Seeds are plain objects written straight into `localStorage` under `slip:v4`.

When a test fails, decide whether the app or the expectation is wrong. Several times the
test was wrong and correcting it clarified the intended behaviour.

---

## 3. The money model

This is the heart of it. Get this wrong and everything downstream lies.

```
available   = money in − money spent − money moved to savings
for living  = available − unpaid expected bills − savings goal not yet banked
today       = (for living + spent today) ÷ days left, minus spent today
this week   = today + one day's allowance for each remaining day of the week
this month  = for living, exactly
```

The goal is that the money lasts until the day before the next allowance, with bills paid
and the savings goal intact. Spend more today and every remaining day tightens slightly;
spend nothing and tomorrow rises because the same money divides across one fewer day. Today's
figure can go negative — that means "done for today", not "you owe this".

**One rate drives all three figures.** They were separately computed once and drifted by a few
rand; unifying them is why `this month` now equals `for living` by definition.

### What sits outside

Only categories on the **Kept out** list are excluded from the daily and weekly figures.
Default `['Rent', 'Water / levies']`. Everything else — subscriptions, fibre, electricity —
counts against the day. Excluded spending still reduces `available`; it just doesn't make a
week look blown. An earlier version excluded the whole Bills group and the daily figure lied
about how much was really free.

Note the subtlety: paying rent **does** reduce today's allowance, because the money is gone.
It just isn't counted as *living* spend for the bars, percentages and pace. If rent is set up
as an expected bill it was already reserved, so paying it changes nothing at all.

---

## 4. The month is not a calendar month

Months run allowance day to allowance day (default the 25th), because that's when money
arrives — a few days before month end so rent can be paid.

- A cycle is **named for the month it ends in**. 25 Aug – 24 Sep is **September**, because
  that is what it pays for. Naming it "August" once caused money to be filed into the wrong
  cycle and broke every downstream number.
- Money added **before** the allowance day counts toward the month you're in; on or after, it
  starts the next. There's a per-entry override dropdown.
- Any single month's start can be moved — a checkbox when logging income, or in settings.
  Stored per year-month in `data.starts`, e.g. `{'2026-08': '2026-08-28'}`. It never affects
  other months.
- Entries auto-refile when a boundary moves, **unless** moved by hand (`e.man = true`).

### The cycle-end bug — do not reintroduce

`cycEnd()` takes a **cycle start**, not an arbitrary date. `calc()` once called `cycEnd(t)`
with today's date. From the 1st of a calendar month until the allowance day, today and the
cycle start sit in different months, so the cycle looked ~30 days longer than it was. On
1 September the daily allowance read R98 instead of R295 and the week showed −R67 instead of
+R1,116. The tell was two tiles disagreeing: "28 Aug – 24 Sep" against "month ends 24 Oct".
Every test froze at 31 August, where the two dates share a month, so nothing caught it.

---

## 5. Data model

Storage key **`slip:v4`**. Boot migrates from `v3` and `v2`.

```js
data = {
  day: 25,                              // allowance day
  starts: {'2026-08': '2026-08-28'},    // per-month start overrides
  goal: 3500,                           // monthly savings goal
  exclude: ['Rent','Water / levies'],   // out of the day-to-day figures
  potCats: [],                          // what counts as food (falls back to a default list)
  theme: 'auto',                        // 8 schemes
  glass: false,                         // frosted surfaces
  rates: {ZAR:1, GBP:21.83, USD:16.13, GHS:1.4464}, ratesAt: '2026-08-31',
  groups: [],                           // [{n}] — organisational only
  cats: [],                             // [{n, g, i}] name, group, icon
  bills: [],                            // see below
  holdings: [], invHist: [], invAt,     // investments
  deleted: {id: timestamp},             // tombstones, pruned at 120 days
  ticks: {'2026-08-28': ['billId']},    // bills marked paid without an entry
  lastBackup, gistId, tok, rev, syncedRev,
  entries: []
}

entry = {
  id, amt,            // amt is ALWAYS in ZAR; negative means a refund
  cat, note, date,    // date is 'YYYY-MM-DD'
  cyc,                // which cycle it belongs to
  type: 'in' | 'out' | 'save' | 'unsave',
  refund: true,       // set on refunds (type stays 'out', amt is negative)
  man: true,          // moved by hand — survives re-filing
  cur, orig, rate     // only when entered in a foreign currency
}

bill = {
  id, n, a,           // a is in the bill's own currency
  cur, zar, rate,     // zar is LOCKED at save time and never re-converts
  zarManual, rateAt,
  cat, note,
  labels: ['Rent + refuse', 'Rent + refuse + water'],
  every: 'month' | 'year',
  month: 5,           // for yearly: the calendar month it is charged
  spread: true        // yearly: hold back a twelfth in other months
}

holding = { id, n, kind: 'etf'|'stock'|'crypto'|'cash'|'other',
            sym, in, units, price, val, note, at }
```

### Entry type helpers — use these, never test `type` directly

```js
isIn(e)     // money arriving
isSave(e)   // moved into savings
isUnsave(e) // taken back out
isSpend(e)  // anything else — real spending
isBill(e)   // isSpend AND category is on the exclude list
isLiving(e) // isSpend AND not excluded
```

Testing `e.type !== 'in'` directly was how savings movements got counted as spending. There
are helpers for a reason.

---

## 6. Features, and the reasoning behind them

### Savings
The **goal** holds money back from the daily rate; the **vault** is money actually moved,
recorded with a tap. Conflating them confused things badly once. Money already banked counts
toward the goal so it isn't held back twice — banking R3,500 early leaves the daily rate
unchanged, which is the whole point.

When a month closes with money left, the card offers to bank it, filed back into the month it
came from so leftovers stop rolling forward. If a backdated entry later pushes that month
negative, the card flags the shortfall and offers to pull the money back out — and files that
withdrawal into the month it repairs, not the current one.

The card shows **this month** first, then the running total.

### Expected bills
Unpaid ones are reserved off the top so the daily figure is honest from day one. A payment
ticks one off when the category matches and the amount is within 25%.

**One payment settles exactly one bill**, best match first, and an entry whose note names the
bill wins outright. Without that, a single R210 payment cleared both iCloud (R200) and
Netflix (R230) and released money that was never spent.

Foreign-currency bills store the rand figure **at save time** along with the rate and date.
Daily rate refreshes never move an already-converted amount. Same for entries.

Bills can be **yearly**, appearing only in their month, optionally **spread** so a twelfth is
held back in the other eleven. The spread only keeps money out of the daily rate; it doesn't
move anything, so pairing it with a savings transfer is the honest version.

Bills can be **marked paid without logging** (the ✓ next to Log it) for something that came
off another account. Releases the reserve, deducts nothing, reads "marked paid, not recorded
here", and can be undone.

### Rent and water — the owner's actual arrangement
Rent is R9,000 + R145 tenant service fee + R201.65 refuse = **R9,346.65**. Water and sewerage
is billed **monthly on usage**, sometimes on the rent invoice and sometimes separately. Payment
is by bank transfer, so PayProp's R19.32 digital channel fee doesn't apply.

Two mechanisms handle this: **payment labels** on a bill (pick "Rent + refuse" or
"Rent + refuse + water" when logging, so one entry says what it covered), and an optional
**split** on the pay sheet when the amount exceeds the expected figure. Water is also its own
expected bill and its own Kept-out category, so paying it separately never reads as paying
rent twice.

### Receipts
There is **no image storage**. An earlier version compressed and stored photos; it could never
fit the ~5MB browser budget and was removed deliberately.

Instead: iOS Live Text does the OCR. Open the photo in Photos, hold the text, Select All,
Copy, then paste into **Read a receipt**. The parser pulls out the total (preferring a line
that says "total", ignoring subtotal and VAT, else the largest amount), the date in several
formats, the merchant, and guesses a category from a list of SA retailers. It fills the entry
form rather than logging silently.

### Investments
Completely separate from the spending maths — verified by test. Holdings carry what you put
in and what they're worth, optionally units × price. **Update prices** is best-effort:
CoinGecko for crypto (allows browser requests), Stooq for shares and ETFs. Neither could be
tested from the build container, so treat manual values as the reliable path. One snapshot a
day into `invHist` gives a trend against roughly a month ago.

### Sync
Entry-by-entry merge, not last-write-wins. Union by id, deletions honoured via tombstones,
newer `rev` wins on a conflicting edit and on settings. Pulls on launch and on returning to
the app, pushes a few seconds after any change. Two devices logging offline keep everything
from both. Token needs only the `gist` scope and is stripped from downloaded backups.

### Exports
CSV per month or everything. PDF is **generated by hand** — no library — because
`window.print()` does nothing inside an iOS Home Screen app. `buildPdf()` writes objects, a
content stream, an xref table and a trailer. It draws text, filled rectangles and rules,
paginates, and repeats a header on continuation pages. Verified by rendering with `pdftoppm`
and reading back with `pypdf`.

---

## 7. Interface

- Bottom **floating capsule** bar: Add, Search, Months, Settings. Inset from the edges,
  `bottom: max(6px, calc(env(safe-area-inset-bottom) - 22px))`, 26px radius. Shrinks to icons
  while scrolling down, reopens on scroll-up or after 1.4s idle. Active destination gets a
  tinted pill.
- Header collapses past 110px, leaving the week/month toggle pinned.
- Every sheet has a grab handle and a nav bar: **×** at the top level, **‹** when stacked on
  another sheet. Drag the handle or title bar down past 110px to dismiss.
- Settings is five tabs: Month, Rules, Bills, Look, Data.
- Eight colour schemes plus an optional frosted-glass mode that stands down when iOS has
  Reduce Transparency on.
- Convention: **raised or tinted means pressable; flat outline means information only.**

Chart bars: solid is discretionary, hatched is a bill, torn top means the day ran past the
axis, red only when the *discretionary* part exceeds the daily allowance.

---

## 8. Bugs already fixed — do not reintroduce

1. **`cycEnd(t)` instead of `cycEnd(cs)`** — see §4. The worst one.
2. **A version check that matched its own source.** The first update checker searched the page
   text with a regex written in that same page, found itself, and showed an update banner
   forever. Use `DOMParser`.
3. **IDs from `Date.now()` alone collide.** Two bills added in the same millisecond shared an
   id, so editing one edited both. Everything gets a random suffix.
4. **`innerHTML` after `appendChild` wipes the child.** An undo button never appeared for this
   reason.
5. **Rebuilding a `<select>` resets the user's choice.** "Keep it all as Rent" silently
   reverted to the default until the choice was tracked in a variable.
6. **`position: sticky` pins to the viewport, not the padding box.** The header slid under the
   status bar on scroll. The safe-area inset must live on the sticky element.
7. **A zero-length round-capped SVG arc renders as stray dots**, and a dash pattern shorter
   than the circumference repeats them. Rings were replaced with horizontal bars.
8. **iOS Home Screen apps have separate storage and cache from Safari** (16.4+). A fix visible
   in Safari can still be stale in the installed app.
9. **Deleting the Home Screen icon deletes the data.** Never suggest re-adding it as a fix.
   Renaming the repo orphans the data too — storage is per-origin.
10. **Date inputs inside `<dialog>` may not fire `change` when dismissed.** Settings commit on
    dialog close, not only on change.
11. **A hidden flex cell still occupies its slot**, so `:first-child` alignment applied to the
    wrong column.
12. **Label max-height must account for line-height** or the text clips.
13. Money swept to savings was counted both as "saved" and as "left over" in month summaries.

---

## 9. Naming — internal vs visible

The app is called **Tracker**. Two things deliberately still say "slip":

- **`slip:v4`**, the storage key. Renaming it orphans every entry.
- **`slip-build`**, the update-check meta tag. A device running an older build looks for that
  exact name; rename it and the running app never sees another update.

---

## 10. Known gaps

- **Android is far behind** and needs a re-merge of the design layer onto current logic.
- **"Bills" means two things**: the chart hatches the *Bills group*, the daily figures exclude
  the *Kept out* list. They can disagree if a non-Bills category is added to Kept out.
- **No month-end recap** beyond the history sheet.
- **"Days of allowance per order"** only appears after spending, not while typing an amount,
  which is when it would change a decision.
- **No nudge** when a bill hasn't been logged — water in particular can sit unlogged.
- **No recurring income**; the allowance is retyped each month.
- **Investment price fetching is untested** against the live APIs.
- **Display rounds to whole rands** everywhere. Stored values keep cents exactly and totals
  round the true sum, so nothing compounds — but a statement check wants the CSV.
- **Accessibility unaudited.** Amber-vs-green carries meaning in places with no second signal.
- **One 3,300-line file**, and `render()` recomputes everything on every keystroke in search.

---

## 11. Working style that has worked

- Make the change, run the tests, then **say what could be better about it** — including
  what the change itself got wrong.
- When a test fails, work out whether the app or the expectation is wrong before touching code.
- Render output to check it: `pdftoppm` for PDFs, screenshots from the phone for layout. Every
  layout bug in this project was found on a real device, never by reading the CSS.
- Prefer removing dead code as it appears. Two cleanups have already removed ~1.8KB of markup
  and styles for features that no longer exist.
