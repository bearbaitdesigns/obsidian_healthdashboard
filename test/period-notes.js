require('./clock');
const assert = require('assert'); const path = require('path');
const { registry, makeApp, Modal } = require('./mock');
const PluginClass = require(path.resolve(process.argv[2]));
const flush = () => new Promise((r) => setTimeout(r, 350));
(async () => {
  const app = makeApp();
  // two old-style day notes from before
  for (const [d, flow, pain] of [['2026-09-01', 'heavy', 4], ['2026-09-02', 'medium', 3], ['2026-09-03', 'light', 1], ['2026-09-15', 'none', 0], ['2026-09-29', 'heavy', 3], ['2026-09-30', 'medium', 2]])
    await app.vault.create('Period Tracker/Logs/' + d + '.md', '---\ntype: "period-log"\ndate: "' + d + '"\nflow: "' + flow + '"\npain: ' + pain + '\nsymptoms: ["Cramps"]\nmedications: []\n---\n');
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload(); await flush();
  const per = host.period;
  const P = PluginClass._period || null;
  const notes = () => [...app.__files.keys()].filter((k) => k.startsWith('Period Tracker/Logs/')).sort();
  const fmOf = (k) => app.__files.get(k).fm;
  assert.strictEqual(per.getEntries().length, 6);
  assert(per.getEntries().every((e) => e.kind === 'day'));
  // first-two-days average: (4+3)/2 and (3+2)/2
  const a = per.getAnalysis();
  assert.deepStrictEqual(a.periods.map((p) => p.painFirst2), [3.5, 2.5]);

  // convert
  const n = await per.convertDayNotes(); await flush();
  assert.strictEqual(n, 6);
  console.log('after convert:', notes().join(' | '));
  assert.deepStrictEqual(notes(), ['Period Tracker/Logs/Period 2026-09-01.md', 'Period Tracker/Logs/Period 2026-09-29.md']);
  const f1 = fmOf('Period Tracker/Logs/Period 2026-09-01.md');
  assert.strictEqual(f1.type, 'period'); assert.strictEqual(f1.start, '2026-09-01'); assert.strictEqual(f1.end, '2026-09-03');
  assert.deepStrictEqual(f1.days.map((d) => d.date), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-15'], 'mid-cycle day stays with its cycle');
  assert(app.__files.get('Period Tracker/Logs/Period 2026-09-01.md').content.includes('| 1 Sep 2026 | Heavy | 4/5 | Cramps |'), 'readable table in the note');
  assert.strictEqual(per.getEntries().length, 6); assert(per.getEntries().every((e) => e.kind === 'period'));
  assert.deepStrictEqual(per.getAnalysis().periods.map((p) => p.painFirst2), [3.5, 2.5], 'same stats after converting');

  // new days: continues the period, a new period starts a new note
  const base = (date, flow, pain) => ({ day: per.getEntries()[0].day + Math.round((new Date(date) - new Date('2026-09-01')) / 864e5), flow, pain, symptoms: ['Fatigue'], medications: [], notes: '' });
  await per.saveEntry(base('2026-10-01', 'light', 1)); await flush();
  assert.deepStrictEqual(fmOf('Period Tracker/Logs/Period 2026-09-29.md').days.map((d) => d.date), ['2026-09-29', '2026-09-30', '2026-10-01']);
  await per.saveEntry(base('2026-10-27', 'heavy', 4)); await flush();
  assert(notes().includes('Period Tracker/Logs/Period 2026-10-27.md'), 'new period, new note');
  await per.saveEntry(base('2026-10-10', 'none', 0)); await flush();
  assert(fmOf('Period Tracker/Logs/Period 2026-09-29.md').days.some((d) => d.date === '2026-10-10'), 'cycle day joins the cycle');
  // a period logged late, inside an earlier note's cycle: later days move to its new note
  await per.saveEntry(base('2026-09-20', 'heavy', 2)); await flush();
  console.log('after backfill:', notes().join(' | '));
  assert(notes().includes('Period Tracker/Logs/Period 2026-09-20.md'));
  assert(!fmOf('Period Tracker/Logs/Period 2026-09-01.md').days.some((d) => d.date === '2026-09-20'));
  // the day before a period joins it and moves its start
  await per.saveEntry(base('2026-10-26', 'light', 1)); await flush();
  const f4 = fmOf('Period Tracker/Logs/Period 2026-10-27.md');
  assert.strictEqual(f4.start, '2026-10-26'); assert.strictEqual(f4.days.length, 2);
  // edit an existing day in place
  const e27 = per.getEntries().find((e) => e.day === base('2026-10-27').day);
  await per.saveEntry(Object.assign({}, base('2026-10-27', 'medium', 5))); await flush();
  assert.strictEqual(fmOf('Period Tracker/Logs/Period 2026-10-27.md').days.find((d) => d.date === '2026-10-27').pain, 5);
  // delete days; an empty note goes to the trash
  await per.deleteEntry(per.getEntries().find((e) => e.day === base('2026-09-20').day)); await flush();
  assert(!notes().includes('Period Tracker/Logs/Period 2026-09-20.md'), 'empty note removed');
  // log modal still works with period notes
  registry.commands['period-tracker:log-today'].callback();
  assert(Modal.opened.length, 'log window opens');
  console.log('PERIOD NOTES OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
