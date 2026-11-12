const assert = require('assert'); const path = require('path'); const fs = require('fs'); const { execFileSync } = require('child_process');
const { registry, makeApp, Modal, notices } = require('./mock');
const { seed } = require('./run-seed'); const { seedNew, daysAgo } = require('./seed-new');
const PluginClass = require(path.resolve(process.argv[2]));
const X = PluginClass._extras;
const flush = (ms) => new Promise((r) => setTimeout(r, ms || 400));
const text = (e) => e.textContent;
const lastModal = () => Modal.opened[Modal.opened.length - 1];
const pdfText = (bytes, name) => { const f = path.join(__dirname, name); fs.writeFileSync(f, Buffer.from(bytes)); return execFileSync('pdftotext', ['-layout', f, '-']).toString(); };
(async () => {
  const app = makeApp(); await seed(app); await seedNew(app);
  await app.vault.create('A1C/x.md', '---\nentry: "a1c-result"\ndate: "' + daysAgo(40) + '"\na1c_percent: 6.6\n---\n');
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload(); await flush();
  await host.setUserName('Anna Jónsdóttir');
  const migStatsBefore = PluginClass._extras && host.migraine.getEpisodes().length;
  const perEntriesBefore = host.period.getAnalysis().entries.length;
  const migDays30Before = require(path.resolve(process.argv[2]))._a1c && host.migraine.getEpisodes().length;

  /* ---- every dashboard ends with a notes card; period and migraine also with "without an exact date" ---- */
  const views = { period: 'period-tracker-dashboard', migraine: 'migraine-tracker-dashboard', visits: 'doctor-visits-dashboard', bp: 'blood-pressure-dashboard', illness: 'sickness-dashboard', meds: 'medications-dashboard', a1c: 'a1c-dashboard' };
  const viewEl = (k) => { const v = app.workspace.getLeavesOfType(views[k])[0].view; return v.contentEl.children.length ? v.contentEl : v.containerEl.children[1]; };
  for (const k of Object.keys(views)) await registry.commands[{ period: 'period-tracker', migraine: 'migraine-tracker', visits: 'doctor-visits', bp: 'blood-pressure', illness: 'sickness-tracker', meds: 'medication-list', a1c: 'a1c-tracker' }[k] + ':open-dashboard'].callback();
  await flush();
  for (const k of Object.keys(views)) {
    const el = viewEl(k);
    const ex = el.querySelector('.hd-extras');
    assert(ex, 'extras on ' + k);
    assert(ex.querySelector('.hd-x-notes'), 'notes card on ' + k);
    assert.strictEqual(!!ex.querySelector('.hd-x-missed'), ['period', 'migraine'].includes(k), 'missed card only on period/migraine: ' + k);
  }
  console.log('notes card on all 7 dashboards; missed-record card on period and migraine');

  /* ---- add a migraine note from the migraine dashboard ---- */
  Modal.opened.length = 0;
  viewEl('migraine').querySelector('.hd-x-notes').querySelector('.hd-x-btn').click();
  let m = lastModal();
  assert.strictEqual(m.aboutC.value(), 'Migraine');
  m.titleIn.value = 'New job'; m.textIn.value = 'Started a new job with screen work all day. Migraines seem worse in the afternoon.';
  await m.save(); await flush();
  const noteFile = [...app.__files.keys()].find((k) => k.startsWith('Health Notes/Notes/Migraine/'));
  console.log('note saved to:', noteFile, JSON.stringify(app.__files.get(noteFile).fm));
  assert(text(viewEl('migraine')).includes('Started a new job'), 'shows on migraine dashboard');
  // general note from Overview
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const root = app.workspace.getLeavesOfType('health-dashboard')[0].view.contentEl;
  root.querySelectorAll('.hd-tab')[0].click();
  const ovNotes = root.querySelector('.hd-board').children.find((c) => c.attrs['data-key'] === 'notes');
  assert(ovNotes && ovNotes.cls.has('hd-sortable'), 'Overview notes block is draggable');
  Modal.opened.length = 0;
  registry.commands['health-dashboard:add-note'].callback();
  m = lastModal(); m.textIn.value = 'Moved house in October; sleeping badly since.'; m.dateIn.value = daysAgo(20);
  await m.save(); await flush();
  assert(text(root).includes('Moved house in October'), 'general note on Overview');
  assert(!text(viewEl('migraine')).includes('Moved house'), 'general note not on migraine dashboard');
  // empty note rejected
  Modal.opened.length = 0; registry.commands['health-dashboard:add-note'].callback(); m = lastModal(); await m.save();
  assert(notices.some((n) => n.includes('Write something')));
  // a BP note and an A1C note
  for (const [k, t] of [['bp', 'Bought a new upper-arm monitor.'], ['a1c', 'Cut down on sugary drinks.'], ['illness', 'Kids brought home a cold again.'], ['visits', 'Need to ask about a referral.'], ['meds', 'Pharmacy changed magnesium brand.'], ['period', 'Cycle felt longer after travelling.']]) {
    Modal.opened.length = 0; new X.NoteModal(host, k).open(); m = lastModal(); m.textIn.value = t; m.dateIn.value = daysAgo(5); await m.save();
  }
  await flush();

  /* ---- missed records ---- */
  Modal.opened.length = 0;
  registry.commands['health-dashboard:missed-migraine'].checkCallback(false);
  m = lastModal();
  const month = daysAgo(60).slice(0, 7);
  m.monthIn.value = month; m.countIn.value = '2'; m.sevC.toggle('Severe'); m.roughIn.value = 'both at the start of the month'; m.notesIn.value = 'Was travelling, forgot to log.';
  await m.save(); await flush();
  Modal.opened.length = 0;
  registry.commands['health-dashboard:missed-period'].checkCallback(false);
  m = lastModal();
  m.modeC.toggle('Between two dates'); m.fromIn.value = daysAgo(250); m.toIn.value = daysAgo(235); m.lenIn.value = '5'; m.sevC.toggle('Heavy');
  await m.save(); await flush();
  Modal.opened.length = 0;
  new X.MissedModal(host, 'migraine').open(); m = lastModal(); m.modeC.toggle('I’m not sure'); await m.save();
  assert(notices.some((n) => n.includes('roughly when')), 'unknown date needs a description');
  m.roughIn.value = 'sometime last winter'; await m.save(); await flush();
  const missed = host.getMissed();
  console.log('missed records:', missed.map((r) => r.tracker + ': ' + X.whenLabel(r) + ' ×' + r.count).join(' | '));
  assert.strictEqual(missed.length, 3);
  // statistics untouched
  assert.strictEqual(host.migraine.getEpisodes().length, migStatsBefore, 'migraine statistics unchanged');
  assert.strictEqual(host.period.getAnalysis().entries.length, perEntriesBefore, 'period statistics unchanged');
  const migEl = viewEl('migraine');
  assert(text(migEl).includes('Migraines without an exact date') && text(migEl).includes('3 migraines you logged later') && text(migEl).includes('sometime last winter'));
  assert(text(viewEl('period')).includes('Periods without an exact date'));

  /* ---- each tracker's own report includes them ---- */
  const tmpPdf = async (pred) => { await flush(); const k = [...app.__files.keys()].filter((x) => x.endsWith('.pdf') && pred(x)).pop(); return Buffer.from(app.__files.get(k).bin); };
  await host.migraine.createReport({ from: new Date(Date.now() - 200 * 864e5), to: new Date(), name: 'Anna', includeLog: true, questions: '', includeMissed: true, includeGenNotes: true });
  let t = pdfText(await tmpPdf((x) => /Migraine report/.test(x)), 'x-mig.pdf');
  assert(t.includes('Migraines without an exact date') && t.includes('both at the start of') && t.includes('sometime last winter') && t.includes('New job: Started a new job'), 'migraine report extras');
  console.log('migraine report: missed records + notes ✓');
  const a = host.period.getAnalysis();
  await host.period.generateReport({ from: P0(a, 300), to: a.today, name: 'Anna', includeLog: true, includeNotes: false, includeMissed: true, includeGenNotes: true });
  t = pdfText(await tmpPdf((x) => /Period report/.test(x)), 'x-per.pdf');
  assert(t.includes('Periods without an exact date') && t.includes('days long') && t.includes('Cycle felt longer'), 'period report extras');
  await host.period.generateReport({ from: P0(a, 300), to: a.today, name: 'Anna', includeLog: true, includeMissed: false, includeGenNotes: false });
  t = pdfText(await tmpPdf((x) => /Period report/.test(x)), 'x-per2.pdf');
  assert(!t.includes('without an exact date') && !t.includes('Cycle felt longer'), 'can be left out');
  console.log('period report: included and excludable ✓');
  const B = PluginClass._bp, I = PluginClass._illness, A = PluginClass._a1c;
  t = pdfText(B.buildReport(host.bp, { from: daysAgo(29), to: daysAgo(0), includeLog: false, includeMeds: false, includeGenNotes: true }), 'x-bp.pdf');
  assert(t.includes('upper-arm monitor'), 'bp notes');
  t = pdfText(I.buildReport(host.illness, { from: daysAgo(364), to: daysAgo(0), includeGenNotes: true }), 'x-ill.pdf');
  assert(t.includes('Sickness report') && t.includes('TIMES SICK') && t.includes('Kids brought home'), 'sickness report');
  // visits report through its button
  Modal.opened.length = 0;
  registry.commands['doctor-visits:pdf-report'].checkCallback(false);
  await lastModal().go([['365', 'Last 12 months']]); await flush();
  t = pdfText(await tmpPdf((x) => /Doctor visits report/.test(x)), 'x-vis.pdf');
  assert(t.includes('Doctor visits report') && t.includes('Care team') && t.includes('referral'), 'visits report');
  assert(text(viewEl('visits')).includes('PDF report') && text(viewEl('illness')).includes('PDF report'), 'report buttons on visits and sickness dashboards');
  console.log('visits + sickness reports ✓; every dashboard has a report: period, migraine, visits, bp, illness, meds (list), a1c, overview');

  /* ---- one report from all dashboards ---- */
  Modal.opened.length = 0;
  root.querySelector('.hd-tabrow').children.find((b) => b.textContent === 'Health report (PDF)').click(); // in the tab row now
  m = lastModal();
  console.log('dialog sections:', m.list.children.map((c) => c.textContent).join(' | '));
  // drag: put A1C first, then BP; leave out Sickness
  const kids = m.list.children; const fixed = kids[0];
  const byKey = (k) => kids.find((c) => c.attrs['data-key'] === k);
  const wanted = ['a1c', 'bp', 'migraine', 'period', 'visits', 'illness', 'meds'];
  m.list.children = [fixed].concat(wanted.map(byKey));
  m.checks.illness.checked = false;
  m.notesIn.value = 'Please review my blood pressure and A1C trend.';
  m.range.toggle('Last 12 months');
  await m.go([['90', 'Last 3 months'], ['180', 'Last 6 months'], ['365', 'Last 12 months'], ['all', 'All data'], ['custom', 'Custom dates']]); await flush();
  assert.deepStrictEqual(host.settings.reportOrder.slice(0, 2), ['a1c', 'bp'], 'order remembered');
  assert.deepStrictEqual(host.settings.reportSkip, ['illness'], 'skipped remembered');
  const repPath = [...app.__files.keys()].find((k) => k.startsWith('Health Notes/Reports/Health report'));
  const bytes = Buffer.from(app.__files.get(repPath).bin);
  const f = path.join(__dirname, 'health-report.pdf'); fs.writeFileSync(f, bytes);
  const info = execFileSync('pdfinfo', [f]).toString();
  const pages = Number(/Pages:\s+(\d+)/.exec(info)[1]);
  console.log('combined report:', repPath, '·', pages, 'pages');
  try { console.log('qpdf:', execFileSync('qpdf', ['--check', f]).toString().split('\n').filter((l) => /No syntax|error/i.test(l)).join(' ')); } catch (e) { console.log('qpdf check:', String(e.stdout || e.message).slice(0, 300)); }
  const all = execFileSync('pdftotext', ['-layout', f, '-']).toString();
  const first = all.split('\f')[0];
  assert(first.includes('Health summary') && first.includes('Contents') && first.includes('Anna Jónsdóttir'), 'summary first');
  const order = ['Health summary', 'A1C report', 'Blood pressure report', 'Migraine report', 'Period report', 'Doctor visits report', 'Medication list'];
  const idx = order.map((x) => all.indexOf(x));
  console.log('section positions:', order.map((x, i) => x + '@' + idx[i]).join(', '));
  assert(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), 'sections in the chosen order');
  assert(!all.includes('Sickness report'), 'unticked section left out');
  assert(all.includes('Please review my blood pressure'), 'questions in summary');
  // contents page numbers match where the sections really start
  const pagesText = all.split('\f');
  const contentsLines = first.split('\n').filter((l) => /^\s*(A1C|Blood pressure|Migraine|Period|Doctor visits|Medications|Appendix)\s+\d+\s*$/.test(l));
  console.log('contents:', contentsLines.map((l) => l.trim().replace(/\s+/g, ' ')).join(' | '));
  for (const l of contentsLines) {
    const [, name, pg] = /^\s*(.+?)\s+(\d+)\s*$/.exec(l);
    const title = { A1C: 'A1C report', 'Blood pressure': 'Blood pressure report', Migraine: 'Migraine report', Period: 'Period report', 'Doctor visits': 'Doctor visits report', Medications: 'Medication list', Appendix: 'Appendix: how this report was calculated' }[name];
    assert(pagesText[Number(pg) - 1].includes(title), name + ' starts on page ' + pg);
  }
  // bookmarks
  const raw = bytes.toString('latin1');
  const marks = [...raw.matchAll(/\/Title \(([^)]*)\) \/Parent/g)].map((x) => x[1]);
  console.log('bookmarks:', marks.join(' > '));
  assert.deepStrictEqual(marks, ['Health summary', 'A1C', 'Blood pressure', 'Migraine', 'Period', 'Doctor visits', 'Medications', 'Appendix']);
  // one appendix for the whole report, grouped by dashboard, at the end, with the disclaimer
  assert.strictEqual(all.split('Appendix: how this report was calculated').length - 1, 1, 'one appendix');
  const apx = all.slice(all.lastIndexOf('Appendix: how this report was calculated'));
  for (const h of ['A1C', 'Blood pressure', 'Migraine', 'Period', 'References', 'Disclaimer']) assert(apx.includes(h), 'appendix covers ' + h);
  assert(!apx.includes('Doctor visits\n'), 'visits has no appendix section');
  assert(/Settings used in this report: ESC 2024/.test(apx.replace(/\s+/g, ' ')), 'BP settings used');
  execFileSync('pdftoppm', ['-r', '50', '-png', '-f', '1', '-l', '1', f, path.join(__dirname, 'health-report-p')]);
  console.log('EXTRAS OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
function P0(a, days) { return a.today - days; }
