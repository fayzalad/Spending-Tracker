# Figma prompt — Tracker redesign

Paste everything below the line into Figma (Figma Make / First Draft / an AI design tool).
All numbers in it are invented examples.

---

Design a complete, polished UI for **Tracker**, a personal spending tracker for one person in
South Africa (currency: rand, shown as `R1 234` with a thin space as the thousands separator, no
cents on screen). It is a web app installed to the iPhone Home Screen, also used on an Android
phone and in a desktop window. Design **both** a phone layout (390 × 844, iPhone 15) and a desktop
layout (1440 × 900). Every screen in **light and dark** mode.

## Who it is for and the feeling

One person who gets paid once a month on a day that moves around in the last week of the month,
and wants to know at a glance: *how much can I spend today without running out before next payday?*
Calm, trustworthy, quick to read in two seconds. Not a bank, not gamified. Think Apple Wallet /
Apple Health clarity: big confident numbers, generous spacing, soft depth, no clutter. One accent
colour (currently violet `#5B3DF5`; propose a better one if you like) plus semantic green (good),
amber (careful), red (over). Colour must never be the only signal: pair it with a word or icon.

## Core concepts the design must make obvious

- **A "month" runs payday to payday**, not calendar month, and is named for the month it ends in
  (25 Oct – 24 Nov is "November"). Always show the date range somewhere near the month name.
- **Today's allowance**: (money left for living ÷ days left). Negative means "done for today",
  never "you owe".
- **Bills held back**: rent, water, subscriptions not yet paid are reserved off the top so the
  daily number is honest from day one.
- **Savings**: a goal held back from spending, and a vault of money actually moved.
- **Budget** (new): a plan for the month — expected income, planned amounts per category (several
  named lines can share a category, e.g. four subscriptions), planned vs spent per category, money
  spent outside the plan, and what is still **free**. A plan only; it does not change today's figure.

## Screens to design (phone and desktop each)

1. **Home.** Sticky header ("Tracker", segmented control *This week / This month*). Hero card:
   "Left this week" big number (e.g. **R1 840**), week and month progress bars with %, a row of
   In / Rent & water / Living, and a "+ Money received" button. Then: a short status message
   ("On track. R6 300 left, R1 260 a day from here"), stat grid (You can spend today, Food this
   month, Left this month, On track to save, Subscriptions still due, Money runs out), daily
   spending bar chart for the week with a dashed allowance line, "Where it went" category bars,
   savings card (Put away this month, Saved altogether, "Next: Desk — R3 500 · ready 25 Nov"),
   **Budget card** ("Budget · November — R4 200 free · every line on track", amber when a line is
   over), "Add an entry" card, and the entry list grouped by day.
   *Desktop:* two columns (summary left, activity and add-entry right), max width ~1200, nothing
   floating in empty space, base type ~18 px.
2. **Add an entry.** Kind switch *Spent / Received / Refund*, big amount field with currency
   picker (R, £, $, ₵), category picker grouped (Living, Shopping, Bills) with emoji icons, date,
   note, a live line "That's 0.4 days of your allowance". For Received: "Counts toward: this month
   / next month" and a checkbox "Start November from 28 Oct".
3. **Budget sheet.** Month picker ("November · 25 Oct – 24 Nov"), expected income field, a
   summary table (Expected in, Received so far, Planned, Left to plan, Spent outside the plan,
   Over on planned lines, **Free** as the emphasised last row), then one row per category: icon +
   name, "R1 340 of R1 600", progress bar (green when right on plan, amber near the limit, red
   over), "R260 left" / "R120 over", and chips for each named line ("iCloud R200", "Claude R371")
   that open an edit sheet. Buttons: Add a line, Add my bills, Copy last month, Clear. Also design
   the empty state and the small **Edit line** sheet (name, category, amount, delete).
4. **Add a list of entries** (bulk import). Large monospace text box for lines like
   `2026-10-09, 125.50, Eating out, Mochachos`, then a live preview list: each row has a tick box,
   date · category · note, amount, and a status line — *spent*, *refund*, *received*, amber
   "looks already logged: 9 Oct Eating out R125", or red "no category called Petrol" (cannot be
   ticked). A summary ("4 of 6 lines will be added: R1 480 spent. 1 looks already logged…") and a
   primary button "Add 4 entries", then an Undo state after adding.
5. **Subscriptions & bills**, **Months** (history of closed months with a recap), **Search**,
   **Planned purchases**, **Investments**, **Settings** (tabs: Month, Rules, Bills, Look, Data —
   Look has 8 colour schemes incl. Match device; Data has cloud sync with a token field, backup,
   restore, "Add a list of entries", Check for updates).
6. **States:** first launch (nothing logged), offline, "A new version is ready — Update" banner,
   "Nothing is backed up yet" banner, bills-not-logged banner, over-budget day, sync connected.

## Navigation and components

- Floating capsule tab bar at the bottom (Add, Search, Months, Invest, Settings) that shrinks
  while scrolling; on desktop a centred bar or a left sidebar — your call, justify it.
- Every secondary screen is a **bottom sheet** with a grab handle and a nav bar (× at top level,
  ‹ when stacked on another sheet), drag-down to dismiss. On desktop, a centred panel ~560 px.
- Convention to keep: **raised or tinted = pressable; flat outline = information only.**
- Build a small component set: buttons (primary, ghost, danger, small), segmented control,
  inputs/selects, checkbox row, card, stat tile, progress bar (4 states), list row, chip, banner
  (info, warning, success), sheet header, tab bar.

## Constraints

- Thumb-sized tap targets (44 px min), no sideways scrolling at 390 px, safe areas respected.
- WCAG AA contrast in both themes; numbers use tabular figures.
- System font stack (SF Pro on iPhone, Segoe UI on Windows) — or propose one web font, but it must
  look right offline.
- Respect Reduce Motion and Reduce Transparency (an optional frosted-glass look must fall back to
  solid surfaces).
- Deliver: a light and dark colour token set, a type scale, spacing scale, the component sheet, and
  every screen above at both sizes, with a short note on the main design decisions.
