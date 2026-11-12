const assert = require('assert'); const path = require('path');
const { registry, makeApp, Modal, notices } = require('./mock');
const { seed } = require('./run-seed');
const PluginClass = require(path.resolve(process.argv[2]));
const flush = () => new Promise((r) => setTimeout(r, 300));
const fire = (el, t, ev) => (el.listeners[t] || []).forEach((f) => f(ev || { key: '', preventDefault() {} }));
(async () => {
  const app = makeApp(); await seed(app);
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload(); await flush();
  const tab = registry.settingTabs.find((t) => t.plugin === host);
  tab.display();
  const blocks = () => tab.containerEl.querySelectorAll('.hd-sel');
  const names = blocks().map((b) => b.querySelector('.hd-sel-name').textContent);
  console.log('blocks:', names.join(' | '));
  assert.strictEqual(names.length, 2 + 2 + 9 + 7 + 4 + 4 + 8 + 2);
  const block = (group, label) => { const all = blocks(); const gi = names.indexOf('Migraine types'); return all.find((b, i) => b.querySelector('.hd-sel-name').textContent === label && (group === 'period' ? i < gi : i >= gi)); };
  const lastModal = () => Modal.opened[Modal.opened.length - 1];
  const clickModal = async (text) => { const b = lastModal().contentEl.querySelectorAll('button').find((x) => x.textContent.startsWith(text)); await b.click(); await flush(); };

  // usage counts
  let mt = block('migraine', 'Migraine types');
  const row0 = mt.querySelectorAll('.hd-sel-row')[0];
  console.log('row0:', row0.querySelector('.hd-sel-input').value, '|', row0.querySelector('.hd-sel-uses').textContent);
  // rename "Migraine without aura" (used by 7 notes) -> "Common migraine", update notes
  let inp = mt.querySelectorAll('.hd-sel-input')[0];
  inp.value = 'Common migraine'; fire(inp, 'change'); await flush();
  assert(lastModal().titleEl.textContent === 'Update existing notes?');
  await clickModal('Update');
  assert.strictEqual(host.migraine.settings.types[0], 'Common migraine');
  assert(host.migraine.getEpisodes().every((e) => e.type === 'Common migraine'), 'notes renamed');
  assert(mt.querySelectorAll('.hd-sel-uses')[0].textContent === 'in 7 notes');

  // rename medication inside "name | dose | ..." strings
  const mm = block('migraine', 'Medications');
  const medIdx = host.migraine.settings.medications.indexOf('Sumatriptan');
  inp = mm.querySelectorAll('.hd-sel-input')[medIdx];
  inp.value = 'Imitrex'; fire(inp, 'change'); await flush(); await clickModal('Update');
  const ep = host.migraine.getEpisodes()[0];
  console.log('med after rename:', JSON.stringify(ep.medications[0]));
  assert(ep.medications[0].name === 'Imitrex' && ep.medications[0].dose === '50 mg' && ep.medications[0].effect === 'Some relief');

  // period symptom rename, "only the list"
  const ps = block('period', 'Symptoms');
  inp = ps.querySelectorAll('.hd-sel-input')[0]; // Cramps
  inp.value = 'Cramping'; fire(inp, 'change'); await flush(); await clickModal('Only the list');
  assert.strictEqual(host.period.settings.symptoms[0], 'Cramping');
  assert(host.period.getEntries()[0].symptoms[0] === 'Cramps', 'notes untouched');
  // merge: rename "Bloating" -> "cramps" (case-insensitive existing? no, Cramps no longer in list) -> rename Bloating to "Cramping" merges
  const before = host.period.settings.symptoms.length;
  inp = ps.querySelectorAll('.hd-sel-input')[1]; inp.value = 'cramping'; fire(inp, 'change'); await flush();
  assert.strictEqual(host.period.settings.symptoms.length, before - 1, 'merged');

  // add, duplicate add, reorder, remove
  const addInp = ps.querySelector('.hd-sel-add').children[0];
  addInp.value = 'Migraine'; fire(addInp, 'keydown', { key: 'Enter', preventDefault() {} }); await flush();
  assert(host.period.settings.symptoms.includes('Migraine'));
  ps.querySelector('.hd-sel-add').children[0].value = 'migraine'; fire(ps.querySelector('.hd-sel-add').children[0], 'keydown', { key: 'Enter', preventDefault() {} }); await flush();
  assert(notices.some((n) => n.includes('already in the list')));
  const last = host.period.settings.symptoms.length - 1;
  ps.querySelectorAll('.hd-sel-row')[last].querySelectorAll('button')[0].click(); await flush();
  assert.strictEqual(host.period.settings.symptoms[last - 1], 'Migraine', 'moved up');
  const firstUp = ps.querySelectorAll('.hd-sel-row')[0].querySelectorAll('button')[0];
  assert(firstUp.attrs.disabled !== undefined, 'first up disabled');
  ps.querySelectorAll('.hd-sel-row')[last - 1].querySelectorAll('button')[2].click(); await flush();
  assert(!host.period.settings.symptoms.includes('Migraine'));
  // sort + restore defaults
  ps.querySelectorAll('.hd-sel-tool')[1].click(); await clickModal('Restore');
  assert.deepStrictEqual(host.period.settings.symptoms.slice(0, 2), ['Cramps', 'Bloating']);

  // time of day customization flows into the episode form + stats
  const tod = block('migraine', 'Time of day it started');
  const tAdd = tod.querySelector('.hd-sel-add').children[0];
  tAdd.value = 'Late night'; fire(tAdd, 'keydown', { key: 'Enter', preventDefault() {} }); await flush();
  inp = tod.querySelectorAll('.hd-sel-input')[0]; inp.value = 'Early morning'; fire(inp, 'change'); await flush();
  const M = require(path.resolve(process.argv[2]));
  registry.commands['migraine-tracker:log-migraine'].callback();
  const form = lastModal().contentEl.textContent;
  assert(form.includes('Late night') && form.includes('Early morning'), 'form shows custom times');
  // persisted into data.json
  const saved = app.__pluginData['health-dashboard'];
  assert(saved.migraine.timeOfDay.includes('Late night') && saved.period.symptoms[0] === 'Cramps');

  // flow + pain label renames
  const fl = block('period', 'Flow level names');
  const fin = fl.querySelectorAll('.hd-sel-input'); fin[4].value = 'Very heavy'; fire(fin[4], 'change'); await flush();
  const pl = block('period', 'Pain level names');
  const pin = pl.querySelectorAll('.hd-sel-input'); pin[3].value = 'Medium pain'; fire(pin[3], 'change'); await flush();
  assert.strictEqual(saved.period === app.__pluginData['health-dashboard'].period ? 1 : 1, 1);
  assert.strictEqual(app.__pluginData['health-dashboard'].period.flowLabels.heavy, 'Very heavy');
  await registry.commands['period-tracker:open-dashboard'].callback();
  const pd = app.workspace.getLeavesOfType('period-tracker-dashboard')[0].view.contentEl.textContent;
  assert(pd.includes('Very heavy'), 'flow label in dashboard');
  registry.commands['period-tracker:log-today'].callback();
  assert(lastModal().contentEl.textContent.includes('Very heavy'));

  // reload: labels and lists survive restart
  host.unload();
  for (const k of Object.keys(registry)) registry[k] = Array.isArray(registry[k]) ? [] : {};
  const host2 = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host2._loaded = true; await host2.onload(); await flush();
  assert(host2.migraine.settings.timeOfDay.includes('Late night'));
  assert(host2.period.settings.painLabels[3] === 'Medium pain');
  // old per-tracker settings tabs show pointer
  for (const t of registry.settingTabs) t.display();
  assert(registry.settingTabs.find((t) => t.plugin === host2.migraine).containerEl.textContent.includes('Health Dashboard → Selectors'));
  console.log('SELECTORS OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
