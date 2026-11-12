// Migraine: 0–5 pain words, aura from the "Visual aura" symptom, Patterns numbers show their base
require('./clock');
const assert = require('assert'); const path = require('path'); const fs = require('fs'); const { execFileSync } = require('child_process');
const { registry, makeApp } = require('./mock');
const PluginClass = require(path.resolve(process.argv[2] || 'dist/main.js'));
const flush = () => new Promise((r) => setTimeout(r, 400));
const M = PluginClass._internals ? null : null;

(async () => {
  const app = makeApp();
  const add = (p, fm) => app.vault.create(p, '---\n' + Object.entries(fm).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n');
  const mk = (s, type, sym, meds, pain) => add('Migraine Log/Migraine ' + s + '.md', { entry: 'migraine', start: s, end: s, type, pain_max: pain, pain_avg: Math.max(1, pain - 1), symptoms: sym, triggers: ['Stress'], relief: [], medications: meds, head_location: [], notes: '' });
  await mk('2026-10-01', 'Migraine without aura', ['Nausea', 'Visual aura'], ['Excedrin | 2 tabs | 2026-10-01 |  | Full relief'], 5); // aura from the symptom even though the type says without
  await mk('2026-10-05', 'Migraine without aura', ['Nausea'], ['Excedrin | 2 tabs | 2026-10-05 |  | Not sure'], 4);
  await mk('2026-10-09', 'Tension-type', ['Nausea'], ['Excedrin | 2 tabs | 2026-10-09 |  | '], 2);
  await mk('2026-10-15', 'Migraine without aura', ['Visual aura'], ['Sumatriptan | 50 mg | 2026-10-15 |  | No relief', 'Excedrin | | 2026-10-15 | | '], 3);
  await mk('2026-10-20', 'Migraine with aura', ['Nausea'], [], 1); // aura from the type
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload();
  await flush();

  const MI = host.migraine && Object.getPrototypeOf(host.migraine).constructor;
  // pain words (internals live on the module; reach them through the report builder's import)
  const src = fs.readFileSync(path.resolve(process.argv[2] || 'dist/main.js'), 'utf8');
  assert(src.includes("const PAIN_WORDS = ['No pain', 'Very mild', 'Mild', 'Moderate', 'Severe', 'Very severe'];"));

  await registry.commands['health-dashboard:open-migraine'].checkCallback(false);
  await flush();
  const leaf = app.workspace.getLeavesOfType('health-dashboard')[0];
  const root = leaf.view.contentEl;
  // switch range to all time if there is a selector
  const t = root.textContent;
  // tile
  assert(/With aura\s*3\s*60% of 5 episodes/.test(t.replace(/\s+/g, ' ')) || t.includes('With aura'), 'aura tile present');
  const flat = t.replace(/\s+/g, ' ');
  console.log(flat.slice(flat.indexOf('With aura'), flat.indexOf('With aura') + 40));
  assert(flat.includes('With aura3') || flat.includes('With aura 3'), 'three episodes had an aura');
  // Patterns
  const i = flat.indexOf('Medications');
  const medPart = flat.slice(flat.indexOf('Bar: episodes used'), flat.indexOf('Bar: episodes used') + 160);
  console.log('meds:', medPart);
  assert(medPart.includes('Excedrin') && medPart.includes('1 of 1 rated · 100%'), 'Excedrin: helped 1 of 1 rated use');
  assert(medPart.includes('Sumatriptan') && medPart.includes('0 of 1 rated · 0%'));
  assert(flat.includes('Nausea4 of 5 · 80%') || flat.includes('Nausea 4 of 5 · 80%'), 'symptom count shows its base');
  // pain labels on the calendar legend
  assert(flat.includes('Very mild') && flat.includes('Very severe'), 'legend uses the pain words');

  // PDF
  await host.migraine.createReport({ from: new Date(2026, 8, 1), to: new Date(), name: 'Anna', includeLog: true, questions: '' });
  await flush();
  const k = [...app.__files.keys()].filter((x) => x.endsWith('.pdf')).pop();
  const f = path.join(__dirname, 'x-migfix.pdf'); fs.writeFileSync(f, Buffer.from(app.__files.get(k).bin));
  const pdf = execFileSync('pdftotext', ['-layout', f, '-']).toString();
  const pf = pdf.replace(/\s+/g, ' ');
  assert(/EPISODES WITH AURA/.test(pf) && /\b4 3 Migraine without aura Stress\b/.test(pf), 'PDF aura count');
  assert(pf.includes('60% of 5 episodes'), 'PDF aura share');
  assert(pf.includes('4 of 5 (80%)'), 'PDF patterns show their base');
  assert(pf.includes('1 very mild') && pf.includes('5 very severe'), 'PDF pain words');
  assert(pf.includes('1 of 1 (100%)'), 'PDF Excedrin helped 1 of 1 rated');
  fs.copyFileSync(f, path.join(__dirname, 'out-migfix.pdf'));
  console.log('MIGRAINE FIX OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
