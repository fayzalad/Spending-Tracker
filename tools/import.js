// Adds entries (or a month's budget) to the cloud copy the phones sync from, from this PC.
//
//   node tools/import.js entries.txt              dry run: shows every line and what would happen
//   node tools/import.js entries.txt --apply      adds them to the cloud copy
//   node tools/import.js --budget nov.json [--apply]
//   node tools/import.js --undo imports/<stamp>-added.json [--apply]
//
// It never does its own maths. It boots the real index.html offline (jsdom) with a copy of the
// cloud data and drives the same "Add a list of entries" and Budget sheets the phone uses, so the
// parsing, duplicate checks, cycle filing and budget shape are the app's own. Then it writes back
// ONLY what was added — new entries, one budget month, or tombstones — onto a fresh read of the
// cloud copy, leaving every other field (including rev) exactly as the phones last wrote it.
// That way a phone with an unsynced settings change still wins its settings, and the entries
// arrive through the normal entry-by-entry merge. Needs the GitHub CLI (gh) logged in with the
// gist scope; the token never touches this script.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'imports');          // gitignored: holds real money data
const FILE = 'slip-data.json';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const flag = f => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : null; };
const BUDGET = flag('--budget'), UNDO = flag('--undo');
const INPUT = BUDGET || UNDO || args.find(a => !a.startsWith('--'));
if (!INPUT) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 7).join('\n')); process.exit(1); }

const gh = (a, input) => execFileSync('gh', a, { encoding: 'utf8', input, maxBuffer: 64 << 20 });
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// the id lives in imports/gist-id.txt (gitignored): a secret gist can be read by anyone who has
// its id, and this repo is public, so the id must never be committed
function findGist() {
  if (process.env.TRACKER_GIST) return process.env.TRACKER_GIST;
  const saved = path.join(OUT, 'gist-id.txt');
  if (fs.existsSync(saved)) return fs.readFileSync(saved, 'utf8').trim();
  const list = JSON.parse(gh(['api', 'gists', '--paginate']));
  const hits = list.filter(g => g.files[FILE] && g.description === 'Tracker backup');
  if (hits.length !== 1) throw new Error('expected exactly one "Tracker backup" gist, found ' + hits.length +
    '. Set TRACKER_GIST to its id.');
  return hits[0].id;
}
function readCloud(id) {
  const g = JSON.parse(gh(['api', 'gists/' + id]));
  const f = g.files[FILE];
  if (!f || f.truncated) throw new Error('cloud file missing or too large to read in one go');
  return { raw: f.content, data: JSON.parse(f.content), updated: g.updated_at };
}
function writeCloud(id, data) {
  gh(['api', '-X', 'PATCH', 'gists/' + id, '--input', '-'],
     JSON.stringify({ files: { [FILE]: { content: JSON.stringify(data) } } }));
}

async function bootApp(data) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://fayzalad.github.io/Spending-Tracker/', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      w.fetch = () => Promise.reject(new Error('offline'));   // never syncs; this copy is thrown away
      w.confirm = () => true; w.alert = m => { w.__alert = m; }; w.prompt = () => '';
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}; w.print = () => {};
      const copy = Object.assign({}, data); delete copy.tok; delete copy.gistId;
      w.localStorage.setItem('slip:v4', JSON.stringify(copy));
      w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
      Object.defineProperty(w.navigator, 'serviceWorker', { value: undefined, configurable: true });
    }
  });
  await sleep(400);
  return dom.window;
}
const stored = w => JSON.parse(w.localStorage.getItem('slip:v4'));

async function entriesPlan(cloud) {
  const w = await bootApp(cloud.data), $ = id => w.document.getElementById(id);
  $('impOpen').click();
  $('impText').value = fs.readFileSync(INPUT, 'utf8');
  $('impText').dispatchEvent(new w.Event('input'));
  const lis = [...$('impList').querySelectorAll('li')];
  lis.forEach(li => {
    const on = li.querySelector('input').checked;
    const mark = li.className === 'bad' ? 'SKIP ' : on ? 'ADD  ' : 'HOLD ';
    console.log(mark + li.querySelector('b').textContent.padEnd(58) + ' ' +
      li.querySelector('.num').textContent.padStart(10) + '   ' + li.querySelector('em').textContent);
  });
  console.log('\n' + $('impSum').textContent);
  if ($('impGo').disabled) return [];
  const before = new Set(stored(w).entries.map(e => e.id));
  $('impGo').click();
  return stored(w).entries.filter(e => !before.has(e.id));
}

