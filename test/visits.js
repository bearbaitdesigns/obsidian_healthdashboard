const assert = require('assert'); const path = require('path');
const { registry, makeApp, Modal, menus, El } = require('./mock');
const { seed } = require('./run-seed');
const PluginClass = require(path.resolve(process.argv[2]));
const flush = () => new Promise((r) => setTimeout(r, 400));
const fire = (el, t, ev) => (el.listeners[t] || []).forEach((f) => f(ev || { key: '', preventDefault() {} }));
const text = (e) => e.textContent;
(async () => {
  const app = makeApp(); await seed(app);
  const add = (p, fm) => app.vault.create(p, '---\n' + Object.entries(fm).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n');
  await add('Doctor Visits/2026-07-02 Dr. Sigrún Jónsdóttir.md', { entry: 'doctor-visit', date: '2026-07-02', time: '10:30', clinic: 'Heilsugæslan Miðbæ', doctor: 'Dr. Sigrún Jónsdóttir', specialty: 'General practice', visit_type: 'In person', reason: 'Migraine / headaches', related: ['Migraine', 'Period'], discussed: 'Migraines cluster around my period.\nAsked about preventive options.', outcome: 'Likely menstrually related migraine.', next_steps: 'Keep tracking for 3 cycles.', tests: ['Blood test'], med_changes: ['Start naproxen 500 mg two days before period'], follow_up: '2026-10-01' });
  await add('Doctor Visits/2026-09-15 Landspítali.md', { entry: 'doctor-visit', date: '2026-09-15', clinic: 'Landspítali', specialty: 'Neurology', reason: 'Referral', related: ['Migraine'], discussed: 'MRI normal.', outcome: 'MRI clear', follow_up: '2026-12-01', cost: '9 800 kr' });
  await add('Doctor Visits/2026-11-20 Dr. Sigrún Jónsdóttir.md', { entry: 'doctor-visit', date: '2026-11-20', time: 870, clinic: 'Heilsugæslan Miðbæ', doctor: 'Dr. Sigrún Jónsdóttir', visit_type: 'Video', reason: 'Follow-up', related: ['Migraine'], questions: 'Is naproxen working?\nShould I try a triptan?' });
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload(); await flush();
  const V = host.visits;
  console.log('commands:', Object.values(registry.commands).filter((c) => c.name.startsWith('Doctor')).map((c) => c.name).join(' | '));
  const visits = V.getVisits();
  assert.strictEqual(visits.length, 3);
  assert.strictEqual(visits.find((v) => v.date === '2026-11-20').time, '14:30', 'sexagesimal time');

  // standalone dashboard
  await registry.commands['doctor-visits:open-dashboard'].callback();
  const dv = app.workspace.getLeavesOfType('doctor-visits-dashboard')[0].view.contentEl;
  let t = text(dv);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const until = Math.round((new Date(2026, 10, 20) - t0) / 864e5);
  for (const s of ['Doctor visits', 'In ' + until + ' days', 'Upcoming', 'Is naproxen working?', 'Since your last visit (Sep 15, 2026)', 'Follow-ups to book', 'Visit history', 'Your care team', 'MRI clear', 'Start naproxen'])
    assert(t.includes(s), 'missing: ' + s);
  console.log('tiles:', dv.querySelectorAll('.dv-tile').map((x) => x.textContent).join(' | '));
  console.log('since:', dv.querySelector('.dv-since').textContent);
  console.log('due:', dv.querySelectorAll('.dv-due-row').map((x) => x.textContent).join(' | '));
  // Sigrún follow-up covered by the Nov 20 visit; Landspítali follow-up still due
  assert.strictEqual(dv.querySelectorAll('.dv-due-row').length, 1);
  // search + filter
  const search = dv.querySelector('.dv-filters').children[0];
  search.value = 'mri'; fire(search, 'input');
  assert.strictEqual(dv.querySelector('.dv-history').querySelectorAll('.dv-visit').length, 1);
  search.value = 'zzz'; fire(search, 'input');
  assert(text(dv.querySelector('.dv-history')).includes('No visits match'));
  search.value = ''; fire(search, 'input');
  // "Add visit" from follow-up prefills
  Modal.opened.length = 0;
  dv.querySelector('.dv-due-row').querySelector('button').click();
  const m1 = Modal.opened[0];
  assert.strictEqual(m1.clinicChips.value(), 'Landspítali');
  assert.strictEqual(m1.reasonChips.value(), 'Follow-up');
  assert.strictEqual(m1.dateInput.value, '2026-12-01');

  // Log a new visit through the modal
  Modal.opened.length = 0;
  await registry.commands['doctor-visits:log-visit'].callback();
  const m = Modal.opened[0];
  m.dateInput.value = '2026-11-03';
  m.doctorChips.toggle('Dr. Sigrún Jónsdóttir'); // autofills clinic + specialty
  assert.strictEqual(m.clinicChips.value(), 'Heilsugæslan Miðbæ');
  assert.strictEqual(m.specChips.value(), 'General practice');
  m.reasonChips.toggle('Prescription renewal');
  m.topicChips.toggle('Migraine');
  m.discussedEl.value = 'Renewed naproxen.';
  m.medsEl.value = 'Renew naproxen 500 mg\n\n';
  m.followInput.value = '2026-10-01';
  await m.save(); // follow-up before visit -> rejected
  assert(!app.__files.has('Doctor Visits/2026-11-03 Dr. Sigrún Jónsdóttir.md'));
  m.followInput.value = '';
  await m.save(); await flush();
  const f = app.__files.get('Doctor Visits/2026-11-03 Dr. Sigrún Jónsdóttir.md');
  assert(f, 'created'); console.log('new note fm:', JSON.stringify(f.fm));
  assert(!('follow_up' in f.fm) && !('questions' in f.fm), 'empty fields omitted');
  assert.deepStrictEqual(f.fm.med_changes, ['Renew naproxen 500 mg']);
  assert(V.settings.doctors.includes('Dr. Sigrún Jónsdóttir') && V.settings.clinics.includes('Landspítali') === false, 'remembered doctor');

  // edit: clear discussed
  const nv = V.getVisits().find((v) => v.date === '2026-11-03');
  await flush();

  // hub: tab, overview card, calendar, menu
  registry.commands['health-dashboard:open-visits'].checkCallback(false); await flush();
  const root = app.workspace.getLeavesOfType('health-dashboard')[0].view.contentEl;
  assert(root.querySelector('.dv-dashboard'), 'visits tab');
  root.querySelectorAll('.hd-tab')[0].click();
  t = text(root);
  assert(t.includes('Doctor visits') && t.includes('Log doctor visit'));
  console.log('overview visits card:', root.querySelectorAll('.hd-sum').find((x) => x.cls.has('is-visits')).querySelectorAll('.hd-stat').map((x) => x.textContent).join(' | '));
  const dots = root.querySelectorAll('.hd-visit-dot');
  console.log('visit dots in Nov:', dots.length);
  assert.strictEqual(dots.length, 2);
  const day3 = root.querySelectorAll('.hd-cal-day').filter((d) => !d.cls.has('is-blank'))[2];
  day3.click({ shiftKey: false });
  console.log('menu:', menus[menus.length - 1].items.map((i) => i.title).join(' / '));
  Modal.opened.length = 0;
  menus[menus.length - 1].items.find((i) => i.title.startsWith('Edit visit')).click();
  assert(Modal.opened[0].existing && Modal.opened[0].discussedEl.value === 'Renewed naproxen.');
  // edit save: clear discussed removes key
  Modal.opened[0].discussedEl.value = ''; await Modal.opened[0].save(); await flush();
  assert(!('discussed' in app.__files.get('Doctor Visits/2026-11-03 Dr. Sigrún Jónsdóttir.md').fm));

  // selectors: rename doctor across notes
  const tab = registry.settingTabs.find((x) => x.plugin === host); tab.display();
  const blk = tab.containerEl.querySelectorAll('.hd-sel').find((b) => b.querySelector('.hd-sel-name').textContent === 'Doctors and clinicians');
  const inp = blk.querySelectorAll('.hd-sel-input')[0];
  console.log('doctor row:', inp.value, blk.querySelectorAll('.hd-sel-uses')[0].textContent);
  inp.value = 'Dr. S. Jónsdóttir'; fire(inp, 'change'); await flush();
  await Modal.opened[Modal.opened.length - 1].contentEl.querySelectorAll('button').find((b) => b.textContent.startsWith('Update')).click(); await flush();
  assert.strictEqual(V.getVisits().filter((v) => v.doctor === 'Dr. S. Jónsdóttir').length, 3);

  // code block + csv + status bar
  const be = new El('div'); registry.codeblocks['health-dashboard']('visits', be, { addChild: (c) => c.load() });
  assert(be.querySelector('.dv-dashboard'));
  await registry.commands['doctor-visits:export-csv'].callback();
  assert([...app.__files.keys()].some((k) => k.startsWith('Doctor Visits/Doctor visits export')));
  V.updateStatusBar();
  console.log('status:', V.statusEl.textContent);

  // empty vault
  const app2 = makeApp();
  for (const k of Object.keys(registry)) registry[k] = Array.isArray(registry[k]) ? [] : {};
  const h2 = new PluginClass(app2, { id: 'health-dashboard', name: 'Health Dashboard' }); h2._loaded = true; await h2.onload(); await flush();
  await registry.commands['doctor-visits:open-dashboard'].callback();
  assert(text(app2.workspace.getLeavesOfType('doctor-visits-dashboard')[0].view.contentEl).includes('No visits logged yet'));
  await registry.commands['health-dashboard:open-dashboard'].callback();
  assert(text(app2.workspace.getLeavesOfType('health-dashboard')[0].view.contentEl).includes('None booked'));
  console.log('VISITS OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
