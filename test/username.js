const assert = require('assert'); const path = require('path');
const { registry, makeApp, Modal } = require('./mock');
const { seed } = require('./run-seed'); const { seedNew } = require('./seed-new');
const PluginClass = require(path.resolve(process.argv[2]));
const flush = () => new Promise((r) => setTimeout(r, 350));
const reset = () => { for (const k of Object.keys(registry)) registry[k] = Array.isArray(registry[k]) ? [] : {}; };
const boot = async (app) => { reset(); const h = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard', version: '1.8.0' }); h._loaded = true; await h.onload(); await flush(); return h; };
(async () => {
  const app = makeApp(); await seed(app); await seedNew(app);
  await app.vault.create('A1C/x.md', '---\nentry: "a1c-result"\ndate: "2026-10-01"\na1c_percent: 6.6\n---\n');
  const host = await boot(app);
  const hub = registry.settingTabs.find((t) => t.plugin === host);
  hub.containerEl.__settings = []; hub.display();
  const names = hub.containerEl.__settings.map((x) => x.name);
  console.log('first settings:', names.slice(0, 4).join(' | '));
  assert.strictEqual(names[0], 'You'); assert.strictEqual(names[1], 'Your name');
  await hub.containerEl.__settings[1].controls.find((c) => c.handler).handler('  Anna Jónsdóttir '); await flush();
  assert.strictEqual(host.settings.userName, 'Anna Jónsdóttir');
  for (const k of ['period', 'migraine', 'bp', 'a1c', 'meds', 'visits', 'illness']) assert.strictEqual(host[k].settings.reportName, 'Anna Jónsdóttir', k);
  const saved = app.__pluginData['health-dashboard'];
  assert(saved.hub.userName === 'Anna Jónsdóttir' && saved.bp.reportName === 'Anna Jónsdóttir' && saved.migraine.reportName === 'Anna Jónsdóttir');
  // report dialogs are prefilled, and a one-off change doesn't overwrite the saved name
  Modal.opened.length = 0;
  registry.commands['blood-pressure:pdf-report'].callback();
  const m = Modal.opened[0];
  assert.strictEqual(m.name.value, 'Anna Jónsdóttir');
  m.name.value = 'A. Jónsdóttir'; await m.go([['30', 'Last 30 days']]); await flush();
  assert.strictEqual(host.bp.settings.reportName, 'Anna Jónsdóttir', 'one-off name not saved');
  const bpPdf = [...app.__files.keys()].find((k) => k.startsWith('Blood Pressure/Reports/'));
  assert(Buffer.from(app.__files.get(bpPdf).bin).toString('latin1').includes('Name: A. J'), 'one-off name used in that report');
  Modal.opened.length = 0;
  registry.commands['a1c-tracker:pdf-report'].callback();
  await Modal.opened[0].go([['all', 'All data']]); await flush();
  const a1cPdf = [...app.__files.keys()].find((k) => k.startsWith('A1C/Reports/'));
  const a1cTxt = Buffer.from(app.__files.get(a1cPdf).bin).toString('latin1');
  assert(a1cTxt.includes('Name: Anna J'), 'A1C report has the name');
  Modal.opened.length = 0;
  registry.commands['medication-list:print-list'].callback();
  assert.strictEqual(Modal.opened[0].name.value, 'Anna Jónsdóttir');
  // migraine report uses it (via its own dialog default)
  await host.migraine.createReport({ from: new Date(2026, 0, 1), to: new Date(), name: host.migraine.settings.reportName, includeLog: false, questions: '' });
  await flush();
  const mPdf = [...app.__files.keys()].filter((k) => k.endsWith('.pdf')).find((k) => /migraine/i.test(k));
  console.log('migraine report:', mPdf);
  assert(Buffer.from(app.__files.get(mPdf).bin).toString('latin1').includes('Anna J'));
  // per-tracker name fields are gone
  for (const t of registry.settingTabs) { t.containerEl.__settings = []; t.display(); }
  const leftovers = registry.settingTabs.flatMap((t) => (t.containerEl.__settings || []).map((x) => x.name)).filter((n) => /name on/i.test(n || ''));
  assert.deepStrictEqual(leftovers, [], 'no per-tracker name settings: ' + leftovers);
  // turning a tracker off and on keeps the name
  hub.containerEl.__settings = []; hub.display();
  await hub.containerEl.__settings.find((x) => x.name === 'A1C').controls.find((c) => c.handler).handler(false); await flush();
  hub.containerEl.__settings = []; hub.display();
  await hub.containerEl.__settings.find((x) => x.name === 'A1C').controls.find((c) => c.handler).handler(true); await flush();
  assert.strictEqual(host.a1c.settings.reportName, 'Anna Jónsdóttir');
  // changing the name updates everything
  hub.containerEl.__settings = []; hub.display();
  await hub.containerEl.__settings[1].controls.find((c) => c.handler).handler('Anna J. Sigurðardóttir'); await flush();
  assert(['period', 'migraine', 'bp', 'a1c', 'meds'].every((k) => host[k].settings.reportName === 'Anna J. Sigurðardóttir'));
  // a name set earlier in one tracker is carried over
  const app2 = makeApp();
  app2.__pluginData['health-dashboard'] = { migraine: { reportName: 'Old Name' } };
  const h2 = await boot(app2);
  assert.strictEqual(h2.settings.userName, 'Old Name');
  assert(['period', 'migraine', 'bp', 'a1c', 'meds'].every((k) => h2[k].settings.reportName === 'Old Name'));
  console.log('USER NAME OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
