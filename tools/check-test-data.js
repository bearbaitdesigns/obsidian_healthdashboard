// Loads generated test notes (real YAML parsing) into the mock vault and prints what each dashboard sees
process.env.FAKE_NOW = process.env.FAKE_NOW || '2026-11-12T15:00:00';
require('../test/clock');
const fs = require('fs'); const path = require('path'); const YAML = require('yaml');
const mock = require('../test/mock'); const { makeApp, registry } = mock;
const Plugin = require(path.resolve('dist/main.js'));
const DIR = process.argv[2];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
(async () => {
  const app = makeApp();
  let n = 0;
  for (const f of walk(DIR).filter((x) => x.endsWith('.md'))) {
    const txt = fs.readFileSync(f, 'utf8'); const m = /^---\n([\s\S]*?)\n---/.exec(txt);
    const fm = YAML.parse(m[1]); // throws on bad YAML
    const rel = path.relative(DIR, f);
    await app.vault.create(rel, '---\n' + Object.entries(fm).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n' + txt.slice(m[0].length)); n++;
  }
  const host = new Plugin(app, { id: 'health-dashboard', name: 'Health Dashboard', version: 't' }); host._loaded = true; await host.onload();
  await new Promise((r) => setTimeout(r, 400));
  const a = host.period.getAnalysis();
  console.log('notes', n);
  console.log('period: periods', a.periods.length, 'avg cycle', a.avgCycle && a.avgCycle.toFixed(1), 'cycles', a.periods.map((p) => p.cycleLength).join(','));
  const eps = host.migraine.getEpisodes();
  console.log('migraine: episodes', eps.length, 'aura', eps.filter(require('../dist/main.js')._internals ? () => false : () => false).length, 'ongoing', eps.filter((e) => !e.end).length);
  const B = host.bp.getRecords(); console.log('bp readings', B.length, 'from', B.map((r) => r.date).sort()[0]);
  console.log('illness', host.illness.getRecords().length, 'meds', host.meds.getRecords().length, 'current', host.meds.current().length, 'a1c', host.a1c.getRecords().length, 'visits', host.visits.getVisits().length);
  console.log('notes', host.getNotes ? host.getNotes().length : '?', 'missed', ['period', 'migraine'].map((k) => host.getMissed(k).length).join('/'));
  if (process.argv[3]) { // full health report
    const o = { from: '2026-05-12', to: '2026-11-12', name: 'Test Person', includeLog: true, includeMissed: true, includeGenNotes: true, notes: '', order: ['period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c'], allergies: true, rangeText: 'May 12, 2026 – Nov 12, 2026' };
    const { bytes, pageCount } = host.buildHealthReport(o);
    fs.writeFileSync(process.argv[3], Buffer.from(bytes)); console.log('report pages', pageCount);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
