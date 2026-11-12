const assert = require('assert'); const path = require('path');
const { registry, makeApp, Modal, menus, El, notices } = require('./mock');
const { seed } = require('./run-seed');
const PluginClass = require(path.resolve(process.argv[2]));
const flush = (ms) => new Promise((r) => setTimeout(r, ms || 350));
const text = (e) => e.textContent;
const fire = (el, t, ev) => (el.listeners[t] || []).forEach((f) => f(ev || { key: '', preventDefault() {} }));
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };
const lastModal = () => Modal.opened[Modal.opened.length - 1];
const pdfText = (app, p) => Buffer.from(app.__files.get(p).bin).toString('latin1');

async function seedNew(app) {
  const add = (p, fm) => app.vault.create(p, '---\n' + Object.entries(fm).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n');
  // ~40 days of BP readings, morning higher
  for (let i = 40; i >= 1; i--) {
    const d = daysAgo(i);
    await add('Blood Pressure/Readings/' + d + ' 0730.md', { entry: 'bp-reading', date: d, time: '07:30', systolic: 132 + (i % 7), diastolic: 84 + (i % 4), pulse: 68 + (i % 5), arm: 'Left arm', position: 'Sitting', medications: i < 20 ? ['Amlodipine'] : [] });
    await add('Blood Pressure/Readings/' + d + ' 2100.md', { entry: 'bp-reading', date: d, time: '21:00', systolic: 124 + (i % 5), diastolic: 78 + (i % 3), pulse: 64 + (i % 4), arm: 'Left arm', position: 'Sitting', context: i % 9 === 0 ? ['After caffeine'] : [] });
  }
  // sickness
  await add('Health Log/Sickness/a.md', { entry: 'illness', start: daysAgo(70), end: daysAgo(64), type: 'Flu', severity: 'Severe', symptoms: ['Fever', 'Body aches', 'Cough'], temp_max: 39.2, temp_unit: 'C', medications: ['Paracetamol'], remedies: ['Rest', 'Fluids'], helped: ['Paracetamol', 'Rest'], saw_doctor: true, days_missed: 4 });
  await add('Health Log/Sickness/b.md', { entry: 'illness', start: daysAgo(25), end: daysAgo(22), type: 'Common cold', severity: 'Mild', symptoms: ['Runny or blocked nose', 'Sore throat'], remedies: ['Honey and lemon', 'Rest'], helped: ['Honey and lemon'] });
  await add('Health Log/Sickness/c.md', { entry: 'illness', start: daysAgo(1), type: 'Sore throat', severity: 'Moderate', symptoms: ['Sore throat'] });
  for (let i = 12; i >= 0; i--) await add('Health Log/Check-ins/' + daysAgo(i) + '.md', { entry: 'health-checkin', date: daysAgo(i), feeling: i < 2 ? 2 : 3 + (i % 3 === 0 ? 1 : 0), energy: i < 2 ? 2 : 3, sleep_hours: 7 + (i % 2) * 0.5 });
  // meds
  await add('Medications/Amlodipine 5 mg.md', { entry: 'medication', name: 'Amlodipine', strength: '5 mg', form: 'Tablet', kind: 'Prescription', dose: '1 tablet', schedule: 'Once a day', times: ['Morning'], purpose: ['Blood pressure'], prescriber: 'Dr. Sigrún Jónsdóttir', started: daysAgo(20), refill_date: daysAgo(-3) });
  await add('Medications/Magnesium.md', { entry: 'medication', name: 'Magnesium', strength: '400 mg', form: 'Tablet', kind: 'Supplement', dose: '1 tablet', schedule: 'Once a day', times: ['Bedtime'], purpose: ['Migraine prevention'], started: daysAgo(200) });
  await add('Medications/Sumatriptan.md', { entry: 'medication', name: 'Sumatriptan', strength: '50 mg', form: 'Tablet', kind: 'Prescription', dose: '1 tablet', schedule: 'As needed', purpose: ['Migraine relief'], instructions: 'Max 2 a day', started: daysAgo(300) });
  await add('Medications/Propranolol.md', { entry: 'medication', name: 'Propranolol', strength: '40 mg', schedule: 'Twice a day', times: ['Morning', 'Evening'], purpose: ['Migraine prevention'], started: daysAgo(400), stopped: daysAgo(30), stop_reason: 'Side effects', side_effects: 'Tiredness' });
  await add('Doctor Visits/v.md', { entry: 'doctor-visit', date: daysAgo(-5), doctor: 'Dr. Ari Magnússon', clinic: 'Landspítali', reason: 'Follow-up' });
  await add('Doctor Visits/w.md', { entry: 'doctor-visit', date: daysAgo(45), doctor: 'Dr. Sigrún Jónsdóttir', clinic: 'Heilsugæslan', reason: 'Check-up' });
}

(async () => {
  const app = makeApp(); await seed(app); await seedNew(app);
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload(); await flush();
  const cmds = (pre) => Object.values(registry.commands).filter((c) => c.name.startsWith(pre)).map((c) => c.name.replace(pre + ': ', ''));
  console.log('BP commands:', cmds('Blood Pressure').join(' | '));
  console.log('Sickness commands:', cmds('Sickness Tracker').join(' | '));
  console.log('Medication commands:', cmds('Medications').join(' | '));

  /* ---------- Blood pressure ---------- */
  await registry.commands['blood-pressure:open-dashboard'].callback();
  const bpEl = app.workspace.getLeavesOfType('blood-pressure-dashboard')[0].view.contentEl;
  let t = text(bpEl);
  console.log('BP tiles:', bpEl.querySelectorAll('.hk-tile').map((x) => x.textContent).join(' | '));
  for (const s of ['Blood pressure', 'Daily average', 'Readings by category', 'Time of day', 'Readings in this period']) assert(t.includes(s), 'bp missing ' + s);
  assert(bpEl.querySelector('svg'), 'bp chart');
  assert(!bpEl.querySelector('.hk-banner'), 'no very-high banner yet');
  // Log a reading: validation then save-and-add-another
  Modal.opened.length = 0;
  registry.commands['blood-pressure:log-reading'].callback();
  let m = lastModal();
  assert.strictEqual(m.armC.value(), 'Left arm', 'remembers last arm');
  assert(m.medC.options.includes('Amlodipine') && m.medC.options.includes('Magnesium'), 'current meds offered');
  m.sysIn.value = '80'; m.diaIn.value = '90'; await m.save(false);
  assert(notices.some((n) => n.includes('diastolic (bottom) number should be lower')));
  m.sysIn.value = '186'; m.diaIn.value = '112'; m.pulseIn.value = '88'; fire(m.sysIn, 'input');
  assert(text(m.badge).includes('Very high') && text(m.badge).includes('emergency'));
  m.timeIn.value = '08:15';
  await m.save(true); await flush();
  const again = lastModal();
  assert(again !== m && again.r.time === '08:16' && again.r.arm === 'Left arm', 'add another prefilled');
  again.close();
  t = text(bpEl);
  assert(bpEl.querySelector('.hk-banner') && t.includes('very high'), 'very-high banner');
  // guideline switch
  host.bp.settings.guideline = 'aha'; await host.bp.saveSettings(); await flush();
  t = text(bpEl);
  assert(t.includes('Stage 1 range') && t.includes('ACC/AHA 2025'), 'aha labels');
  host.bp.settings.guideline = 'esc-home'; await host.bp.saveSettings(); await flush();
  // PDF
  const bytes = BPModule_build(host, { from: daysAgo(29), to: daysAgo(0), name: 'Test Person', notes: 'Should I change dose?', includeLog: true, includeMeds: true });
  const pdf = Buffer.from(bytes).toString('latin1');
  assert(pdf.startsWith('%PDF-') && pdf.includes('(Blood pressure report)') && pdf.includes('Amlodipine') && pdf.includes('Should I change dose?') && pdf.includes('Weekly averages'));
  console.log('BP PDF pages:', (pdf.match(/\/Type \/Page /g) || []).length, '| bytes', bytes.length);
  // via modal
  Modal.opened.length = 0;
  registry.commands['blood-pressure:pdf-report'].callback();
  await lastModal().go([['30', 'Last 30 days'], ['90', 'Last 3 months']]); await flush();
  const bpPdf = [...app.__files.keys()].find((k) => k.startsWith('Blood Pressure/Reports/'));
  assert(bpPdf && pdfText(app, bpPdf).includes('%%EOF'), 'pdf written');
  await registry.commands['blood-pressure:export-csv'].callback();

  /* ---------- Sickness ---------- */
  await registry.commands['sickness-tracker:open-dashboard'].callback();
  const ilEl = app.workspace.getLeavesOfType('sickness-dashboard')[0].view.contentEl;
  t = text(ilEl);
  console.log('Sickness tiles:', ilEl.querySelectorAll('.hk-tile').map((x) => x.textContent).join(' | '));
  for (const s of ['Sore throat since', 'Most common', 'Sick days per month', 'Types of sickness', 'Remedies', 'Sickness in this period']) assert(t.includes(s), 'ill missing ' + s);
  assert(ilEl.querySelectorAll('.ill-sick').length >= 2, 'calendar sick days');
  assert(t.includes('helped 1'), 'helped counts');
  // log a sickness with helped
  Modal.opened.length = 0;
  registry.commands['sickness-tracker:log-sickness'].callback();
  m = lastModal();
  m.startIn.value = daysAgo(100); m.endIn.value = daysAgo(97);
  m.typeC.toggle('Stomach bug'); m.sevC.toggle('Moderate'); m.symC.toggle('Nausea');
  m.medC.toggle('Oral rehydration salts'); m.remC.toggle('Light food');
  m.helpC.toggle('Oral rehydration salts');
  m.tempIn.value = '38.4'; m.missIn.value = '2'; m.docCb.checked = false;
  await m.save(); await flush();
  const created = [...app.__files.entries()].find(([k]) => k.includes('Stomach bug'));
  console.log('sickness note fm:', JSON.stringify(created[1].fm));
  assert.deepStrictEqual(created[1].fm.helped, ['Oral rehydration salts']);
  // check-in feature removed: no command, old check-in notes are ignored
  assert(!registry.commands['sickness-tracker:daily-checkin'], 'no check-in command');
  assert(!t.includes('check-in') && !t.includes('Check-in'), 'no check-in on dashboard');
  assert(host.illness.getRecords().every((r) => r.kind === 'illness') && host.illness.getRecords().length === 4, 'old check-in notes ignored');
  // end ongoing
  assert(registry.commands['sickness-tracker:end-sickness'].checkCallback(true));
  registry.commands['sickness-tracker:end-sickness'].checkCallback(false); await flush();
  assert(!text(ilEl).includes('Sore throat since'), 'ended');
  // calendar menu
  ilEl.querySelectorAll('.hk-cal-day').filter((d) => !d.cls.has('is-blank'))[0].click({});
  console.log('sickness day menu:', menus[menus.length - 1].items.map((i) => i.title).join(' / '));

  /* ---------- Medications ---------- */
  await registry.commands['medication-list:open-dashboard'].callback();
  const mdEl = app.workspace.getLeavesOfType('medications-dashboard')[0].view.contentEl;
  t = text(mdEl);
  console.log('Meds tiles:', mdEl.querySelectorAll('.hk-tile').map((x) => x.textContent).join(' | '));
  for (const s of ['Refills', 'Daily schedule', 'Scheduled (2)', 'As needed (1)', 'Past medications (1)', 'Side effects']) assert(t.includes(s), 'meds missing ' + s);
  console.log('schedule:', mdEl.querySelector('.med-schedule').children.map((c) => c.textContent).join(' || '));
  // add medication with prescriber from visits
  Modal.opened.length = 0;
  registry.commands['medication-list:add-medication'].callback();
  m = lastModal();
  assert(m.presC.options.includes('Dr. Ari Magnússon'), 'prescriber from visits');
  m.nameIn.value = 'Topiramate'; m.strIn.value = '25 mg'; m.doseIn.value = '1 tablet';
  m.schedC.toggle('Twice a day'); m.timesC.toggle('Morning'); m.timesC.toggle('Evening'); m.purpC.toggle('Migraine prevention');
  m.presC.toggle('Dr. Ari Magnússon'); m.refillIn.value = daysAgo(-30);
  await m.save(); await flush();
  assert(app.__files.has('Medications/Topiramate 25 mg.md'));
  assert(host.meds.currentNames().includes('Topiramate'));
  // stop it
  const topi = host.meds.getRecords().find((x) => x.name === 'Topiramate');
  Modal.opened.length = 0;
  new (MedsModule_internals(host).StopModal)(host.meds, topi).open();
  m = lastModal(); m.reasonC.toggle('Side effects'); m.noteIn.value = 'Tingling fingers';
  await m.save(); await flush();
  const tf = app.__files.get('Medications/Topiramate 25 mg.md').fm;
  console.log('stopped fm:', JSON.stringify({ stopped: tf.stopped, stop_reason: tf.stop_reason, notes: tf.notes, refill: tf.refill_date }));
  assert(tf.stopped && tf.stop_reason === 'Side effects' && !tf.refill_date);
  // refill menu
  mdEl.querySelector('.med-due-row').querySelector('button').click({});
  const rm = menus[menus.length - 1];
  await rm.items[0].click(); await flush();
  assert(!text(mdEl).includes('Refills (') && host.meds.refillsDue().length === 0, 'refilled');
  // print list
  Modal.opened.length = 0;
  registry.commands['medication-list:print-list'].callback();
  m = lastModal();
  assert(m.range.el.cls.has('hk-hidden'), 'no range for med list');
  await m.go([['365', 'Last 12 months']]); await flush();
  const lp = [...app.__files.keys()].find((k) => k.startsWith('Medications/Reports/'));
  const lt = pdfText(app, lp);
  assert(lt.includes('(Medication list)') && lt.includes('Magnesium') && lt.includes('Propranolol') && lt.includes('Taken as needed'));
  host.meds.settings.allergies = 'Penicillin (rash)'; await host.meds.saveSettings(); await flush();
  assert(text(mdEl).includes('Penicillin'));

  /* ---------- Medications offered in other trackers ---------- */
  Modal.opened.length = 0;
  registry.commands['period-tracker:log-today'].callback();
  const pm = lastModal();
  const chipsText = pm.contentEl.querySelectorAll('.pt-chip').map((b) => b.textContent);
  console.log('period medication chips:', chipsText.filter((x) => ['Amlodipine', 'Magnesium', 'Sumatriptan', 'Ibuprofen', 'Topiramate', 'Propranolol'].includes(x)).join(', '));
  assert(chipsText.indexOf('Magnesium') >= 0 && chipsText.indexOf('Magnesium') < chipsText.indexOf('Ibuprofen'), 'period: tracked meds first');
  assert(!chipsText.includes('Topiramate') && !chipsText.includes('Propranolol'), 'period: stopped meds not offered');
  pm.close();
  Modal.opened.length = 0;
  registry.commands['migraine-tracker:log-migraine'].callback();
  const mm = lastModal();
  const dl = mm.contentEl.querySelectorAll('option').map((o) => o.attrs.value).filter(Boolean);
  console.log('migraine medication suggestions start:', dl.slice(0, 5).join(', '));
  assert(dl[0] === 'Amlodipine' && dl.includes('Sumatriptan') && dl.includes('Ibuprofen'));
  mm.addMedRow({});
  const row = mm.medRowEls[mm.medRowEls.length - 1];
  row.name.value = 'Sumatriptan'; fire(row.name, 'change');
  assert.strictEqual(row.dose.value, '50 mg', 'dose filled from medication strength');
  await mm.save(); await flush();
  assert(!host.migraine.settings.medications.includes('Amlodipine'), 'tracked meds not copied into migraine list');
  Modal.opened.length = 0;
  registry.commands['doctor-visits:log-visit'].callback();
  const vm = lastModal();
  assert(text(vm.contentEl).includes('Your medications'), 'visit form offers medications');
  vm.contentEl.querySelectorAll('.mt-chip').find((b) => b.textContent === 'Magnesium').click();
  assert(vm.medsEl.value.startsWith('Magnesium'), 'tap adds a line');
  vm.close();
  Modal.opened.length = 0;
  registry.commands['blood-pressure:log-reading'].callback();
  assert.strictEqual(lastModal().medC.options[0], 'Amlodipine', 'BP: tracked meds first');
  lastModal().close();
  Modal.opened.length = 0;
  registry.commands['sickness-tracker:log-sickness'].callback();
  assert.strictEqual(lastModal().medC.options[0], 'Amlodipine', 'sickness: tracked meds first');
  lastModal().close();

  /* ---------- Hub ---------- */
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const root = app.workspace.getLeavesOfType('health-dashboard')[0].view.contentEl;
  root.querySelectorAll('.hd-tab')[0].click();
  t = text(root);
  console.log('hub tabs:', root.querySelectorAll('.hd-tab').map((b) => b.textContent).join(', '));
  console.log('overview cards:', root.querySelectorAll('.hd-sum').map((x) => x.querySelector('h3').textContent).join(', '));
  for (const s of ['Log blood pressure', 'Log sickness', '7-day average', 'Taking now', 'Sick days · 12 months', 'Most common · 12 months']) assert(t.includes(s), 'overview missing ' + s);
  assert(!t.includes('Check-in'), 'no check-in on overview');
  console.log('calendar footer:', root.querySelector('.hd-calendar').children.slice(-1)[0].textContent);
  for (const [i, cls] of [[4, 'bp-dashboard'], [5, 'ill-dashboard'], [6, 'med-dashboard']]) { root.querySelectorAll('.hd-tab')[i].click(); assert(root.querySelector('.' + cls), 'tab ' + cls); }
  // since-summary for the upcoming visit
  const since = host.sinceSummary(daysAgo(45), daysAgo(0));
  console.log('since last visit:\n  - ' + since.join('\n  - '));
  assert(since.some((l) => l.startsWith('Blood pressure averaged')) && since.some((l) => l.startsWith('Started:')) && since.some((l) => l.startsWith('Stopped:')));
  // selectors rename remedy updates helped too
  const tab = registry.settingTabs.find((x) => x.plugin === host); tab.display();
  const blk = tab.containerEl.querySelectorAll('.hd-sel').find((b) => b.querySelector('.hd-sel-name').textContent === 'Remedies');
  const idx = host.illness.settings.remedies.indexOf('Honey and lemon');
  const inp = blk.querySelectorAll('.hd-sel-input')[idx];
  inp.value = 'Honey & lemon tea'; fire(inp, 'change'); await flush();
  await lastModal().contentEl.querySelectorAll('button').find((b) => b.textContent.startsWith('Update')).click(); await flush();
  const bfm = app.__files.get('Health Log/Sickness/b.md').fm;
  assert(bfm.remedies.includes('Honey & lemon tea') && bfm.helped.includes('Honey & lemon tea'), 'renamed in remedies and helped');
  // toggles: turn meds off -> BP form no longer offers current meds
  const st = (name) => { tab.containerEl.__settings = []; tab.display(); return tab.containerEl.__settings.find((x) => x.name === name); };
  await st('Medications').controls.find((c) => c.handler).handler(false); await flush();
  assert(!registry.commands['medication-list:add-medication']);
  Modal.opened.length = 0; registry.commands['blood-pressure:log-reading'].callback();
  assert(!lastModal().medC.options.includes('Magnesium'), 'no current meds when meds off');
  await st('Medications').controls.find((c) => c.handler).handler(true); await flush();
  assert(registry.commands['medication-list:add-medication']);
  console.log('NEW TRACKERS OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

function BPModule_build(host, o) { return require(path.resolve(process.argv[2]))._bp.buildReport(host.bp, o); }
function MedsModule_internals() { return require(path.resolve(process.argv[2]))._meds; }
