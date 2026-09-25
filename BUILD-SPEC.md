# Personal spending tracker — build specification

A from-scratch specification for building this kind of app independently. It captures **what the
thing has to do** and **every trap that was discovered the hard way**, deliberately without the
owner-specific choices the existing implementation made.

## How to use this document

- **§2–§5 are requirements.** Treat them as the brief. They are stated so they can be satisfied
  many different ways.
- **§6 is the decision log.** Each entry is a choice the existing build made, its rationale, and
  what you would trade away by choosing differently. These are *not* requirements — diverge
  freely, but know what the original was buying.
- **§7 is the bug catalogue.** Every one of these was found in real use or by a test, not by
  reasoning. Read it before writing the money maths. Ignoring it means rediscovering them.
- **§8 is the testing strategy**, which is the single highest-value thing to copy.
- **§9 is a suggested build order**, **§10 an acceptance checklist**, **§11 what was stripped**.

Requirement keywords: **MUST** (the app is wrong without it), **SHOULD** (strong default, breakable
with reason), **MAY** (optional).

---

## 1. Problem statement

One person wants to know, at any moment, **how much they can spend today** without running out
before their next income arrives, with committed costs and savings already accounted for.

Everything else in the app exists to make that one number trustworthy. If a feature does not make
that number more honest or easier to keep accurate, it is decoration.

Scope assumptions: single user, single device primary with optional second device, manual entry,
no bank integration, no shared accounts, no multi-user.

---

## 2. The money model

This is the core. Get it wrong and every figure downstream lies.

**R2.1 (MUST)** The app computes, from one set of inputs:

```
available   = income − spending − money moved to savings
for living  = available − unpaid committed costs − savings goal not yet banked
today       = (for living + spent today) ÷ days remaining, minus spent today
this week   = today + one day's allowance for each remaining day of this week
this month  = for living
```

**R2.2 (MUST) One rate drives every figure.** The daily, weekly and monthly numbers must be
derived from a single computation. Computing them independently causes them to disagree by small
amounts, which destroys trust in all three. The monthly figure should equal "for living" *by
definition*, not by coincidence.

**R2.3 (MUST) Today's figure may go negative**, and must read as "you are done for today", not as
a debt. Overspending today MUST reduce the remaining days' allowance rather than being forgiven.

**R2.4 (MUST) Underspending today MUST raise tomorrow**, because the same money divides across one
fewer day. Both directions must be visible in the UI copy, not just the number.

**R2.5 (MUST)** A category marked as excluded from day-to-day figures still **reduces available
money**. It is excluded from the *living* rate, bars and percentages only. The money is gone
either way. Getting this wrong makes the daily figure lie about how much is really free.

**R2.6 (SHOULD)** Project a run-out date from a **trailing window** of recent spending (about a
week), not from the whole period to date. One heavy day early on otherwise reads as the normal
rate forever.

**R2.7 (MUST)** Every stored amount is held in **one base unit**. Display currency is a
presentation layer applied on read. Never store display-converted values.

---

## 3. The period model

**R3.1 (MUST) The period is income-day to income-day, not the calendar month.** People are paid on
a day that is not the 1st, and rent-type costs are paid from that income. A calendar month splits
one financial period across two, and every figure becomes wrong.

**R3.2 (MUST) Name a period for the month it *ends* in**, because that is the month it pays for.
Naming it for the month it starts in files money into the wrong period and breaks everything
downstream.

**R3.3 (MUST) Any single period's start MUST be movable without affecting any other period.**
Income arrives on a different date each month for a large share of users. A single global "payday
is the Nth" is an approximation, not a fact.

**R3.4 (MUST)** Derive a period's end from its **start**, never from an arbitrary date such as
today. See §7.1 — this produced the single worst bug in the project.

**R3.5 (MUST)** When a boundary moves, entries MUST refile themselves into the correct period —
*except* entries the user has explicitly pinned by hand, which MUST survive refiling.

**R3.6 (MUST) Filing income into a later period is a statement that the period has turned over.**
The new period MUST start on the date that income arrived. Without this, money logged before the
nominal income day is invisible until that day arrives, while the app keeps spreading the old
period's remainder over days that are already paid for.

