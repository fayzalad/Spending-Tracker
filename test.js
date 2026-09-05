const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const HTML_HAS_RECEIPT = /'Receipt'/.test(HTML);
const TODAY = '2026-08-31';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

async function boot(seed, opts = {}) {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: 'https://example.github.io/Spending-Tracker/',
    pretendToBeVisual: true,
    beforeParse(w) {
      // freeze "today"
      const Real = w.Date;
      class FakeDate extends Real {
        constructor(...a) { if (!a.length) super(TODAY + 'T09:00:00Z'); else super(...a); }
        static now() { return new Real(TODAY + 'T09:00:00Z').getTime(); }
      }
      w.Date = FakeDate;
      w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      w.fetch = () => Promise.reject(new Error('offline in test'));
      w.confirm = () => opts.confirm !== false;
      w.alert = () => {};
      w.prompt = () => '';
      w.scrollTo = () => {};
      w.Element.prototype.scrollIntoView = () => {};
      w.print = () => {};
      w.localStorage.setItem('slip:v4', JSON.stringify(seed));
      // jsdom has no dialog methods
      w.HTMLDialogElement && (w.HTMLDialogElement.prototype.showModal = function () { this.open = true; });
      w.HTMLDialogElement && (w.HTMLDialogElement.prototype.close = function () {
        this.open = false;
        this.dispatchEvent(new w.Event('close'));   // real browsers fire this
      });
      if (!w.HTMLDialogElement) {
        w.HTMLElement.prototype.showModal = function () { this.open = true; };
        w.HTMLElement.prototype.close = function () { this.open = false; };
      }
      Object.defineProperty(w.navigator, 'serviceWorker', { value: undefined, configurable: true });
    }
  });
  await new Promise(r => setTimeout(r, 120));
  return dom;
}

const num = s => Number(String(s).replace(/[^0-9.-]/g, '')) * (String(s).includes('−') ? -1 : 1);

// --- realistic seed: Fayzal's actual September month, 28 Aug start
const seed = {
  day: 25,
  starts: { '2026-08': '2026-08-28' },
  goal: 3500, cap: 300, cadence: 3.5, theme: 'light',
  rates: { ZAR: 1, GBP: 21.78, USD: 15.96, GHS: 1.44 },
  cats: [], groups: [], bills: [], ticks: {},
  entries: [
    { id: 1, amt: 20795, cat: 'Money in', note: 'Total money for September', date: '2026-08-28', type: 'in', cyc: '2026-08-28', man: true },
    { id: 2, amt: 9347, cat: 'Rent', note: '', date: '2026-08-28', type: 'out', cyc: '2026-08-28' },
    { id: 3, amt: 240, cat: 'Uber Eats', note: '', date: '2026-08-28', type: 'out', cyc: '2026-08-28' },
    { id: 4, amt: 260, cat: 'Uber Eats', note: 'Jollof from New Dawn', date: '2026-08-28', type: 'out', cyc: '2026-08-28' },
    { id: 5, amt: 262, cat: 'Uber Eats', note: '', date: '2026-08-30', type: 'out', cyc: '2026-08-28' },
    { id: 6, amt: 1258, cat: 'Other', note: 'Powerbanks', date: '2026-08-30', type: 'out', cyc: '2026-08-28' },
    { id: 7, amt: 178, cat: 'Uber Eats', note: 'Kfc', date: '2026-08-30', type: 'out', cyc: '2026-08-28' },
    { id: 8, amt: 101, cat: 'Subscriptions', note: 'Chatgpt', date: '2026-08-31', type: 'out', cyc: '2026-08-28' }
  ]
};

