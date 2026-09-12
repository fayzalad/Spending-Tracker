# Tracker

A simple, private spending tracker that lives on your phone. No account, no ads, nobody but you
sees your numbers. This guide walks through setting it up and using it day to day — no technical
background needed.

## What it actually does

Every month, you tell it what you got paid. From that, it works out:

- how much you can safely spend **today** without running out before your next payday
- how much is left for **this week**
- what's already spoken for (rent, subscriptions — the stuff that isn't really "spending money")
- how you're tracking against a savings goal, if you've set one

It doesn't connect to your bank. You type in what you spend as you go (or catch up every few
days) — it's a running total, not automatic transaction importing.

## Getting it on your phone

The link opens a normal web page, but it's built to be installed like an app:

**iPhone (Safari):** open the link → tap the Share icon (square with an arrow) → **Add to Home
Screen**. It'll appear as an icon with the rest of your apps and opens full-screen, no browser bar.

**Android (Chrome):** open the link → tap the **⋮** menu → **Add to Home screen** (or Chrome may
offer to do this automatically with a banner).

You can also just keep it as a browser tab if you'd rather — everything works the same either way.

## Setting it up for the first time

The first thing it asks for is what day of the month you get paid — your **allowance day**. This
matters because the app doesn't think in calendar months; it thinks in cycles that run from one
payday to the next. If you're paid on the 25th, your "month" runs 25th to 24th, not 1st to 31st.

You can change this later in **Settings → Month** if your pay date shifts, or override a single
month by hand (useful if you get paid a few days early or late one time).

## Logging money

Tap **Add** at the bottom. There are three kinds of entry:

- **Spent** — anything that leaves your pocket. Pick a category (Groceries, Uber Eats, Rent,
  whatever fits) and type the amount.
- **Received** — money coming in. This is how you tell it a new month has started, by logging
  your pay.
- **Refund** — money coming back for something you'd already logged as spent.

There's also **Read a receipt**: open the photo of a receipt in your phone's own Photos app,
select and copy the text (iPhones do this natively — press and hold on the text in a photo), then
paste it in. It pulls out the total, date and a guess at the category so you don't have to type
them by hand. Nothing about the photo itself is ever stored — just the numbers you confirm.

## Reading the dashboard

The two tabs at the top, **This week** and **This month**, are two views onto the same money —
switch between whichever number you find more useful day to day.

- The big number is what's safe to spend **right now** without borrowing from tomorrow.
- Below it: what's been spent so far, and how many days are left in that stretch.
- The bar chart shows spending day by day, with a dashed line marking your daily pace — if a bar
  is above the line, that day went over.
- **Rent & the like** only shows up in the month view, not the week one, since things like rent
  aren't a weekly cost — you'd only ever pay them once a cycle.

Categories you mark as "kept out" (Settings → Rules) — rent and levies by default — don't count
against your daily spending pace at all. They're money that's already spoken for, shown separately
so they don't make it look like you're overspending on everyday things.

## Bills and recurring income

If you've got the same subscriptions or bills every month, add them once under **Settings →
Bills**. The app then nudges you when one hasn't been logged yet this cycle, so you don't forget
or double-pay from memory. Same idea for **recurring income** under Settings → Month, if you're
paid the same amount every time.

## Savings

Tap **Put away this month** on the dashboard to move money into savings — it comes out of your
spendable pot and won't count toward next month either. **Take some out** reverses it.

You can keep savings in more than one currency at once (say, some in rand, some in pounds) — each
is tracked as its own separate pot. When you take money out of a foreign pot back into your
day-to-day spending money, you get a choice: if you already converted it yourself (through your
bank or Wise), type in exactly what you received; otherwise the app converts it for you at the
stored exchange rate.

## Working in a different currency

If you're paid in a different currency every so often, you can set that one month's currency when
you log the income that starts it (tick **Start this month from today** and a currency picker
appears), or change it any time from **Settings → Month → This month's currency**. It only ever
affects the month you're changing — anything already closed out stays exactly as it was, in
whatever currency it was tracked in at the time, forever.

If you're mostly paid in one particular currency and just want the app to run in that by default —
say you're paid in pounds most months, not rand — set **Settings → Month → Default currency**
once. Every new month then starts in that currency automatically, without you picking it each
time; "This month's currency" above it still lets you override any one specific month. Like
everything else here, changing your default never reaches back and reinterprets a month that's
already begun.

Logging a single entry in a currency other than your month's main one also works from the amount
field itself — just pick the currency next to the amount, and it converts automatically using the
rate shown (editable under Settings → Rules if your bank's actual rate differs).

## Investments

A separate area (tap **Investments** in the bottom bar) for tracking things like shares or crypto
— completely separate from your day-to-day spending money, so it never affects your daily
allowance. Add what you've put in and what it's worth now, or add a ticker/coin symbol and it'll
fetch the live price for you.

## Finding past entries

**Search** at the bottom searches everything you've ever logged — by category, note, amount, or
even a month name. **Months** shows a running history of every past cycle, with a CSV or PDF
export available for each one if you want a proper statement.

## Backing up your data

Everything lives only on this one phone until you back it up — if you lose the phone or clear your
browser data, it's gone. **Settings → Data** lets you connect a free GitHub account as a private,
personal backup:

1. Create a GitHub account if you don't have one already (free, at github.com).
2. Create a **Personal Access Token** with just the "gist" permission (GitHub → Settings →
   Developer settings → Personal access tokens).
3. Paste that token into Settings → Data in the app.

Your data is then saved to a **private** Gist under your own GitHub account — nobody else can see
it, and it lets you open the same tracker on a second device (like an iPad) and stay in sync.
This step is entirely optional; the app works fully without it, just without a safety net.

If you'd rather not set up GitHub at all, **Download a backup** in the same Settings tab saves a
plain file you can keep anywhere (email it to yourself, save it to a cloud drive), and **Restore
from backup** loads one back in.

## If a friend wants their own copy

This is safe to share — everyone's data stays private to their own phone (and their own GitHub
backup, if they set one up). Nothing is shared between people using the same link; there's no
shared account or server in the middle.