**R3.7 (SHOULD)** Provide an explicit opt-out for R3.6, stored **on the entry**, for money that
genuinely belongs to a later period without moving the boundary. Persist it — otherwise any
self-healing pass (R3.8) undoes the user's choice on next launch.

**R3.8 (SHOULD) Self-heal on launch.** If an entry exists whose period is later than its own date
and it carries no opt-out, move the boundary then. A fix that requires the user to find a setting
is not a fix — the app should notice. Two guards are mandatory:
- never modify a period earlier than the live one, or settled history gets reshuffled;
- always skip entries carrying the opt-out.

**R3.9 (MUST)** Money filed into a future period MUST NOT affect any current figure until that
period opens. Carry-forward must only pull from periods *earlier* than the current one.

**R3.10 (SHOULD)** Logging income ahead of its arrival date should **stretch the current period**
to meet it, lowering the daily allowance accordingly. That is the honest answer when income is
known to be late.

---

## 4. Functional requirements

### 4.1 Entries

- **MUST** support three kinds: spending, income, and refund.
- **MUST** store a refund as a *negative spend*, not as income. A refund reduces spending; it is
  not new money. Conflating them inflates income figures and corrupts period summaries.
- **MUST** support back-dating, and editing an entry's amount, category, date, note and period.
- **MUST** generate IDs that cannot collide (see §7.3).
- **SHOULD** guard against accidental double-entry: the same amount and category within a short
  window should ask before logging twice.
- **SHOULD** show the cost of an amount in *days of allowance* **while typing**, not after
  logging. That is the moment the information changes a decision.
- **MUST** provide type-classification helpers (is-income, is-savings-in, is-savings-out,
  is-spending, is-excluded, is-living) and use them everywhere. See §7.13.

### 4.2 Committed costs (bills)

- **MUST** reserve unpaid expected costs off the top, so the daily figure is honest from day one
  rather than degrading as bills land.
- **MUST** let a logged payment settle an expected cost automatically, matching on category and
  an amount tolerance.
- **MUST** ensure **one payment settles exactly one expected cost** (see §7.14).
- **SHOULD** let an entry whose note names the cost win the match outright over a closer amount.
- **SHOULD** support costs that recur other than monthly, appearing only in their period, with an
  option to reserve a pro-rata amount in the other periods.
- **SHOULD** allow marking a cost as paid **without** logging a payment, for things paid from
  another account, and allow undoing that.
- **SHOULD** handle a payment that covers more than the expected amount by offering to split the
  excess onto another category.
- **MUST** freeze any currency conversion at the moment the cost is saved (see §7.8).

### 4.3 Savings

- **MUST** distinguish the **goal** (money held back from the daily rate) from the **vault**
  (money actually moved). Conflating them is confusing and double-counts.
- **MUST** count money already banked toward the goal, so it is not held back twice.
- **MUST** ensure a withdrawal **permanently reduces what is protected** for that period. See
  §7.15 — this was the most damaging bug reported by a real user.
- **SHOULD** offer to bank a period's leftover when it closes, filed back into the period it came
  from, so leftovers stop rolling forward silently.
- **SHOULD** detect when a back-dated entry pushes an already-swept period negative, and offer to
  pull the money back — filed into the period it repairs, not the current one.

### 4.4 Recurring income

- **SHOULD** support a recurring income reminder.
- **MUST NOT** auto-log it, and **MUST NOT** reserve it. It is a nudge. Inventing money the user
  has not confirmed is worse than making them type it.

### 4.5 Currency

- **SHOULD** support entering an amount in a currency other than the base one.
- **MUST** freeze the conversion at entry time and never re-convert it afterwards (see §7.8).
- **MAY** allow a period to be *displayed* in a different currency; if so the rate MUST be frozen
  when the choice is made, so a closed period never drifts when rates are edited later.

### 4.6 History and export

- **MUST** provide per-period history with a category breakdown.
- **SHOULD** provide search across everything ever logged — category, note, amount, period name.
- **SHOULD** export machine-readable data (e.g. CSV).
- **MUST** keep full precision in exports even if the UI rounds. Exports are used to reconcile
  against a bank statement, where rounding is useless.

### 4.7 Backup and sync

- **MUST** make it possible to get the data out, and warn when no backup exists.
- **MUST**, if syncing, merge **entry by entry**, never last-write-wins on the whole document.
  Two devices used offline must keep everything from both.
