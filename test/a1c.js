const assert = require('assert'); const path = require('path');
const { registry, makeApp, Modal, notices } = require('./mock');
const { seed } = require('./run-seed'); const { seedNew, daysAgo } = require('./seed-new');
const PluginClass = require(path.resolve(process.argv[2]));
const flush = () => new Promise((r) => setTimeout(r, 350));
const text = (e) => e.textContent;
const fire = (el, t, ev) => (el.listeners[t] || []).forEach((f) => f(ev || { key: '', preventDefault() {} }));
const lastModal = () => Modal.opened[Modal.opened.length - 1];
(async () => {
  const app = makeApp(); await seed(app); await seedNew(app);
  const add = (p, fm) => app.vault.create(p, '---\n' + Object.entries(fm).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n');
  const series = [[560, 7.4], [470, 7.1], [380, 6.9], [290, 7.2], [200, 6.8], [105, 6.6]];
  for (const [d, v] of series) await add('A1C/' + daysAgo(d) + ' A1C.md', { entry: 'a1c-result', date: daysAgo(d), a1c_percent: v, test_type: 'Lab blood test', lab: 'Landspítali lab', ordered_by: 'Dr. Sigrún Jónsdóttir' });
  await add('A1C/old-ifcc.md', { entry: 'a1c-result', date: daysAgo(650), a1c_mmol_mol: 62 }); // only mmol/mol stored
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload(); await flush();
  const A = require(path.resolve(process.argv[2]))._a1c;

  // conversions
  assert.strictEqual(A.toMmol(6.5), 48); assert.strictEqual(A.toMmol(7), 53); assert.strictEqual(A.toMmol(5.7), 39);
  assert.strictEqual(A.fromMmol(48), 6.5); assert.strictEqual(A.fromMmol(62), 7.8);
  assert.strictEqual(A.eagMg(7), 154); assert.strictEqual(A.eagMmol(7), 8.5);
  assert.strictEqual(A.classify(5.6).id, 'normal'); assert.strictEqual(A.classify(5.7).id, 'prediabetes'); assert.strictEqual(A.classify(6.4).id, 'prediabetes'); assert.strictEqual(A.classify(6.5).id, 'diabetes');
  console.log('commands:', Object.values(registry.commands).filter((c) => c.name.startsWith('A1C:')).map((c) => c.name).join(' | '));
  assert.deepStrictEqual(registry.ribbons.map((r) => r.id), ['health-dashboard'], 'no extra ribbon icon');

  // dashboard
  await registry.commands['a1c-tracker:open-dashboard'].callback();
  const el = app.workspace.getLeavesOfType('a1c-dashboard')[0].view.contentEl;
  let t = text(el);
  console.log('tiles:', el.querySelectorAll('.hk-tile').map((x) => x.textContent).join(' | '));
  assert(t.includes('7 results logged') && t.includes('A1C over time') && t.includes('All results') && t.includes('American Diabetes Association'));
  assert(el.querySelector('.hk-banner') && t.includes('next A1C test was due'), 'overdue banner (last test 105 days ago, every 3 months)');
  assert(el.querySelector('svg'));
  const rows = el.querySelector('tbody').children;
  assert.strictEqual(rows.length, 7);
  console.log('first row:', rows[0].children.map((c) => c.textContent).join(' | '));
  assert(rows[0].textContent.includes('6.6%') && rows[0].textContent.includes('▼ -0.2'));
  assert(rows[6].textContent.includes('7.8%'), 'mmol-only note converted');
  assert(host.a1c.statusEl.textContent === 'A1C test overdue', 'status bar');

  // log a result in mmol/mol
  Modal.opened.length = 0;
  registry.commands['a1c-tracker:log-result'].callback();
  let m = lastModal();
  assert.strictEqual(m.labC.value(), 'Landspítali lab', 'remembers last lab');
  assert(m.docC.options.includes('Dr. Sigrún Jónsdóttir') || m.docC.value() === 'Dr. Sigrún Jónsdóttir', 'ordered-by from visits');
  assert(m.medC && m.medC.options.includes('Amlodipine'), 'current medications offered');
  m.valIn.value = '25'; await m.save();
  assert(notices.some((n) => n.includes('between 3 and 20%')), 'validation');
  m.contentEl.querySelectorAll('.mt-chip').find((b) => b.textContent === 'Enter as mmol/mol').click();
  m.valIn.value = '46'; fire(m.valIn, 'input');
  console.log('live:', m.live.textContent);
  assert(m.live.textContent.includes('Prediabetes range') && m.live.textContent.includes('6.4%'));
  m.dateIn.value = daysAgo(2); m.medC.toggle('Amlodipine');
  await m.save(); await flush();
  const f = [...app.__files.entries()].find(([k]) => k === 'A1C/' + daysAgo(2) + ' A1C.md')[1].fm;
  console.log('new note:', JSON.stringify(f));
  assert(f.a1c_percent === 6.4 && f.a1c_mmol_mol === 46 && f.medications[0] === 'Amlodipine');
  t = text(el);
  assert(!el.querySelector('.hk-banner'), 'no longer overdue');
  assert(t.includes('-0.2') && t.includes('Prediabetes range'));

  // settings: doctor's target and units
  const tab = registry.settingTabs.find((x) => x.plugin === host.a1c);
  const rowsS = () => { tab.containerEl.__settings = []; tab.display(); return tab.containerEl.__settings; };
  console.log('settings:', rowsS().map((x) => x.name).join(' | '));
  await rowsS().find((x) => x.name === 'Use my doctor’s target').controls.find((c) => c.handler).handler(true); await flush();
  assert.strictEqual(host.a1c.settings.target, 7);
  await rowsS().find((x) => x.name === 'Target A1C (%)').controls.find((c) => c.handler).handler('6.5'); await flush();
  t = text(el);
  assert(t.includes('Your target') && t.includes('Below 6.5%') && t.includes('below target'));
  await rowsS().find((x) => x.name === 'Show A1C as').controls.find((c) => c.handler).handler('both'); await flush();
  assert(text(el).includes('6.4% (46 mmol/mol)'));
  await rowsS().find((x) => x.name === 'Glucose unit').controls.find((c) => c.handler).handler('mg/dL'); await flush();
  assert(text(el).includes('137 mg/dL'));

  // PDF
  const pdf = Buffer.from(A.buildReport(host.a1c, { from: daysAgo(400), to: daysAgo(0), name: 'Sample Person', notes: 'Is 6.4% good enough to lower the dose?', includeMeds: true })).toString('latin1');
  assert(pdf.startsWith('%PDF-') && pdf.includes('(A1C report)') && pdf.includes('Target set by doctor: below 6.5%') && pdf.includes('mmol/mol') && pdf.includes('Amlodipine') && pdf.includes('lower the dose'));
  assert(pdf.includes('The chart includes earlier results'), 'context note when earlier data exists');
  console.log('PDF pages:', (pdf.match(/\/Type \/Page /g) || []).length);
  Modal.opened.length = 0;
  registry.commands['a1c-tracker:pdf-report'].callback();
  await lastModal().go([['all', 'All data']]); await flush();
  assert([...app.__files.keys()].some((k) => k.startsWith('A1C/Reports/') && k.endsWith('.pdf')));
  require('fs').writeFileSync(path.join(__dirname, 'a1c-report.pdf'), Buffer.from(A.buildReport(host.a1c, { from: '', to: daysAgo(0), name: 'Sample Person', notes: 'Is 6.4% good enough to lower the dose?', includeMeds: true })));
  await registry.commands['a1c-tracker:export-csv'].callback();

  // hub
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const root = app.workspace.getLeavesOfType('health-dashboard')[0].view.contentEl;
  root.querySelectorAll('.hd-tab')[0].click();
  t = text(root);
  const card = root.querySelectorAll('.hd-sum').find((x) => x.cls.has('is-a1c'));
  console.log('overview card:', card.querySelectorAll('.hd-stat').map((x) => x.textContent).join(' | '));
  assert(t.includes('Log A1C'));
  root.querySelectorAll('.hd-tab').find((b) => b.textContent === 'A1C').click();
  assert(root.querySelector('.a1c-dashboard'));
  const since = host.sinceSummary(daysAgo(30), daysAgo(0));
  console.log('since:', since.filter((l) => l.startsWith('A1C')).join(''));
  assert(since.some((l) => l.startsWith('A1C 6.4% (46 mmol/mol)') && l.includes('previous 6.6%')));
  // selectors + toggle off/on
  const hub = registry.settingTabs.find((x) => x.plugin === host);
  hub.containerEl.__settings = []; hub.display();
  assert(hub.containerEl.querySelectorAll('.hd-sel-name').some((x) => x.textContent === 'Labs and clinics'));
  await hub.containerEl.__settings.find((x) => x.name === 'A1C').controls.find((c) => c.handler).handler(false); await flush();
  assert(!registry.commands['a1c-tracker:log-result'] && !root.querySelectorAll('.hd-tab').some((b) => b.textContent === 'A1C'));
  hub.containerEl.__settings = []; hub.display();
  await hub.containerEl.__settings.find((x) => x.name === 'A1C').controls.find((c) => c.handler).handler(true); await flush();
  assert(registry.commands['a1c-tracker:log-result']);
  console.log('A1C OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