async function budgetPlan(cloud) {
  const spec = JSON.parse(fs.readFileSync(INPUT, 'utf8'));   // {month:'2026-11', inc, lines:[{n,cat,a}]}
  if (!/^\d{4}-\d{2}$/.test(spec.month || '') || !Array.isArray(spec.lines)) throw new Error('budget file needs month "YYYY-MM" and lines');
  const prior = (cloud.data.budgets || {})[spec.month];
  if (prior && ((prior.lines || []).length || Number(prior.inc) > 0))
    throw new Error(spec.month + ' already has a budget; edit it in the app instead');
  const w = await bootApp(cloud.data), $ = id => w.document.getElementById(id), d = w.document;
  $('budLine').click();
  // the sheet lists each cycle by the month it is named for ("November · 25 Oct – 24 Nov");
  // the key it saves under is checked against spec.month below, so a wrong pick cannot land
  const name = new Date(spec.month + '-15T12:00:00').toLocaleDateString('en-ZA', { month: 'long' });
  const found = [...$('budMonth').options].find(o => o.textContent.startsWith(name + ' ·'));
  if (!found) throw new Error('no cycle named for ' + spec.month + ' within three months of today');
  $('budMonth').value = found.value; $('budMonth').dispatchEvent(new w.Event('change'));
  $('budInc').value = String(spec.inc || ''); $('budInc').dispatchEvent(new w.Event('change'));
  for (const l of spec.lines) {
    $('budAdd').click();
    $('budCat').value = l.cat;
    if ($('budCat').value !== l.cat) throw new Error('no category called "' + l.cat + '"');
    $('budName').value = l.n; $('budAmt').value = String(l.a);
    $('budSaveBtn').click();
    if ($('budEdit').open) throw new Error('the app refused the line ' + JSON.stringify(l));
  }
  const all = stored(w).budgets, keys = Object.keys(all).filter(k => !(cloud.data.budgets || {})[k] ||
    JSON.stringify(all[k]) !== JSON.stringify(cloud.data.budgets[k]));
  if (keys.length !== 1 || keys[0] !== spec.month) throw new Error('budget landed on ' + keys.join() + ', not ' + spec.month);
  [...d.querySelectorAll('#budTot tr')].forEach(tr => console.log(tr.children[0].textContent.padEnd(26) + tr.children[1].textContent));
  [...d.querySelectorAll('#budList li')].forEach(li => console.log('  ' +
    [...li.querySelectorAll('b,.num,.bsub,.blines')].map(x => x.textContent.trim()).filter(Boolean).join('  |  ')));
  return { [spec.month]: all[spec.month] };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const id = findGist();
  const cloud = readCloud(id);
  console.log('Cloud copy last written ' + cloud.updated + ', ' + cloud.data.entries.length + ' entries.\n');

  let add = [], bud = null, undo = null;
  if (BUDGET) bud = await budgetPlan(cloud);
  else if (UNDO) {
    undo = JSON.parse(fs.readFileSync(INPUT, 'utf8')).ids;
    const have = cloud.data.entries.filter(e => undo.includes(e.id));
    have.forEach(e => console.log('REMOVE ' + e.date + ' · ' + e.cat + ' · ' + (e.note || '') + '  ' + e.amt));
    console.log('\n' + have.length + ' of ' + undo.length + ' entries from that import are in the cloud copy.');
  } else add = await entriesPlan(cloud);

  if (!add.length && !bud && !(undo && undo.length)) { console.log('\nNothing to write.'); return; }
  if (!APPLY) { console.log('\nDry run — nothing written. Add --apply to write it.'); return; }

  const tag = stamp();
  fs.writeFileSync(path.join(OUT, tag + '-before.json'), cloud.raw);
  const apply = fresh => {
    const next = JSON.parse(JSON.stringify(fresh));
    next.deleted = next.deleted || {};
    if (add.length) {
      const have = new Set(next.entries.map(e => e.id));
      next.entries = next.entries.concat(add.filter(e => !have.has(e.id) && !next.deleted[e.id]))
        .sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
    }
    if (bud) next.budgets = Object.assign({}, next.budgets || {}, bud);
    if (undo) { const now = Date.now(); undo.forEach(i => { next.deleted[i] = now; });
      next.entries = next.entries.filter(e => !undo.includes(e.id)); }
    return next;            // rev deliberately unchanged — see the note at the top
  };
  const landed = d => (!add.length || add.every(e => d.entries.some(x => x.id === e.id))) &&
    (!bud || Object.keys(bud).every(k => d.budgets && d.budgets[k] && d.budgets[k].rev >= bud[k].rev)) &&
    (!undo || undo.every(i => d.deleted && d.deleted[i] && !d.entries.some(x => x.id === i)));

  for (let attempt = 1; attempt <= 3; attempt++) {
    writeCloud(id, apply(readCloud(id).data));
    // a phone that read the cloud just before this write and saves just after it can overwrite
    // it; wait past its 4-second save delay and check, and write again if that happened
    await sleep(12000);
    const check = readCloud(id).data;
    if (landed(check)) {
      if (add.length) fs.writeFileSync(path.join(OUT, tag + '-added.json'),
        JSON.stringify({ ids: add.map(e => e.id), entries: add }, null, 1));
      console.log('\nWritten and checked (' + check.entries.length + ' entries in the cloud now).' +
        (add.length ? '\nTo take this import back out: node tools/import.js --undo imports/' + tag + '-added.json --apply' : '') +
        '\nCopy before the change: imports/' + tag + '-before.json. Phones pick it up the next time the app opens or comes to the front.');
      return;
    }
    console.log('Attempt ' + attempt + ': another device wrote over it; trying again.');
  }
  throw new Error('could not get the change to stick after 3 tries; nothing is lost, run it again');
})().then(() => process.exit(0),     // the app's own clock timer would otherwise keep node alive
  e => { console.error('\nSTOPPED: ' + e.message); process.exit(1); });