- **MUST** honour deletions across devices via **tombstones**, or deleted entries resurrect on the
  next sync. Prune them on a schedule.
- **MUST NOT** include credentials in an exported backup file.

---

## 5. Non-functional requirements

**R5.1 (MUST)** Usable one-handed on a phone. This is a thing people open in a shop queue.

**R5.2 (MUST)** Work offline. Entry must never depend on the network.

**R5.3 (MUST)** No dark patterns around data loss: the user must be told, plainly, where their
data lives and how it can be lost.

**R5.4 (SHOULD)** Respect platform accessibility settings — reduced motion, reduced transparency,
dynamic type.

**R5.5 (SHOULD)** Never signal state by colour alone. Pair every colour cue with text or an
accessible label.

**R5.6 (SHOULD)** Establish one interaction convention and hold it — e.g. *raised or tinted means
pressable, flat outline means information only*. Which convention matters less than consistency.

**R5.7 (MUST)** Respect the storage budget of the target platform, and show the user how much is
left if the budget is small.

---

## 6. Decision log — choices, not requirements

Each of these is a fork in the road the original took. A fresh build should reconsider all of them.

| # | Decision | Why it was taken | What you lose by diverging |
|---|---|---|---|
| D1 | **Single HTML file, no build step, no framework** | Deploys anywhere static, survives toolchain rot, trivially auditable, no dependency upgrades | A framework gives you components, routing and state management. The cost is a build step and supply-chain exposure. A single file becomes hard to navigate past ~3,000 lines — this one reached ~3,700 and `render()` recomputes everything on every keystroke |
| D2 | **Browser local storage as the database** | No backend, no account, no hosting cost, data stays on device | Small quota, per-origin (so the URL can never change), and cleared if the user clears site data. IndexedDB raises the ceiling; a backend removes it but adds accounts, privacy surface and cost |
| D3 | **Installed web app rather than native** | One codebase, no app store, instant updates | No background execution, so nothing can refresh while closed; platform-specific cache quirks (see §7.9); no widgets or notifications |
| D4 | **Sync through a user-owned cloud file** | No server to run, no data custody, user keeps control | Requires the user to create a credential, which is a real onboarding cliff. A backend makes sync invisible but makes you the data custodian |
| D5 | **Manual entry, no bank feeds** | No aggregator costs, no credentials held, works anywhere | Manual entry is the main reason such apps get abandoned. Bank integration removes that friction at significant cost and privacy expense |
| D6 | **Text-paste receipt parsing rather than stored images** | Image storage could never fit the storage budget; the platform's own OCR is better than anything the app could ship | Clunkier flow. Server-side OCR or a native camera pipeline is nicer if you have a backend |
| D7 | **Hand-written PDF generation** | The platform's print API does nothing inside an installed web app, and a PDF library was large relative to a single-file app | Considerable complexity for one feature. Use a library if a build step already exists |
| D8 | **Investments tracked in the same app** | The owner wanted one place for net worth | Scope creep on an app whose job is a daily spending figure. It was later moved behind its own tab to keep it out of the main flow. **Consider omitting entirely** |
| D9 | **Multiple colour themes** | Personal taste | Every theme multiplies visual QA. One good light and one good dark is usually the right answer |
| D10 | **Test suite drives the real app in a headless DOM** | Caught a dozen genuine bugs that code review missed | Slower than unit tests. But see §8 — this is the decision most worth copying |

---

## 7. Bug catalogue — read before writing the money maths

Every one of these was found in use or by a test. They are ordered roughly by severity.

**§7.1 — Deriving the period end from today instead of from the period start.** *The worst one.*
The end-of-period function takes a **period start**. It was called with today's date. From the 1st
of a calendar month until the income day, today and the period start sit in different calendar
months, so the period looked about thirty days longer than it was — the daily allowance read
roughly a third of its true value and the weekly figure went negative. **It hid because every test
froze the clock on a date where today and the period start shared a calendar month.** Invariant:
period arithmetic takes period starts, never arbitrary dates. Test on a date where they differ.

**§7.2 — A savings withdrawal that re-reserved itself.** Reported as: *"I took out 3500 to buy
something, it didn't record, and now I'm very in the negative."* Saving toward the goal correctly
stopped reserving that amount. But **withdrawing made the goal unmet again, so the app immediately
re-reserved the same amount** to protect it. The withdrawal therefore freed nothing, and the
purchase came straight out of protected money. Invariant: a deliberate withdrawal must permanently
lower what is protected for that period.