(async () => {
  console.log('\n=== 1. core figures still correct ===');
  let dom = await boot(seed);
  let w = dom.window, d = w.document, $ = id => d.getElementById(id);

  // month tab
  $('tabMonth').click();
  const avail = num($('secVal').textContent);
  ok('available = 20795 - 9448 bills - 2198 living = 9149', Math.abs(avail - 9149) < 2, 'got ' + avail);
  ok('In this month = R20 795', num($('inVal').textContent) === 20795, $('inVal').textContent);
  ok('only rent sits outside', num($('billVal').textContent) === 9347, $('billVal').textContent);
  ok('cell names what it holds', $('billCap').textContent === 'Rent & water',
     $('billCap').textContent);
  ok('subs now count as living', num($('outVal').textContent) === 2299, $('outVal').textContent);
  // R5 649 for day-to-day + R101 already spent today = R5 750 over 25 days = R230,
  // less the R101 subscription paid today = R129 left for the rest of today
  const safe = num($('safe').textContent);
  ok("today's allowance nets off what's gone", Math.abs(safe - 129) < 3, 'got ' + safe);
  ok('sub names the subscription spend',
     /101 of today/.test($('safeSub').textContent), $('safeSub').textContent);
  ok('month range shows 28 Aug', $('secSub').textContent.includes('28 Aug'), $('secSub').textContent);

  console.log('\n=== 2. new: run-out date ===');
  ok('run-out renders a date', /\d/.test($('run').textContent), $('run').textContent);
  ok('run-out sub mentions pace or lasts', /pace|lasts|day/.test($('runSub').textContent), $('runSub').textContent);
  // pace = 2198/4 = 549.5/day; spendable 5649 → 10 days → 10 Sep, short of 24 Sep
  ok('flags running short', $('run').className.includes('bad'), $('run').className);

  console.log('\n=== 3. new: where it went ===');
  ok('breakdown card visible', $('breakCard').style.display === 'block');
  const brk = $('breakList').textContent;
  ok('lists Rent', brk.includes('Rent'), brk.slice(0, 80));
  ok('lists Uber Eats', brk.includes('Uber Eats'));
  ok('marks bills', brk.includes('bill'));

  console.log('\n=== 4. new: backdating ===');
  ok('date field exists and defaults to today', $('when').value === TODAY, $('when').value);
  $('when').value = '2026-08-29';
  $('amt').value = '150';
  $('cat').value = 'Groceries';
  $('addBtn').click();
  await new Promise(r => setTimeout(r, 60));
  let stored = JSON.parse(w.localStorage.getItem('slip:v4'));
  const back = stored.entries.find(e => e.amt === 150);
  ok('entry saved on the chosen date', back && back.date === '2026-08-29', back && back.date);
  ok('filed into the 28 Aug month', back && back.cyc === '2026-08-28', back && back.cyc);
  ok('date field resets to today', $('when').value === TODAY, $('when').value);
  $('tabMonth').click();
  ok('living now 2449', num($('outVal').textContent) === 2449, $('outVal').textContent);

  console.log('\n=== 5. new: edit amount + category ===');
  dom = await boot(seed); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  // find the powerbank row and open it
  const rows = [...d.querySelectorAll('#log li')];
  const pb = rows.find(li => li.textContent.includes('Powerbanks'));
  ok('powerbank row present', !!pb);
  pb.querySelector('.n').click();
  ok('edit sheet opened', $('moveDlg').open === true);
  ok('amount prefilled', Number($('moveAmt').value) === 1258, $('moveAmt').value);
  ok('category prefilled', $('moveCat').value === 'Other', $('moveCat').value);
  $('moveCat').value = 'Tech / gadgets';
  $('moveAmt').value = '1300';
  $('moveSave').click();
  await new Promise(r => setTimeout(r, 60));
  stored = JSON.parse(w.localStorage.getItem('slip:v4'));
  const edited = stored.entries.find(e => e.note === 'Powerbanks');
  ok('category changed', edited.cat === 'Tech / gadgets', edited.cat);
  ok('amount changed', edited.amt === 1300, String(edited.amt));
  $('tabMonth').click();
  ok('living recalculated to 2341', num($('outVal').textContent) === 2341, $('outVal').textContent);

  console.log('\n=== 6. new: delete asks first ===');
  dom = await boot(seed, { confirm: false });
  w = dom.window; d = w.document; $ = id => d.getElementById(id);
  const before = JSON.parse(w.localStorage.getItem('slip:v4')).entries.length;
  d.querySelector('#log li .x').click();
  await new Promise(r => setTimeout(r, 60));
  const after = JSON.parse(w.localStorage.getItem('slip:v4')).entries.length;
  ok('cancelling the confirm keeps the entry', before === after, before + ' → ' + after);

  console.log('\n=== 7. new: expected bills reserve ===');
  const withBills = JSON.parse(JSON.stringify(seed));
  withBills.bills = [
    { id: 'b1', n: 'Rent', a: 9347, cat: 'Rent' },
    { id: 'b2', n: 'Fibre', a: 399, cat: 'Internet' },
    { id: 'b3', n: 'Netflix', a: 230, cat: 'Subscriptions' }
  ];
  dom = await boot(withBills); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  ok('rent auto-ticked by the matching entry', !$('dueList').textContent.includes('Rent'),
     $('dueList').textContent);
  ok('fibre still due', $('dueList').textContent.includes('Fibre'));
  ok('netflix still due (R101 chatgpt is too far off R230)',
     $('dueList').textContent.includes('Netflix'));
  ok('reserve = 399 + 230 = 629', num($('due').textContent) === 629, $('due').textContent);
  const safe2 = num($('safe').textContent);
  ok("today's allowance drops for the reserve", safe2 < safe, safe + ' → ' + safe2);
  ok('due card visible', $('dueCard').style.display === 'block');
  ok('bills note moves to the month tile', $('secSub').textContent.includes('for bills'),
     $('secSub').textContent);

  console.log('\n=== 8. "Log it" writes the bill ===');
  const payBtn = [...d.querySelectorAll('#dueList .pay')][0];
  payBtn.click();
  ok('log opens an amount sheet', $('payDlg').open === true);
  ok('amount prefilled with the usual', Number($('payAmt').value) === 399, $('payAmt').value);
  $('paySave').click();
  await new Promise(r => setTimeout(r, 60));
  stored = JSON.parse(w.localStorage.getItem('slip:v4'));
  const fib = stored.entries.find(e => e.note === 'Fibre');
  ok('fibre logged as an entry', !!fib && fib.amt === 399, fib && String(fib.amt));
  ok('fibre now off the due list', !$('dueList').textContent.includes('Fibre'));
  ok('reserve down to 230', num($('due').textContent) === 230, $('due').textContent);

  console.log('\n=== 8b. a bill can be paid at a different amount ===');
  const rentBills = JSON.parse(JSON.stringify(withBills));
  rentBills.bills = [{ id: 'b1', n: 'Rent', a: 9346.65, cat: 'Rent', note: '9145 rent + 201.65 refuse' }];
  rentBills.entries = rentBills.entries.filter(e => e.cat !== 'Rent');
  dom = await boot(rentBills); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  $('dueStat').click();
  ok('note shows on the row', $('subsList').textContent.includes('201.65'), $('subsList').textContent.slice(0, 90));
  [...d.querySelectorAll('#subsList .pay')].find(b => b.textContent === 'Log it').click();
  ok('pay sheet prefilled', Math.round(Number($('payAmt').value)) === 9347, $('payAmt').value);
  $('payAmt').value = '9998.20';           // water month
  $('payNote').value = 'Rent + water';
  $('paySave').click();
  await new Promise(r => setTimeout(r, 60));
  stored = JSON.parse(w.localStorage.getItem('slip:v4'));
  const rentEntry = stored.entries.find(e => e.note === 'Rent + water');
  ok('logged at the amount actually charged', !!rentEntry && rentEntry.amt === 9998.2,
     rentEntry && String(rentEntry.amt));
  ok('still ticks the bill off', $('subsList').textContent.includes('Already paid'));
  ok('expected amount unchanged', JSON.parse(w.localStorage.getItem('slip:v4')).bills[0].a === 9346.65);

  console.log('\n=== 9. nothing else regressed ===');
  dom = await boot(seed); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  ok('week tab hides In cell', d.querySelector('.flow').className.includes('noin'));
  $('tabMonth').click();
  ok('month tab shows In cell', !d.querySelector('.flow').className.includes('noin'));
  ok('takeaway pot present', $('pot').textContent.length > 1, $('pot').textContent);
  // search
  $('openFind').click();
  $('findQ').value = 'jollof';
  $('findQ').dispatchEvent(new w.Event('input'));
  ok('search finds the jollof note', $('findRes').textContent.includes('Uber Eats'), $('findSum').textContent);
  $('findQ').value = 'rent';
  $('findQ').dispatchEvent(new w.Event('input'));
  ok('search finds rent', $('findSum').textContent.includes('1 entry'), $('findSum').textContent);
  // history
  $('openHist').click();
  ok('history renders', $('histList').textContent.length > 5);
  // theme
  ok('theme applied', d.documentElement.getAttribute('data-theme') === 'light');
  // no update banner false positive
  ok('no false update banner', $('updBanner').style.display === 'none', $('updBanner').style.display);
  // console errors
  console.log('\n=== 10. adding/editing/deleting a bill updates the tile live ===');
  const noBills = JSON.parse(JSON.stringify(seed));
  noBills.bills = [];
  dom = await boot(noBills); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  const safe0 = num($('safe').textContent);
  ok('starts with nothing held back', num($('due').textContent) === 0, $('due').textContent);
  ok('due card hidden when there are none', $('dueCard').style.display === 'none');

  const addBill = (n, a, cat) => {
    $('addBillBtn').click();
    $('billName').value = n; $('billAmt').value = String(a); $('billCat').value = cat;
    $('billSave').click();
  };
  addBill('Netflix', 229, 'Subscriptions');
  ok('tile reflects a new bill', num($('due').textContent) === 229, $('due').textContent);
  ok('card appears', $('dueCard').style.display === 'block');
  addBill('Claude', 373, 'Subscriptions');
  ok('tile adds up', num($('due').textContent) === 602, $('due').textContent);
  ok('count updates', $('dueStatSub').textContent.includes('2 of 2'), $('dueStatSub').textContent);
  const safe1 = num($('safe').textContent);
  ok('safe per day drops as bills are added', safe1 < safe0, safe0 + ' → ' + safe1);

  $('dueStat').click();
  const claudeRow = [...d.querySelectorAll('#subsList li .n')]
      .find(x => x.textContent.includes('Claude'));
  claudeRow.click();
  ok('editor opens with delete offered', $('billDlg').open && $('billDelete').style.display === 'block');
  $('billAmt').value = '500';
  $('billSave').click();
  ok('editing an amount updates the tile', num($('due').textContent) === 729, $('due').textContent);
  ok('sheet refreshes behind it', $('subsSum').textContent.includes('R729'), $('subsSum').textContent);

  [...d.querySelectorAll('#subsList li .n')].find(x => x.textContent.includes('Netflix')).click();
  $('billDelete').click();
  ok('deleting updates the tile', num($('due').textContent) === 500, $('due').textContent);
  ok('and the sheet', !$('subsList').textContent.includes('Netflix'));
  ok('safe per day recovers', num($('safe').textContent) > safe1);

  console.log('\n=== 11. savings do not roll over ===');
  // September finished with money left; October has just started
  const twoMonths = {
    day: 25, starts: { '2026-08': '2026-08-28' }, goal: 3500, cap: 300, cadence: 3.5,
    theme: 'light', rates: { ZAR: 1, GBP: 21.78, USD: 16.23, GHS: 1.4464 },
    cats: [], groups: [], bills: [], ticks: {}, potCats: [],
    entries: [
      { id: 1, amt: 20000, cat: 'Money in', note: 'Sept', date: '2026-07-28', type: 'in', cyc: '2026-07-28', man: true },
      { id: 2, amt: 14000, cat: 'Rent', note: '', date: '2026-07-29', type: 'out', cyc: '2026-07-28' },
      { id: 3, amt: 20795, cat: 'Money in', note: 'Oct', date: '2026-08-28', type: 'in', cyc: '2026-08-28', man: true }
    ]
  };
  dom = await boot(twoMonths); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  ok('leftover still counted as spendable at first', num($('secVal').textContent) === 26795,
     $('secVal').textContent);
  const flat = t => t.replace(/\s/g, ' ');   // en-ZA uses a non-breaking thousands space
  ok('offers to put last month away', flat($('sweepBox').textContent).includes('6 000'),
     $('sweepBox').textContent.slice(0, 120));
  const beforeSafe = num($('safe').textContent);
  const sweepBtn = [...d.querySelectorAll('#sweepBox button')].find(b => /Save R/.test(b.textContent));
  ok('offers a Save button for the leftover', !!sweepBtn,
     [...d.querySelectorAll('#sweepBox button')].map(b => b.textContent).join(' / '));
  sweepBtn.click();
  ok('sweep sheet prefilled with the leftover', Number($('vaultAmt').value) === 6000, $('vaultAmt').value);
  $('vaultSave').click();
  await new Promise(r => setTimeout(r, 60));
  ok('the running total shows', num($('vaultAll').textContent) === 6000, $('vaultAll').textContent);
  ok('this month shows nothing, since it came from August',
     num($('vault').textContent) === 0, $('vault').textContent);
  ok('and it left the spendable pot', num($('secVal').textContent) === 20795, $('secVal').textContent);
  ok('safe per day drops accordingly', num($('safe').textContent) < beforeSafe);
  ok('sweep offer clears', !flat($('sweepBox').textContent).includes('6 000'), $('sweepBox').textContent);
  const swept = JSON.parse(w.localStorage.getItem('slip:v4')).entries.find(e => e.type === 'save');
  ok('filed back into the month it came from', swept.cyc === '2026-07-28', swept.cyc);

  console.log('\n=== 12. withdrawing from savings ===');
  $('withdrawBtn').click();
  $('vaultAmt').value = '2000';
  $('vaultNote').value = 'stranded';
  $('vaultSave').click();
  await new Promise(r => setTimeout(r, 60));
  ok('the running total drops', num($('vaultAll').textContent) === 4000, $('vaultAll').textContent);
  ok('spendable money rises', num($('secVal').textContent) === 22795, $('secVal').textContent);
  const pulled = JSON.parse(w.localStorage.getItem('slip:v4')).entries.find(e => e.type === 'unsave');
  ok('logged against this month', pulled.cyc === '2026-08-28', pulled.cyc);
  ok('savings never counted as living spend', num($('outVal').textContent) === 0, $('outVal').textContent);
  ok('nor as money in', num($('inVal').textContent) === 20795, $('inVal').textContent);
  $('withdrawBtn').click();
  $('vaultAmt').value = '99999';
  $('vaultSave').click();
  ok('cannot withdraw more than you have', num($('vaultAll').textContent) === 4000,
     $('vaultAll').textContent);

  console.log('\n=== 13. bills in other currencies ===');
  const fx = JSON.parse(JSON.stringify(seed));
  fx.rates = { ZAR: 1, GBP: 21.78, USD: 16.23, GHS: 1.4464 };
  fx.bills = [
    { id: 'f1', n: 'Claude', a: 23, cur: 'USD', zar: 0, cat: 'Subscriptions', note: '' },
    { id: 'f2', n: 'NextDNS', a: 1.99, cur: 'USD', zar: 0, cat: 'Subscriptions', note: '' },
    { id: 'f3', n: 'ChatGPT', a: 70, cur: 'GHS', zar: 101.25, cat: 'Subscriptions', note: '' }
  ];
  dom = await boot(fx); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  // ChatGPT is already paid in this data, so only Claude + NextDNS are held back:
  // 23*16.23 = 373.29 plus 1.99*16.23 = 32.30
  ok('converts at the stored rate', Math.abs(num($('due').textContent) - 405.6) < 2, $('due').textContent);
  $('dueStat').click();
  ok('the cedi one auto-ticked off', $('subsList').textContent.includes('Already paid'));
  ok('shows the original currency', $('subsList').textContent.includes('$23'),
     $('subsList').textContent.slice(0, 140));
  ok('pins the one you gave in rands', $('subsList').textContent.includes('R101'),
     $('subsList').textContent.slice(0, 200));
  [...d.querySelectorAll('#subsList .pay')].find(b => b.textContent === 'Log it').click();
  ok('pay sheet offers the rand figure', Math.abs(Number($('payAmt').value) - 373.29) < 1, $('payAmt').value);

  console.log('\n=== 14. takeaway pot categories ===');
  const potSeed = JSON.parse(JSON.stringify(seed));
  potSeed.entries.push({ id: 90, amt: 150, cat: 'Mr D', note: '', date: '2026-08-31', type: 'out', cyc: '2026-08-28' });
  potSeed.entries.push({ id: 91, amt: 60, cat: 'Bella Mare Cafe', note: '', date: '2026-08-31', type: 'out', cyc: '2026-08-28' });
  dom = await boot(potSeed); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  const potNow = num($('pot').textContent);
  const potBase = await boot(seed).then(dd => num(dd.window.document.getElementById('pot').textContent));
  ok('Mr D and the cafe count as food', potNow === potBase + 210, potBase + ' → ' + potNow);
  ok('food tile shows a share', /% of your living spend/.test($('potSub').textContent),
     $('potSub').textContent);
  ok('last-order card appears', $('foodCard').style.display === 'block');
  ok('and names when', /Today|Yesterday|days ago/.test($('foodAgo').textContent),
     $('foodAgo').textContent);
  ok('with an average order', num($('foodAvg').textContent) > 0, $('foodAvg').textContent);
  ok('and its cost in days', Number($('foodCost').textContent) > 0, $('foodCost').textContent);
  ok('Mr D is in the category list', [...d.querySelectorAll('#cat option')].some(o => o.textContent === 'Mr D'));
  ok('Take out is in the list', [...d.querySelectorAll('#cat option')].some(o => o.textContent === 'Take out'));
  ok('Bella Mare Cafe is in the list', [...d.querySelectorAll('#cat option')].some(o => o.textContent === 'Bella Mare Cafe'));

  console.log('\n=== 15. conversions stay put when rates move ===');
  const lock = JSON.parse(JSON.stringify(seed));
  lock.rates = { ZAR: 1, GBP: 21.78, USD: 16.23, GHS: 1.4464 };
  lock.bills = [];
  dom = await boot(lock); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  $('addBillBtn').click();
  $('billName').value = 'Claude'; $('billAmt').value = '23';
  $('billCur').value = 'USD'; $('billCur').dispatchEvent(new w.Event('change'));
  $('billCat').value = 'Subscriptions';
  $('billSave').click();
  const lockedAt = num($('due').textContent);
  ok('converted on save', Math.abs(lockedAt - 373) < 2, $('due').textContent);
  let stored2 = JSON.parse(w.localStorage.getItem('slip:v4'));
  ok('rand figure written to the bill', stored2.bills[0].zar > 0, JSON.stringify(stored2.bills[0]));
  ok('rate recorded alongside it', stored2.bills[0].rate === 16.23, String(stored2.bills[0].rate));

  // the rand tanks overnight
  $('rUSD').value = '25'; $('rUSD').dispatchEvent(new w.Event('change'));
  await new Promise(r => setTimeout(r, 60));
  ok('the bill does NOT move with the rate', num($('due').textContent) === lockedAt,
     lockedAt + ' → ' + num($('due').textContent));
  $('dueStat').click();
  ok('it still shows the rate it was locked at', $('subsList').textContent.includes('16.23'),
     $('subsList').textContent.slice(0, 140));
  $('closeSubs').click();

  // an entry logged in dollars keeps its rand value too
  $('amt').value = '10'; $('cur').value = 'USD';
  $('cat').value = 'Other';
  $('addBtn').click();
  await new Promise(r => setTimeout(r, 60));
  stored2 = JSON.parse(w.localStorage.getItem('slip:v4'));
  const usdEntry = stored2.entries.find(e => e.cur === 'USD');
  ok('entry converted at the rate of the day', usdEntry.amt === 250, String(usdEntry.amt));
  $('rUSD').value = '30'; $('rUSD').dispatchEvent(new w.Event('change'));
  await new Promise(r => setTimeout(r, 60));
  stored2 = JSON.parse(w.localStorage.getItem('slip:v4'));
  ok('and never re-converts afterwards',
     stored2.entries.find(e => e.cur === 'USD').amt === 250,
     String(stored2.entries.find(e => e.cur === 'USD').amt));

  console.log('\n=== 16. double entries and the storage gauge ===');
  dom = await boot(seed, { confirm: false }); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  const n0 = JSON.parse(w.localStorage.getItem('slip:v4')).entries.length;
  $('amt').value = '250'; $('cat').value = 'Groceries';
  $('addBtn').click();
  await new Promise(r => setTimeout(r, 40));
  const n1 = JSON.parse(w.localStorage.getItem('slip:v4')).entries.length;
  ok('first tap logs it', n1 === n0 + 1, n0 + ' → ' + n1);
  ok('add button disables itself briefly', $('addBtn').disabled === true);
  $('amt').value = '250'; $('cat').value = 'Groceries';
  $('addBtn').disabled = false;              // simulate the button re-enabling
  $('addBtn').click();
  await new Promise(r => setTimeout(r, 40));
  const n2 = JSON.parse(w.localStorage.getItem('slip:v4')).entries.length;
  ok('an immediate repeat is queried, not logged', n2 === n1, n1 + ' → ' + n2);

  ok('gauge renders', $('gaugeFill').style.width.length > 0, $('gaugeFill').style.width);
  ok('gauge explains itself', /MB of about 5 MB/.test($('gaugeText').textContent),
     $('gaugeText').textContent);
  ok('counts entries', /entries/.test($('gaugeText').textContent), $('gaugeText').textContent);

  console.log('\n=== 17. pace uses a trailing week ===');
  const spike = JSON.parse(JSON.stringify(seed));
  dom = await boot(spike); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  ok('pace names its window', /last \d+ days|today/.test($('runSub').textContent),
     $('runSub').textContent);

  console.log('\n=== 18. savings are visible and explorable ===');
  dom = await boot(twoMonths); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  [...d.querySelectorAll('#sweepBox button')].find(b => /Save R/.test(b.textContent)).click();
  $('vaultSave').click();
  await new Promise(r => setTimeout(r, 60));
  ok('summary row shows nothing for an untouched month', $('saveCell').style.display === 'none',
     $('saveCell').style.display);
  $('withdrawBtn').click();
  $('vaultAmt').value = '2000'; $('vaultSave').click();
  await new Promise(r => setTimeout(r, 60));
  ok('a withdrawal appears in the summary row', $('saveCell').style.display === 'block');
  ok('and is labelled as coming out', $('saveCellCap').textContent === 'From savings',
     $('saveCellCap').textContent);
  ok('with the right amount', num($('saveCellVal').textContent) === 2000, $('saveCellVal').textContent);

  $('vaultOpen').click();
  ok('savings card opens its history', $('vaultLog').open === true);
  ok('history lists both movements', d.querySelectorAll('#vaultLogList li').length === 2,
     String(d.querySelectorAll('#vaultLogList li').length));
  ok('and totals them', /6 000|4 000/.test($('vaultLogSum').textContent.replace(/\s/g, ' ')),
     $('vaultLogSum').textContent);
  $('closeVaultLog').click();

  console.log('\n=== 19. a swept month pushed negative warns ===');
  // backdate a big spend into July, which was already swept clean
  $('when').value = '2026-08-01';
  $('amt').value = '2500';
  $('cat').value = 'Groceries';
  $('addBtn').click();
  await new Promise(r => setTimeout(r, 60));
  const sweepTxt = $('sweepBox').textContent.replace(/\s/g, ' ');
  ok('flags the shortfall', /is R2 500 short/.test(sweepTxt), sweepTxt.slice(0, 160));
  ok('offers to pull it back', /Take R2 500 back/.test(sweepTxt), sweepTxt.slice(0, 200));
  const fixBtn = [...d.querySelectorAll('#sweepBox button')]
      .find(b => /Take/.test(b.textContent));
  fixBtn.click();
  ok('withdrawal prefilled', Number($('vaultAmt').value) === 2500, $('vaultAmt').value);
  $('vaultSave').click();
  await new Promise(r => setTimeout(r, 60));
  ok('warning clears once settled',
     !/short/.test($('sweepBox').textContent), $('sweepBox').textContent.slice(0, 120));

  console.log('\n=== 20. receipts are gone ===');
  ok('no attach button', !$('attachBtn'));
  ok('no receipt dialog', !d.getElementById('rcptDlg'));
  ok('CSV header drops the column', !HTML_HAS_RECEIPT);

  console.log('\n=== 21. the goal and the savings tray agree ===');
  const goalSeed = JSON.parse(JSON.stringify(seed));   // R20 795 in, R3 500 goal, nothing saved
  dom = await boot(goalSeed); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  ok('card explains what is still held back',
     /3 500 of your R3 500 goal still held back/.test($('vaultSub').textContent.replace(/\s/g, ' ')),
     $('vaultSub').textContent);
  ok('offers to move it across',
     /Put R3 500 away/.test($('sweepBox').textContent.replace(/\s/g, ' ')),
     $('sweepBox').textContent.slice(0, 140));
  const dailyBefore = num($('safe').textContent);
  const onTrackBefore = num($('save').textContent);

  [...d.querySelectorAll('#sweepBox button')].find(b => /Put R/.test(b.textContent)).click();
  ok('prefilled with the whole goal', Number($('vaultAmt').value) === 3500, $('vaultAmt').value);
  $('vaultSave').click();
  await new Promise(r => setTimeout(r, 60));

  ok('savings now holds it', num($('vault').textContent) === 3500, $('vault').textContent);
  ok('daily rate is unchanged — no double counting',
     Math.abs(num($('safe').textContent) - dailyBefore) <= 1,
     dailyBefore + ' → ' + num($('safe').textContent));
  ok('on-track figure still reads the goal',
     Math.abs(num($('save').textContent) - onTrackBefore) <= 1,
     onTrackBefore + ' → ' + num($('save').textContent));
  ok('card now shows this month banked', num($('vault').textContent) === 3500,
     $('vault').textContent);
  ok('and says the goal is done', /goal is done/.test($('vaultSub').textContent),
     $('vaultSub').textContent);
  ok('offer disappears once met',
     !/Put R/.test($('sweepBox').textContent), $('sweepBox').textContent.slice(0, 120));
  ok('goal reads as met', /already put away/.test($('saveSub').textContent), $('saveSub').textContent);

  console.log('\n=== 22. two devices merge instead of clobbering ===');
  const merge = eval('(' + require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8')
      .match(/function mergeStores\(a,b\)\{[\s\S]*?\n  \}/)[0].replace('function mergeStores','function') + ')');
  const phone = { rev: 100, deleted: {}, goal: 3500,
    entries: [{ id: 1, date: '2026-08-28', amt: 100 }, { id: 2, date: '2026-08-29', amt: 200 }] };
  const droid = { rev: 200, deleted: {}, goal: 4000,
    entries: [{ id: 1, date: '2026-08-28', amt: 100 }, { id: 3, date: '2026-08-30', amt: 300 }] };
  let m = merge(phone, droid);
  ok('entries from both sides survive', m.entries.map(e => e.id).join() === '1,2,3',
     m.entries.map(e => e.id).join());
  ok('settings follow the newer device', m.goal === 4000, String(m.goal));

  const deletedThere = { rev: 300, deleted: { 2: Date.now() },
    entries: [{ id: 1, date: '2026-08-28', amt: 100 }] };
  m = merge(phone, deletedThere);
  ok('a deletion is not resurrected', m.entries.map(e => e.id).join() === '1',
     m.entries.map(e => e.id).join());

  const editedThere = { rev: 400, deleted: {}, entries: [{ id: 2, date: '2026-08-29', amt: 999 }] };
  m = merge(phone, editedThere);
  ok('the newer edit of the same entry wins', m.entries.find(e => e.id === 2).amt === 999,
     String(m.entries.find(e => e.id === 2).amt));

  const offlineA = { rev: 500, deleted: {}, entries: [{ id: 9, date: '2026-08-31', amt: 50 }] };
  const offlineB = { rev: 499, deleted: {}, entries: [{ id: 8, date: '2026-08-31', amt: 70 }] };
  m = merge(offlineA, offlineB);
  ok('both devices logging offline keep both', m.entries.length === 2, String(m.entries.length));

  console.log('\n=== 23. the daily allowance rolls over ===');
  // clean month: R10 000 in on the 28th, nothing spent, no goal, no bills
  const roll = {
    day: 25, starts: { '2026-08': '2026-08-28' }, goal: 0, cap: 300, cadence: 3.5,
    theme: 'light', rates: { ZAR: 1 }, cats: [], groups: [], bills: [], ticks: {},
    potCats: [], deleted: {},
    entries: [{ id: 1, amt: 10000, cat: 'Money in', note: '', date: '2026-08-28',
                type: 'in', cyc: '2026-08-28', man: true }]
  };
  dom = await boot(roll); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  // R10 000 with 25 days left = R400 today
  const banked = num($('safe').textContent);
  ok('allowance is pot over days left', Math.abs(banked - 400) < 3, 'got ' + banked);
  ok('sub names tomorrow if you skip today',
     /tomorrow becomes R417/.test($('safeSub').textContent), $('safeSub').textContent);

  // spend R150 today — today's figure drops by exactly that
  $('amt').value = '150'; $('cat').value = 'Groceries'; $('addBtn').click();
  await new Promise(r => setTimeout(r, 60));
  const after150 = num($('safe').textContent);
  ok("spending comes straight off today's figure", Math.abs(after150 - 250) < 3,
     banked + ' - 150 → ' + after150);
  ok('sub reports what is gone', /150 of today/.test($('safeSub').textContent),
     $('safeSub').textContent);

  // unspent money genuinely lifts tomorrow: R9 850 over 24 days = R410
  ok('tomorrow rises when today is quiet', /tomorrow becomes R410/.test($('safeSub').textContent),
     $('safeSub').textContent);

  // now blow past it
  $('amt').value = '2000'; $('cat').value = 'Groceries';
  $('addBtn').disabled = false; $('addBtn').click();
  await new Promise(r => setTimeout(r, 60));
  const over = num($('safe').textContent);
  ok('overspending goes negative', over < 0, String(over));
  ok('tile turns red', $('safe').className.includes('bad'), $('safe').className);
  ok('says what tomorrow drops to',
     /tomorrow drops to R\d/.test($('safeSub').textContent), $('safeSub').textContent);

  console.log('\n=== 24. bills still come out of the same pot ===');
  const oneP = JSON.parse(JSON.stringify(roll));
  oneP.entries.push({ id: 2, amt: 4000, cat: 'Rent', note: '', date: '2026-08-28',
                      type: 'out', cyc: '2026-08-28' });
  dom = await boot(oneP); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  // R10 000 - R4 000 rent = R6 000 over 25 days left = R240/day
  const afterRent = num($('safe').textContent);
  ok('a paid bill reduces the daily allowance', Math.abs(afterRent - 240) < 3, 'got ' + afterRent);
  ok('available reflects it too', num($('secVal').textContent) === 6000, $('secVal').textContent);

  console.log('\n=== 25. only rent sits outside the day-to-day figures ===');
  const exSeed = {
    day: 25, starts: { '2026-08': '2026-08-28' }, goal: 0, cap: 300, cadence: 3.5,
    theme: 'light', rates: { ZAR: 1 }, cats: [], groups: [], bills: [], ticks: {},
    potCats: [], exclude: [], deleted: {},
    entries: [
      { id: 1, amt: 10000, cat: 'Money in', note: '', date: '2026-08-28', type: 'in', cyc: '2026-08-28', man: true },
      { id: 2, amt: 4000, cat: 'Rent', note: '', date: '2026-08-28', type: 'out', cyc: '2026-08-28' },
      { id: 3, amt: 399, cat: 'Internet', note: '', date: '2026-08-29', type: 'out', cyc: '2026-08-28' },
      { id: 4, amt: 229, cat: 'Subscriptions', note: '', date: '2026-08-29', type: 'out', cyc: '2026-08-28' },
      { id: 5, amt: 200, cat: 'Electricity', note: '', date: '2026-08-30', type: 'out', cyc: '2026-08-28' }
    ]
  };
  dom = await boot(exSeed); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  ok('rent alone is held out', num($('billVal').textContent) === 4000, $('billVal').textContent);
  ok('fibre, subs and power all count', num($('outVal').textContent) === 828,
     $('outVal').textContent);
  // R10 000 - 4 000 - 828 = R5 172 over 25 days = R207 today
  ok('daily allowance reflects them', Math.abs(num($('safe').textContent) - 207) < 3,
     $('safe').textContent);
  // those three are dated last week, so log one today and watch the week move
  $('tabWeek').click();
  const weekBefore = num($('outVal').textContent);
  $('amt').value = '120'; $('cat').value = 'Subscriptions'; $('addBtn').click();
  await new Promise(r => setTimeout(r, 60));
  ok('a subscription moves the week figure', num($('outVal').textContent) === weekBefore + 120,
     weekBefore + ' → ' + num($('outVal').textContent));

  // a spend in an excluded category leaves the day alone
  $('tabMonth').click();
  const beforeRentSpend = num($('safe').textContent);
  $('amt').value = '500'; $('cat').value = 'Rent'; $('addBtn').click();
  await new Promise(r => setTimeout(r, 60));
  ok('more rent does not touch the daily figure',
     Math.abs(num($('safe').textContent) - beforeRentSpend) < 25,
     beforeRentSpend + ' → ' + num($('safe').textContent));

  // and the list is editable
  const exChips = [...d.querySelectorAll('#exList span')];
  ok('the exclusion list is offered in settings', exChips.length > 5, String(exChips.length));
  ok('rent and water start ticked',
     exChips.filter(c => c.textContent.startsWith('✓')).length === 2,
     exChips.filter(c => c.textContent.startsWith('✓')).map(c => c.textContent).join());
  exChips.find(c => c.textContent.includes('Electricity')).click();
  await new Promise(r => setTimeout(r, 60));
  $('tabMonth').click();
  // 399 fibre + 229 subs + 120 logged above = 748, minus the 200 electricity now excluded
  ok('adding one moves it out of living', num($('outVal').textContent) === 748,
     $('outVal').textContent);
  ok('and the label switches to Kept out', $('billCap').textContent === 'Kept out',
     $('billCap').textContent);
  ok('water is out of the day-to-day by default',
     JSON.parse(w.localStorage.getItem('slip:v4')).exclude.indexOf('Water / levies') > -1,
     JSON.stringify(JSON.parse(w.localStorage.getItem('slip:v4')).exclude));

  console.log('\n=== 26. bills are shaded in the chart, not counted as reckless ===');
  const shade = JSON.parse(JSON.stringify(exSeed));
  shade.entries = shade.entries.filter(e => e.type === 'in');
  shade.entries.push({ id: 7, amt: 900, cat: 'Internet', note: '', date: '2026-08-31', type: 'out', cyc: '2026-08-28' });
  shade.entries.push({ id: 8, amt: 60, cat: 'Uber Eats', note: '', date: '2026-08-31', type: 'out', cyc: '2026-08-28' });
  dom = await boot(shade); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  const todayBar = [...d.querySelectorAll('#bars .bar')].filter(b => b.style.height !== '3%').pop();
  ok('the bill part is hatched', !!todayBar.querySelector('i.fix'), todayBar.outerHTML.slice(0, 90));
  ok('and it says how much was a bill', /R900 of this was a bill/.test(todayBar.querySelector('i.fix').title),
     todayBar.querySelector('i.fix').title);
  ok('a big bill day is not marked as overspending', !todayBar.className.includes('hot'),
     todayBar.className);
  ok('caption explains the hatching', /hatched parts are bills/.test($('chartSub').textContent),
     $('chartSub').textContent);

  console.log('\n=== 27. the dead takeaway settings are gone ===');
  ok('no takeaway limit field', !$('sCap'));
  ok('no cadence field', !$('sCad'));
  ok('no bills checkbox on groups', !$('grpBill'));
  // a store that never had them must not grow them back
  const fresh = JSON.parse(JSON.stringify(shade));
  delete fresh.cap; delete fresh.cadence;
  const dom2 = await boot(fresh);
  dom2.window.document.getElementById('addBtn').click();       // force a save
  await new Promise(r => setTimeout(r, 60));
  const savedNow = JSON.parse(dom2.window.localStorage.getItem('slip:v4'));
  ok('and they are never written again',
     savedNow.cap === undefined && savedNow.cadence === undefined,
     JSON.stringify({ cap: savedNow.cap, cadence: savedNow.cadence }));

  console.log('\n=== 28. water on the rent invoice splits off ===');
  const rentWater = {
    day: 25, starts: { '2026-08': '2026-08-28' }, goal: 0, theme: 'light',
    rates: { ZAR: 1 }, cats: [], groups: [], ticks: {}, potCats: [], exclude: [], deleted: {},
    bills: [{ id: 'r1', n: 'Rent', a: 9346.65, cat: 'Rent', note: '9000 + 145 fee + 201.65 refuse' }],
    entries: [{ id: 1, amt: 20000, cat: 'Money in', note: '', date: '2026-08-28',
                type: 'in', cyc: '2026-08-28', man: true }]
  };
  dom = await boot(rentWater); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  d.querySelector('#dueList .pay').click();
  ok('split row hidden at the usual amount', $('paySplitRow').style.display === 'none',
     $('paySplitRow').style.display);

  $('payAmt').value = '9746.65';                      // rent invoice with R400 of water on it
  $('payAmt').dispatchEvent(new w.Event('input'));
  ok('split row appears once it is over', $('paySplitRow').style.display === 'block');
  ok('splitting is offered but not forced', $('paySplit').value === '', $('paySplit').value);
  ok('it explains the default', /goes down as one Rent entry/.test($('paySplitHint').textContent),
     $('paySplitHint').textContent);
  // opt in to splitting the water off
  $('paySplit').value = 'Water / levies';
  $('paySplit').dispatchEvent(new w.Event('change'));
  ok('and explains the split once chosen',
     /400 will be logged separately/.test($('paySplitHint').textContent),
     $('paySplitHint').textContent);

  $('paySave').click();
  await new Promise(r => setTimeout(r, 60));
  let ents = JSON.parse(w.localStorage.getItem('slip:v4')).entries;
  const rents = ents.filter(e => e.cat === 'Rent');
  const waters = ents.filter(e => e.cat === 'Water / levies');
  ok('exactly one rent entry', rents.length === 1, String(rents.length));
  ok('rent is the usual amount', Math.abs(rents[0].amt - 9346.65) < 0.01, String(rents[0].amt));
  ok('water is the remainder', Math.abs(waters[0].amt - 400) < 0.01, String(waters[0].amt));
  ok('water says where it came from', /invoice/.test(waters[0].note), waters[0].note);
  ok('the bill still ticks off', $('dueCard').style.display === 'none' &&
     $('dueList').innerHTML === '', $('dueCard').style.display + ' / ' + $('dueList').innerHTML);
  ok('neither touches the daily figure', num($('outVal').textContent) === 0,
     $('outVal').textContent);
  ok('both sit in the kept-out total', num($('billVal').textContent) === 9747,
     $('billVal').textContent);

  console.log('\n=== 29. keeping it as one entry still works ===');
  dom = await boot(rentWater); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  d.querySelector('#dueList .pay').click();
  $('payAmt').value = '9500';
  $('payAmt').dispatchEvent(new w.Event('input'));
  $('paySplit').value = '';
  $('paySplit').dispatchEvent(new w.Event('change'));
  $('paySave').click();
  await new Promise(r => setTimeout(r, 60));
  ents = JSON.parse(w.localStorage.getItem('slip:v4')).entries;
  ok('one entry at the full amount',
     ents.filter(e => e.cat === 'Rent').length === 1 &&
     ents.filter(e => e.cat === 'Rent')[0].amt === 9500,
     JSON.stringify(ents.filter(e => e.cat === 'Rent').map(e => e.amt)));

  console.log('\n=== 30. payment labels on a bill ===');
  const labelled = JSON.parse(JSON.stringify(rentWater));
  labelled.bills[0].labels = ['Rent + refuse', 'Rent + refuse + water'];
  labelled.bills.push({ id: 'w1', n: 'Water', a: 400, cat: 'Water / levies', note: '', labels: [] });
  dom = await boot(labelled); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();

  const rentPay = [...d.querySelectorAll('#dueList li')]
      .find(li => li.textContent.includes('Rent')).querySelector('.pay');
  rentPay.click();
  ok('label picker appears', $('payLabelRow').style.display === 'block');
  ok('first label is preselected', $('payLabel').value === 'Rent + refuse', $('payLabel').value);
  ok('and lands in the note', $('payNote').value === 'Rent + refuse', $('payNote').value);

  // this month the invoice included water
  $('payLabel').value = 'Rent + refuse + water';
  $('payLabel').dispatchEvent(new w.Event('change'));
  ok('switching the label rewrites the note', $('payNote').value === 'Rent + refuse + water',
     $('payNote').value);
  $('payAmt').value = '9746.65';
  $('payAmt').dispatchEvent(new w.Event('input'));
  $('paySave').click();
  await new Promise(r => setTimeout(r, 60));

  let all = JSON.parse(w.localStorage.getItem('slip:v4')).entries;
  const rentRows = all.filter(e => e.cat === 'Rent');
  ok('one rent entry only', rentRows.length === 1, String(rentRows.length));
  ok('at the full invoice amount', rentRows[0].amt === 9746.65, String(rentRows[0].amt));
  ok('labelled as covering water', rentRows[0].note === 'Rent + refuse + water', rentRows[0].note);
  ok('nothing lands in the daily figure', num($('outVal').textContent) === 0,
     $('outVal').textContent);

  console.log('\n=== 31. water billed on its own ===');
  dom = await boot(labelled); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  // pay rent without water first
  [...d.querySelectorAll('#dueList li')].find(li => li.textContent.includes('Rent'))
      .querySelector('.pay').click();
  $('paySave').click();
  await new Promise(r => setTimeout(r, 60));
  // then the water invoice turns up later
  const waterPay = [...d.querySelectorAll('#dueList li')]
      .find(li => li.textContent.includes('Water')).querySelector('.pay');
  ok('water is still listed as due on its own', !!waterPay);
  waterPay.click();
  $('payAmt').value = '380';
  $('paySave').click();
  await new Promise(r => setTimeout(r, 60));

  all = JSON.parse(w.localStorage.getItem('slip:v4')).entries;
  ok('still just one rent entry', all.filter(e => e.cat === 'Rent').length === 1,
     String(all.filter(e => e.cat === 'Rent').length));
  ok('water stands alone', all.filter(e => e.cat === 'Water / levies').length === 1);
  ok('water stays out of the daily figure', num($('outVal').textContent) === 0,
     $('outVal').textContent);
  ok('both sit under the kept-out total',
     Math.round(num($('billVal').textContent)) === 9727,
     $('billVal').textContent);
  ok('and everything is settled', $('dueCard').style.display === 'none',
     $('dueCard').style.display);

  console.log('\n=== 32. entry dates are editable ===');
  dom = await boot(seed); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  const anyRow = [...d.querySelectorAll('#log li')][0];
  anyRow.querySelector('.n').click();
  ok('edit sheet has a date', !!$('moveDate') && $('moveDate').value.length === 10,
     $('moveDate') ? $('moveDate').value : 'missing');
  $('moveDate').value = '2026-08-29';
  $('moveSave').click();
  await new Promise(r => setTimeout(r, 60));
  let ee = JSON.parse(w.localStorage.getItem('slip:v4')).entries;
  ok('the date actually changes', ee.some(e => e.date === '2026-08-29'),
     ee.map(e => e.date).join());

  console.log('\n=== 33. refunds ===');
  dom = await boot(seed); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  const livingBefore = num($('outVal').textContent);
  const inBefore = num($('inVal').textContent);
  ok('there is a refund tab', !!$('kRef'));
  $('kRef').click();
  ok('refund keeps the category picker', $('catRow').style.display !== 'none');
  $('amt').value = '250'; $('cat').value = 'Other'; $('note').value = 'Takealot return';
  $('addBtn').click();
  await new Promise(r => setTimeout(r, 60));
  $('kOut').click(); $('tabMonth').click();
  ok('a refund reduces spending', num($('outVal').textContent) === livingBefore - 250,
     livingBefore + ' → ' + num($('outVal').textContent));
  ok('and is NOT counted as income', num($('inVal').textContent) === inBefore,
     inBefore + ' → ' + num($('inVal').textContent));
  const ref = JSON.parse(w.localStorage.getItem('slip:v4')).entries
      .find(e => e.note === 'Takealot return');
  ok('stored as a negative spend', ref.amt === -250 && ref.type === 'out', JSON.stringify(ref));

  console.log('\n=== 34. marking a bill paid elsewhere ===');
  dom = await boot(withBills); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  const dueBefore = num($('due').textContent);
  $('dueStat').click();
  const tickBtn = [...d.querySelectorAll('#subsList .pay')].find(b => b.textContent === '✓');
  ok('there is a tick-without-logging button', !!tickBtn);
  tickBtn.click();
  await new Promise(r => setTimeout(r, 60));
  ok('the reserve drops', num($('due').textContent) < dueBefore,
     dueBefore + ' → ' + num($('due').textContent));
  ok('but no entry was created',
     !JSON.parse(w.localStorage.getItem('slip:v4')).entries.some(e => e.note === 'Fibre'));
  ok('it says it was not recorded', /not recorded here/.test($('subsList').textContent),
     $('subsList').textContent.slice(0, 160));
  const undoBtn = [...d.querySelectorAll('#subsList .pay')].find(b => b.textContent === '↺');
  ok('and it can be undone', !!undoBtn);
  undoBtn.click();
  await new Promise(r => setTimeout(r, 60));
  ok('undo restores the reserve', num($('due').textContent) === dueBefore,
     $('due').textContent);

  console.log('\n=== 35. backups are versioned and checked ===');
  ok('settings has tabs', d.querySelectorAll('#setTabs button').length === 5,
     String(d.querySelectorAll('#setTabs button').length));
  const panes = [...d.querySelectorAll('#setDlg section')];
  ok('only one pane shows at a time', panes.filter(p => !p.hidden).length === 1,
     String(panes.filter(p => !p.hidden).length));
  d.querySelector('#setTabs button[data-tab="data"]').click();
  ok('switching tabs swaps the pane',
     panes.find(p => p.getAttribute('data-pane') === 'data').hidden === false);
  ok('clearing needs a typed confirmation', /DELETE/.test(
     require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8')));

  console.log('\n=== 36. every sheet can be got out of ===');
  dom = await boot(withBills); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  const dialogs = [...d.querySelectorAll('dialog')];
  ok('all sheets have a nav bar', d.querySelectorAll('dialog .dhead').length === dialogs.length,
     d.querySelectorAll('dialog .dhead').length + ' of ' + dialogs.length);

  $('openSet').click();
  const setBar = $('setDlg').querySelector('.dhead');
  ok('a top-level sheet shows close, not back',
     setBar.children[0].hidden === true && setBar.children[2].hidden === false);
  setBar.children[2].click();
  ok('and the close button works', $('setDlg').open === false);

  $('tabMonth').click();
  $('dueStat').click();
  [...d.querySelectorAll('#subsList .pay')].find(b => b.textContent === 'Log it').click();
  const payBar = $('payDlg').querySelector('.dhead');
  ok('a stacked sheet shows back, not close',
     payBar.children[0].hidden === false && payBar.children[2].hidden === true);
  payBar.children[0].click();
  ok('back closes the child', $('payDlg').open === false);
  ok('and leaves the parent open', $('subsDlg').open === true);

  ok('there is a quick-add button', !!$('quickAdd'));
  ok('and a back-to-top button', !!$('toTop'));

  console.log('\n=== 37. navigation moved to a bottom bar ===');
  dom = await boot(twoMonths); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  ok('there is a bottom bar', !!$('tabbar'));
  ok('with four destinations', $('tabbar').querySelectorAll('button').length === 4,
     String($('tabbar').querySelectorAll('button').length));
  ok('the header is just the name', d.querySelector('.top').textContent.trim() === 'Tracker',
     d.querySelector('.top').textContent.trim());
  ok('the week/month toggle is pinned with it',
     !!d.querySelector('#stickytop .seg'));
  ok('every sheet has a drag handle',
     d.querySelectorAll('dialog .grab').length === d.querySelectorAll('dialog').length,
     d.querySelectorAll('dialog .grab').length + ' of ' + d.querySelectorAll('dialog').length);

  console.log('\n=== 38. stepping through past months ===');
  $('openHist').click();
  const row = d.querySelector('#histList .hist');
  ok('history rows are tappable', !!row);
  row.click();
  ok('a month sheet opens', $('monthDlg').open === true);
  ok('it names the month', $('monthTitle').textContent.length > 2, $('monthTitle').textContent);
  ok('and its date range', /–/.test($('monthRange').textContent), $('monthRange').textContent);
  ok('with a summary grid', d.querySelectorAll('#monthStats div').length === 6,
     String(d.querySelectorAll('#monthStats div').length));
  ok('and the entries inside it', d.querySelectorAll('#monthList li').length > 0,
     String(d.querySelectorAll('#monthList li').length));

  const firstTitle = $('monthTitle').textContent;
  ok('previous is disabled at the earliest month', $('monthPrev').disabled === true);
  $('monthNext').click();
  ok('next steps forward', $('monthTitle').textContent !== firstTitle,
     firstTitle + ' → ' + $('monthTitle').textContent);
  ok('and previous is now available', $('monthPrev').disabled === false);
  $('monthPrev').click();
  ok('stepping back returns', $('monthTitle').textContent === firstTitle,
     $('monthTitle').textContent);

  $('closeMonth').click();
  $('histDlg').close();
  $('secCap').click();
  ok('the month tile opens the current month', $('monthDlg').open === true);

  console.log('\n=== 39. the bottom bar shows where you are ===');
  dom = await boot(twoMonths); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  const lit = () => [...$('tabbar').querySelectorAll('button')]
      .filter(b => b.classList.contains('on')).map(b => b.id).join();
  ok('nothing is lit at rest', lit() === '', lit());
  $('openSet').click();
  ok('settings lights its button', lit() === 'openSet', lit());
  $('setDlg').close();
  await new Promise(r => setTimeout(r, 20));
  ok('and goes out when closed', lit() === '', lit());
  $('openHist').click();
  ok('months lights up', lit() === 'openHist', lit());
  d.querySelector('#histList .hist').click();
  ok('and stays lit when you go deeper into a month', lit() === 'openHist', lit());
  $('monthDlg').close(); $('histDlg').close();
  await new Promise(r => setTimeout(r, 20));
  $('openFind').click();
  ok('search lights up', lit() === 'openFind', lit());
  $('findDlg').close();

  console.log('\n=== 40. frosted glass toggle ===');
  ok('the toggle is in the Look tab',
     !!d.querySelector('#setDlg section[data-pane="look"] #sGlass'));
  ok('off by default', d.documentElement.getAttribute('data-glass') === 'off',
     d.documentElement.getAttribute('data-glass'));
  $('sGlass').checked = true;
  $('sGlass').dispatchEvent(new w.Event('change'));
  await new Promise(r => setTimeout(r, 40));
  ok('turning it on frosts the surfaces',
     d.documentElement.getAttribute('data-glass') === 'on',
     d.documentElement.getAttribute('data-glass'));
  ok('and it is remembered', JSON.parse(w.localStorage.getItem('slip:v4')).glass === true);
  const css = require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  ok('it uses a real backdrop blur', /backdrop-filter:saturate\(180%\) blur/.test(css));
  ok('and stands down for Reduce Transparency',
     /prefers-reduced-transparency: reduce/.test(css));

  console.log('\n=== 41. odd states behave sensibly ===');
  const bare = { day: 25, starts: { '2026-08': '2026-08-28' }, goal: 0, theme: 'light',
    rates: { ZAR: 1 }, cats: [], groups: [], ticks: {}, potCats: [], exclude: [], deleted: {},
    bills: [], entries: [{ id: 9, amt: 300, cat: 'Groceries', note: '', date: '2026-08-31',
                           type: 'out', cyc: '2026-08-28' }] };
  dom = await boot(bare); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  ok('no income means no invented allowance', num($('safe').textContent) === 0,
     $('safe').textContent);
  ok('and it says why', /Nothing recorded coming in/.test($('safeSub').textContent),
     $('safeSub').textContent);

  const refunded = JSON.parse(JSON.stringify(bare));
  refunded.entries = [
    { id: 1, amt: 5000, cat: 'Money in', note: '', date: '2026-08-28', type: 'in', cyc: '2026-08-28', man: true },
    { id: 2, amt: 300, cat: 'Uber Eats', note: '', date: '2026-08-30', type: 'out', cyc: '2026-08-28' },
    { id: 3, amt: -300, cat: 'Uber Eats', note: 'refund', date: '2026-08-31', type: 'out', cyc: '2026-08-28' }
  ];
  dom = await boot(refunded); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  ok('a refunded order is not "nothing yet"', /refunded in full/.test($('potSub').textContent),
     $('potSub').textContent);

  const netneg = JSON.parse(JSON.stringify(refunded));
  netneg.entries.push({ id: 4, amt: -400, cat: 'Takealot', note: 'return', date: '2026-08-31',
                        type: 'out', cyc: '2026-08-28' });
  dom = await boot(netneg); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  const widths = [...d.querySelectorAll('#breakList .bt i')].map(i => parseFloat(i.style.width));
  ok('no bar overruns its track', widths.every(v => v >= 0 && v <= 100), widths.join());
  ok('and none are NaN', widths.every(v => !isNaN(v)), widths.join());
  ok('credits are marked green', !!d.querySelector('#breakList .bt i.credit'));

  console.log('\n=== 42. today, this week and this month agree ===');
  const clean = { day: 25, starts: { '2026-08': '2026-08-28' }, goal: 0, theme: 'light',
    rates: { ZAR: 1 }, cats: [], groups: [], ticks: {}, potCats: [], exclude: [], deleted: {},
    bills: [], entries: [{ id: 1, amt: 10000, cat: 'Money in', note: '', date: '2026-08-28',
                           type: 'in', cyc: '2026-08-28', man: true }] };
  dom = await boot(clean); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  const readAll = () => {
    $('tabMonth').click(); const m = num($('bigNum').textContent);
    $('tabWeek').click();  const wk = num($('bigNum').textContent);
    return { today: num($('safe').textContent), wk, m };
  };
  const a = readAll();
  ok('today is the pot over the days left', a.today === 400, String(a.today));
  ok('the week is today plus each day after it', a.wk === 2800, String(a.wk));
  ok('the month is simply all the living money', a.m === 10000, String(a.m));

  $('amt').value = '150'; $('cat').value = 'Groceries'; $('addBtn').click();
  await new Promise(r => setTimeout(r, 60));
  const b = readAll();
  ok('spending comes off today exactly', b.today === 250, String(b.today));
  ok('and off the week by the same amount', a.wk - b.wk === 150, (a.wk - b.wk).toString());
  ok('and off the month by the same amount', a.m - b.m === 150, (a.m - b.m).toString());
  ok('no drift between the three', (a.wk - b.wk) === (a.today - b.today),
     (a.wk - b.wk) + ' vs ' + (a.today - b.today));

  // rent sits outside the *living* figures, but it is still real money leaving
  $('tabMonth').click();
  const livingBeforeRent = num($('outVal').textContent);
  $('amt').value = '500'; $('cat').value = 'Rent';
  $('addBtn').disabled = false; $('addBtn').click();
  await new Promise(r => setTimeout(r, 60));
  const cx = readAll();
  $('tabMonth').click();
  ok('rent is not counted as living spend',
     num($('outVal').textContent) === livingBeforeRent,
     livingBeforeRent + ' → ' + num($('outVal').textContent));
  ok('but the money really is gone, so today drops', cx.today < b.today,
     b.today + ' → ' + cx.today);
  ok('by exactly its share of the days left', Math.abs((b.today - cx.today) - 20) < 1,
     String(b.today - cx.today));
  ok('and the month drops by the full amount', Math.abs((b.m - cx.m) - 500) < 1,
     String(b.m - cx.m));

  console.log('\n=== 43. the PDF statement is a real file ===');
  const pdfSeed = JSON.parse(JSON.stringify(seed));
  pdfSeed.goal = 3500;
  let grabbed = null;
  const pdfDom = new (require('jsdom').JSDOM)(HTML, {
    runScripts: 'dangerously', url: 'https://x.github.io/a/', pretendToBeVisual: true,
    beforeParse(win) {
      const Real = win.Date;
      class FD extends Real { constructor(...a){ if(!a.length) super(TODAY+'T09:00:00Z'); else super(...a);} 
        static now(){ return new Real(TODAY+'T09:00:00Z').getTime(); } }
      win.Date = FD;
      win.matchMedia = () => ({ matches:false, addEventListener(){}, addListener(){} });
      win.fetch = () => Promise.reject(0);
      win.confirm = () => true; win.alert = () => {}; win.scrollTo = () => {};
      win.print = () => { grabbed = 'PRINT_WAS_CALLED'; };
      win.Blob = require('buffer').Blob; // jsdom's own Blob lacks .arrayBuffer()
      win.localStorage.setItem('slip:v4', JSON.stringify(pdfSeed));
      win.URL.createObjectURL = blob => { grabbed = blob; return 'blob:x'; };
      win.URL.revokeObjectURL = () => {};
      win.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
      win.HTMLDialogElement.prototype.close = function(){ this.open = false;
        this.dispatchEvent(new win.Event('close')); };
    }
  });
  await new Promise(r => setTimeout(r, 200));
  const pd = pdfDom.window.document;
  pd.getElementById('openHist').click();
  pd.getElementById('pdfNow').click();
  await new Promise(r => setTimeout(r, 80));
  ok('it does not rely on window.print', grabbed !== 'PRINT_WAS_CALLED');
  ok('a file was produced', grabbed && grabbed.type === 'application/pdf',
     grabbed && grabbed.type);
  const bytes = Buffer.from(await grabbed.arrayBuffer());
  ok('with a PDF header', bytes.slice(0, 5).toString() === '%PDF-', bytes.slice(0, 8).toString());
  ok('a cross-reference table', bytes.includes('xref'));
  ok('and a proper ending', bytes.slice(-6).toString().includes('%%EOF'));
  ok('it paginates long months', (bytes.toString('latin1').match(/\/Type\/Page[^s]/g) || []).length >= 1,
     String((bytes.toString('latin1').match(/\/Type\/Page[^s]/g) || []).length));

  console.log('\n=== 44. the cycle end is derived from the cycle, not from today ===');
  // On the 1st of a calendar month, today and the cycle start sit in different months.
  // Passing today to cycEnd made the month look ~30 days longer than it is.
  const sepSeed = {
    day: 25, starts: { '2026-08': '2026-08-28' }, goal: 0, theme: 'light',
    rates: { ZAR: 1 }, cats: [], groups: [], ticks: {}, potCats: [], exclude: [], deleted: {},
    bills: [], entries: [
      { id: 1, amt: 12000, cat: 'Money in', note: '', date: '2026-08-28', type: 'in', cyc: '2026-08-28', man: true }
    ]
  };
  const sepDom = new (require('jsdom').JSDOM)(HTML, {
    runScripts: 'dangerously', url: 'https://x.github.io/a/', pretendToBeVisual: true,
    beforeParse(win) {
      const Real = win.Date;
      class SD extends Real { constructor(...a){ if(!a.length) super('2026-09-01T09:00:00Z'); else super(...a);} 
        static now(){ return new Real('2026-09-01T09:00:00Z').getTime(); } }
      win.Date = SD;
      win.matchMedia = () => ({ matches:false, addEventListener(){}, addListener(){} });
      win.fetch = () => Promise.reject(0);
      win.confirm = () => true; win.alert = () => {}; win.scrollTo = () => {};
      win.localStorage.setItem('slip:v4', JSON.stringify(sepSeed));
      win.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
      win.HTMLDialogElement.prototype.close = function(){ this.open = false;
        this.dispatchEvent(new win.Event('close')); };
    }
  });
  await new Promise(r => setTimeout(r, 200));
  const sd = sepDom.window.document;
  const sg = id => sd.getElementById(id);
  sg('tabMonth').click();
  // 28 Aug – 24 Sep, so on 1 Sep there are 24 days left: R12 000 / 24 = R500
  ok('the month ends where the cycle ends', /24 Sep/.test(sg('secSub').textContent),
     sg('secSub').textContent);
  ok('the daily allowance uses the right number of days',
     Math.abs(Number(sg('safe').textContent.replace(/[^0-9]/g, '')) - 500) < 3,
     sg('safe').textContent);
  ok('and the run-out projection agrees with it',
     !/Oct/.test(sg('runSub').textContent), sg('runSub').textContent);

  console.log('\n=== 45. later PDF pages carry a header ===');
  const many = JSON.parse(JSON.stringify(seed));
  for (let i = 0; i < 60; i++) many.entries.push({ id: 500 + i, amt: 100 + i, cat: 'Uber Eats',
    note: 'order ' + i, date: '2026-08-31', type: 'out', cyc: '2026-08-28' });
  let pdfBlob = null;
  const bigDom = new (require('jsdom').JSDOM)(HTML, {
    runScripts: 'dangerously', url: 'https://x.github.io/a/', pretendToBeVisual: true,
    beforeParse(win) {
      const Real = win.Date;
      class BD extends Real { constructor(...a){ if(!a.length) super(TODAY+'T09:00:00Z'); else super(...a);} 
        static now(){ return new Real(TODAY+'T09:00:00Z').getTime(); } }
      win.Date = BD;
      win.matchMedia = () => ({ matches:false, addEventListener(){}, addListener(){} });
      win.fetch = () => Promise.reject(0);
      win.confirm = () => true; win.alert = () => {}; win.scrollTo = () => {};
      win.Blob = require('buffer').Blob; // jsdom's own Blob lacks .arrayBuffer()
      win.localStorage.setItem('slip:v4', JSON.stringify(many));
      win.URL.createObjectURL = b => { pdfBlob = b; return 'blob:x'; };
      win.URL.revokeObjectURL = () => {};
      win.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
      win.HTMLDialogElement.prototype.close = function(){ this.open = false;
        this.dispatchEvent(new win.Event('close')); };
    }
  });
  await new Promise(r => setTimeout(r, 200));
  bigDom.window.document.getElementById('openHist').click();
  bigDom.window.document.getElementById('pdfNow').click();
  await new Promise(r => setTimeout(r, 80));
  const big = Buffer.from(await pdfBlob.arrayBuffer()).toString('latin1');
  ok('it runs to several pages', (big.match(/\/Type\/Page[^s]/g) || []).length >= 2,
     String((big.match(/\/Type\/Page[^s]/g) || []).length));
  ok('later pages say which month they belong to', /continued/.test(big));
  ok('and repeat the column headers',
     (big.match(/\(Amount\)/g) || []).length >= 2,
     String((big.match(/\(Amount\)/g) || []).length));

  console.log('\n=== 46. yearly bills only appear in their month ===');
  const yearly = {
    day: 25, starts: {}, goal: 0, theme: 'light', rates: { ZAR: 1 }, cats: [], groups: [],
    ticks: {}, potCats: [], exclude: [], deleted: {}, holdings: [],
    bills: [
      { id: 'm1', n: 'Netflix', a: 229, cat: 'Subscriptions', every: 'month' },
      { id: 'y1', n: 'Tenorshare', a: 900, cat: 'Subscriptions', every: 'year', month: 5 }
    ],
    entries: [{ id: 1, amt: 12000, cat: 'Money in', note: '', date: '2026-08-25',
                type: 'in', cyc: '2026-08-25', man: true }]
  };
  dom = await boot(yearly); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  ok('a May bill is not reserved in September', num($('due').textContent) === 229,
     $('due').textContent);
  ok('nor listed as due', !$('dueList').textContent.includes('Tenorshare'),
     $('dueList').textContent);
  $('dueStat').click();
  ok('but it is mentioned as coming later',
     /not due this month: Tenorshare in May/.test($('subsFoot').textContent),
     $('subsFoot').textContent);

  const inMay = JSON.parse(JSON.stringify(yearly));
  inMay.bills[1].month = 9;          // September, the month this cycle pays for
  dom = await boot(inMay); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  ok('in its own month it is reserved', num($('due').textContent) === 1129,
     $('due').textContent);
  ok('and listed', $('dueList').textContent.includes('Tenorshare'));

  console.log('\n=== 47. savings show the month and the total ===');
  dom = await boot(twoMonths); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  [...d.querySelectorAll('#sweepBox button')].find(b => /Save R/.test(b.textContent)).click();
  $('vaultSave').click();
  await new Promise(r => setTimeout(r, 60));
  ok('the total counts it', num($('vaultAll').textContent) === 6000, $('vaultAll').textContent);
  ok('this month does not, since it belongs to August',
     num($('vault').textContent) === 0, $('vault').textContent);
  $('withdrawBtn').click();
  $('vaultAmt').value = '1000'; $('vaultSave').click();
  await new Promise(r => setTimeout(r, 60));
  ok('a withdrawal lowers the total', num($('vaultAll').textContent) === 5000,
     $('vaultAll').textContent);

  console.log('\n=== 48. investments ===');
  const inv = JSON.parse(JSON.stringify(yearly));
  inv.holdings = [
    { id: 'h1', n: 'Satrix MSCI World', kind: 'etf', sym: '', in: 5000, units: 0, price: 0, val: 6200 },
    { id: 'h2', n: 'Bitcoin', kind: 'crypto', sym: 'bitcoin', in: 2000, units: 0.001, price: 1800000, val: 0 },
    { id: 'h3', n: 'Emergency fund', kind: 'cash', sym: '', in: 3000, units: 0, price: 0, val: 3050 }
  ];
  dom = await boot(inv); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  ok('the card appears', $('invCard').style.display === 'block');
  // 6200 + (0.001 x 1 800 000 = 1800) + 3050 = 11 050 against 10 000 in
  ok('it totals what things are worth', num($('invValue').textContent) === 11050,
     $('invValue').textContent);
  ok('and shows the gain', /10 000 put in/.test($('invSub').textContent.replace(/\s/g, ' ')),
     $('invSub').textContent);
  ok('marked as up', $('invValue').className.includes('up'), $('invValue').className);
  ok('one row per holding', d.querySelectorAll('#invList .irow').length === 3,
     String(d.querySelectorAll('#invList .irow').length));
  ok('units and price shown where given',
     /0.001 at R1 800 000/.test(d.querySelector('#invList').textContent.replace(/\s/g, ' ')),
     d.querySelector('#invList').textContent.slice(0, 120));

  // none of it touches the spending maths
  const allowanceBefore = num($('safe').textContent);
  d.querySelector('#invList .irow').click();
  $('holdVal').value = '99999';
  $('holdSave').click();
  await new Promise(r => setTimeout(r, 60));
  ok('changing a holding leaves the allowance alone',
     num($('safe').textContent) === allowanceBefore,
     allowanceBefore + ' → ' + num($('safe').textContent));
  ok('but the investment total moves', num($('invValue').textContent) > 11050,
     $('invValue').textContent);

  console.log('\n=== 49. a yearly bill can be spread ===');
  const spread = JSON.parse(JSON.stringify(yearly));
  spread.bills[1].spread = true;          // Tenorshare R900 in May
  dom = await boot(spread); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  $('tabMonth').click();
  // R229 Netflix plus a twelfth of R900 = R75
  ok('a twelfth is held back out of season', num($('due').textContent) === 304,
     $('due').textContent);
  $('dueStat').click();
  ok('and it says so', /holding R75 back/.test($('subsFoot').textContent.replace(/\s/g, ' ')),
     $('subsFoot').textContent);

  console.log('\n=== 50. investments keep a history ===');
  const hist = JSON.parse(JSON.stringify(yearly));
  hist.holdings = [{ id: 'h1', n: 'Satrix', kind: 'etf', in: 5000, units: 0, price: 0, val: 6000 }];
  hist.invHist = [
    { d: '2026-07-01', w: 5200, i: 5000 },
    { d: '2026-07-25', w: 5600, i: 5000 }
  ];
  dom = await boot(hist); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  ok('it reports the trend against a month ago',
     /Up R400 \(7.1%\) over 37 days/.test($('invFoot').textContent),
     $('invFoot').textContent);
  const snaps = JSON.parse(w.localStorage.getItem('slip:v4')).invHist;
  ok('and records today', snaps[snaps.length - 1].d === TODAY, snaps[snaps.length - 1].d);
  ok('without duplicating it', snaps.filter(x => x.d === TODAY).length === 1,
     String(snaps.filter(x => x.d === TODAY).length));

  console.log('\n=== 51. reading a receipt keeps only the numbers ===');
  dom = await boot(seed); w = dom.window; d = w.document; $ = id => d.getElementById(id);
  const slip = ['CHECKERS HYPER', 'MILK 2L 24.99', 'BREAD 18.50',
                'SUBTOTAL 133.48', 'VAT 15% 17.41', 'TOTAL 133.48', '2026-08-30 14:22'].join('\n');
  $('scanBtn').click();
  ok('the sheet opens', $('scanDlg').open === true);
  $('scanText').value = slip;
  $('scanGo').click();
  ok('it finds the total, not the subtotal or the VAT',
     Number($('scanAmt').value) === 133.48, $('scanAmt').value);
  ok('and the date', $('scanDate').value === '2026-08-30', $('scanDate').value);
  ok('and guesses the category', $('scanCat').value === 'Groceries', $('scanCat').value);
  ok('and where it was', /CHECKERS/.test($('scanWho').value), $('scanWho').value);
  ok('and explains where the number came from', /TOTAL/.test($('scanFound').textContent),
     $('scanFound').textContent);

  const countBefore = JSON.parse(w.localStorage.getItem('slip:v4')).entries.length;
  $('scanUse').click();
  ok('it fills the form rather than logging behind your back',
     JSON.parse(w.localStorage.getItem('slip:v4')).entries.length === countBefore,
     String(countBefore));
  ok('with the amount ready', Number($('amt').value) === 133.48, $('amt').value);
  ok('and the date ready', $('when').value === '2026-08-30', $('when').value);
  ok('no image is stored anywhere',
     !/scanImage|dataURL|readAsDataURL/.test(
       require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8')));

  // a slip with no total line falls back to the largest number
  $('scanBtn').click();
  $('scanText').value = 'SPAR EXPRESS\nCOOLDRINK 22.50\nCHIPS 18.00\n40.50';
  $('scanGo').click();
  ok('it copes with no total line', Number($('scanAmt').value) === 40.50, $('scanAmt').value);
  ok('and says it guessed', /largest amount/.test($('scanFound').textContent),
     $('scanFound').textContent);

  console.log('\n=== result ===');
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