**§7.3 — IDs from a timestamp alone collide.** Two records created in the same millisecond shared
an ID, so editing one edited both. Invariant: append randomness, or use a real UUID.

**§7.4 — Money filed into a later period was invisible until the nominal income day.** The user
said "this money is next month's"; the app filed it forward but left the period boundary alone.
Between the real payday and the nominal one, the money did not exist and the allowance was being
spread over days already paid for. Invariant: R3.6, plus a launch-time self-heal (R3.8).

**§7.5 — A fix that required finding a setting is not a fix.** The first attempt at §7.4 only
changed what happened on *new* entries. Anything already recorded still needed the user to go into
settings. Invariant: when you change how something is interpreted, sweep existing data too.

**§7.6 — An update check that matched its own source.** The checker searched the fetched page text
with a regular expression that was itself written in that page, found itself, and showed an
"update available" banner forever. Invariant: parse fetched documents with a real parser and read
the element; never regex your own source.

**§7.7 — One payment settling several expected costs.** A single payment cleared two different
subscriptions whose amounts were both within tolerance, releasing money that was never spent.
Invariant: each payment claims at most one expected cost; resolve best match first.

**§7.8 — Re-converting a stored foreign amount when rates change.** A daily rate refresh silently
rewrote the value of past entries and bills, so history changed retroactively. Invariant: freeze
the converted value *and* the rate *and* the date at the moment of saving. Never re-derive.

**§7.9 — An installed web app has a separate cache and storage from the browser.** A fix visible
in the browser can still be stale in the installed app, indefinitely. Invariant: ship an explicit
update check with a hard refresh that clears caches and unregisters the service worker. Also:
**deleting the installed icon deletes the data**, and changing the URL orphans it, since storage is
per-origin — never suggest reinstalling as a troubleshooting step.

**§7.10 — Rebuilding a dropdown resets the user's selection.** A choice silently reverted to the
default because the control was re-rendered underneath it. Invariant: track selection in state and
restore it after any re-render.

**§7.11 — A form section built once and never rebuilt.** The period dropdown and its explanatory
label were constructed when the user switched to the income tab, then never updated. Changing the
date afterwards left both describing the wrong day, and the entry filed into the wrong period.
Invariant: derive dependent controls from current state on every relevant change, not once on open.

**§7.12 — Sticky positioning pins to the viewport, not the padding box.** The header slid under the
status bar on scroll. Invariant: safe-area insets belong on the sticky element itself.

**§7.13 — Testing the type field directly instead of using helpers.** A check for "not income"
counted savings transfers as spending. Invariant: classification helpers exist for a reason; never
compare the raw type field in business logic.

**§7.14 — Money swept to savings counted twice** — once as saved and once as left over in period
summaries. Invariant: one movement, one place in the arithmetic.

**§7.15 — Writing HTML into an element after appending a child wipes the child.** An undo button
never appeared. Invariant: set markup first, append interactive elements after.

**§7.16 — Date inputs inside a modal may not fire a change event when the modal is dismissed.**
Settings were silently lost. Invariant: commit on close as well as on change.

**§7.17 — A hidden flex item still occupies its slot**, so first-child alignment rules applied to
the wrong column. Invariant: remove from layout, do not just hide.

**§7.18 — A zero-length round-capped arc renders as stray dots**, and a dash pattern shorter than
the circumference repeats them. Invariant: prefer simple bars to circular progress unless you are
prepared to handle the degenerate cases.

**§7.19 — One record per calendar month for period overrides.** Storing period starts keyed by
year-month means two incomes in one calendar month overwrite each other's boundary. This is an
accepted limitation in the original, not a fixed bug. If your users can be paid twice in a month,
key overrides by period identity instead.

---

## 8. Testing strategy — the part most worth copying

**§8.1** Drive the **real application** in a headless DOM against **seeded storage**, and assert on
**rendered output**. Not unit tests of extracted functions — the bugs above lived in the wiring
between correct-looking pieces. This suite caught roughly a dozen genuine bugs, several in the same
session they were introduced.

**§8.2 Freeze the clock**, but **do not freeze every test on the same date**. §7.1 hid for a long
time precisely because every test froze on a date where today and the period start shared a
calendar month. Deliberately install different clocks for date-sensitive behaviour:
- a date where today and the period start are in **different calendar months**;
- the **last day** of a period;
- a date **between** a real income arrival and the nominal income day.

**§8.3** Stub what the headless DOM lacks — modal open/close, scroll, object URLs — and make sure
**close dispatches its close event**, or any behaviour that commits on close silently passes.

**§8.4** When a test fails, **decide whether the app or the expectation is wrong before touching
code**. Several times the test was wrong, and correcting it clarified the intended behaviour.

**§8.5 Check your seed before you believe a failure.** One failure in this project was caused by a
seed containing two paydays three days apart — impossible for the user in question. The data model
limitation it exposed (§7.19) was real but out of scope; the fix was to the seed, not the code.
An unrealistic fixture produces a real-looking failure.

**§8.6** Reproduce a reported bug in the test harness **before** writing the fix, using the real
dates and amounts from the report. Every fix above was confirmed this way first.

**§8.7** Assert on **persisted state as well as rendered state** for anything that self-heals, or
you cannot tell a real fix from a redraw.

**§8.8** For currency-aware UIs, assert on stored values rather than displayed strings where
possible — displayed amounts are converted and locale-formatted, and locale differences (e.g.
whether September abbreviates to "Sep" or "Sept") will break naive string assertions.

---

## 9. Suggested build order

Each stage should be independently usable and fully tested before the next begins.

1. **Storage, entries, and the period model.** Add income, add spending, list it, and get the
   period boundaries right. Write the §8.2 clock tests now — everything downstream depends on this
   being correct.
2. **The daily figure**, derived once and displayed three ways (§2.1, §2.2). Verify that the three
   figures move together under spending, refunds and back-dating.
3. **Excluded categories** (§2.5) and the distinction between money leaving and living spend.
4. **Committed costs**, including the one-payment-one-cost rule (§7.7).
5. **Savings**, goal versus vault, including the withdrawal rule (§7.2).
6. **Variable period boundaries** (§3.3, §3.6–§3.10), including the launch self-heal.
7. **History, search and export.**
8. **Backup**, then sync with tombstones if wanted.
9. **Polish**: themes, motion, accessibility pass.

Everything from stage 6 onward can be deferred; stages 1–5 are the product.

---

## 10. Acceptance checklist

- [ ] The three figures never disagree, under any sequence of entries
- [ ] Spending today reduces today by exactly that amount, and tomorrow by its share
- [ ] Spending nothing today raises tomorrow
- [ ] An excluded-category payment reduces available money but not the living rate
- [ ] A refund reduces spending and does not appear as income
- [ ] Period arithmetic is correct on a date where today and the period start are in different
      calendar months
- [ ] Moving one period's start leaves every other period untouched
- [ ] Hand-pinned entries survive a boundary move; others refile
- [ ] Income filed into a later period starts that period on its own date
- [ ] An entry carrying the opt-out survives a relaunch unchanged
- [ ] Closed periods are never altered by any self-healing pass
- [ ] One payment settles at most one expected cost
- [ ] A savings withdrawal frees spendable money and does not re-reserve itself
- [ ] A stored foreign-currency amount never changes when rates are edited
- [ ] Two devices editing offline lose nothing on merge; deletions do not resurrect
- [ ] Exports carry full precision
- [ ] No credential appears in an exported backup
- [ ] Every colour-coded state has a non-colour signal
- [ ] The app functions with no network

---

## 11. Deliberately excluded

Stripped from this specification because they are the original owner's choices, not requirements.
Listed so you know what to supply for yourself:

- The base currency, the set of supported currencies, and any specific exchange rates
- The default income day, and any specific savings goal amount
- The category list, the group structure, and the specific icons
- The list of merchant-name patterns used to guess a category from a receipt
- Which categories are excluded from day-to-day figures by default
- Specific recurring costs, their amounts, and how a particular landlord invoices
- The colour palette, the number of themes, and the typeface
- The investments feature, the instruments tracked, and the price-data providers
- The specific sync provider and any API keys
- Repository names, hosting, and the secondary platform wrapper
- The app's name, and the internal storage key it must keep for backward compatibility
