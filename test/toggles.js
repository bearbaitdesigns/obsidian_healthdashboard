const assert = require('assert'); const path = require('path');
const { registry, makeApp, El } = require('./mock');
const { seed } = require('./run-seed');
const PluginClass = require(path.resolve(process.argv[2]));
const flush = () => new Promise((r) => setTimeout(r, 300));
const text = (e) => e.textContent;
const reset = () => { for (const k of Object.keys(registry)) registry[k] = Array.isArray(registry[k]) ? [] : {}; };
async function boot(app) { reset(); const h = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); h._loaded = true; await h.onload(); await flush(); return h; }
(async () => {
  const app = makeApp(); await seed(app);
  await app.vault.create('Doctor Visits/x.md', '---\nentry: "doctor-visit"\ndate: "2026-11-20"\nclinic: "Landspítali"\nreason: "Follow-up"\n---\n');
  const host = await boot(app);
  const tab = () => registry.settingTabs.find((t) => t.plugin === host);
  const setting = (name) => { const t = tab(); t.containerEl.__settings = []; t.display(); const s = t.containerEl.__settings.filter((x) => x.name === name); assert(s.length === 1, 'setting ' + name + ' x' + s.length); return s[0]; };
  const flip = async (name, v) => { await setting(name).controls.find((c) => c.handler).handler(v); await flush(); };
  console.log('settings rows:', (tab().display(), tab().containerEl.__settings.map((x) => x.name).filter(Boolean).slice(0, 9).join(' | ')));

  await registry.commands['health-dashboard:open-dashboard'].callback();
  const leaf = app.workspace.getLeavesOfType('health-dashboard')[0];
  const root = leaf.view.contentEl;
  const tabs = () => root.querySelectorAll('.hd-tab').map((b) => b.textContent);
  await registry.commands['doctor-visits:open-dashboard'].callback();
  assert.strictEqual(app.workspace.getLeavesOfType('doctor-visits-dashboard').length, 1);
  // go to Visits tab in hub
  registry.commands['health-dashboard:open-visits'].checkCallback(false); await flush();
  assert(root.querySelector('.dv-dashboard'));

  // --- turn Doctor visits off
  await flip('Doctor visits', false);
  assert.strictEqual(host.visits, null);
  assert(!Object.keys(registry.commands).some((k) => k.startsWith('doctor-visits:')), 'commands removed');
  assert(!registry.views['doctor-visits-dashboard'], 'view unregistered');
  assert.strictEqual(app.workspace.getLeavesOfType('doctor-visits-dashboard').length, 0, 'standalone tab closed');
  assert(!registry.ribbons.some((r) => r.id === 'doctor-visits'));
  assert(!registry.settingTabs.some((t) => t.plugin && t.plugin.manifest && t.plugin.manifest.id === 'doctor-visits'));
  assert.strictEqual(registry.commands['health-dashboard:open-visits'].checkCallback(true), false);
  assert.deepStrictEqual(tabs(), ['Overview', 'Period', 'Migraine', 'Blood pressure', 'Sickness', 'Medications', 'A1C']);
  assert(root.querySelector('.hd-sum') && !text(root).includes('Log doctor visit') && !root.querySelectorAll('.hd-visit-dot').length, 'overview without visits');
  assert(!text((tab().display(), tab().containerEl)).includes('Doctors and clinicians'), 'selectors hidden');
  assert.strictEqual(app.__pluginData['health-dashboard'].hub.active.visits, false);
  assert(app.__files.has('Doctor Visits/x.md'), 'notes kept');
  console.log('visits off → tabs:', tabs().join(', '));

  // --- turn it back on
  await flip('Doctor visits', true);
  assert(host.visits && registry.commands['doctor-visits:log-visit'], 'back on');
  assert.deepStrictEqual(tabs(), ['Overview', 'Period', 'Migraine', 'Visits', 'Blood pressure', 'Sickness', 'Medications', 'A1C']);
  assert(root.querySelectorAll('.hd-visit-dot').length === 1);
  registry.commands['health-dashboard:open-visits'].checkCallback(false); await flush();
  assert(text(root).includes('Landspítali'), 'fresh visits renderer');
  // since-summary hook re-attached
  assert(typeof host.visits.sinceSummary === 'function');

  // --- Overview choices
  root.querySelectorAll('.hd-tab')[0].click();
  await flip('Show migraine tracking', false);
  let t = text(root);
  assert(!t.includes('Log migraine') && !t.includes('Migraine in progress') && !t.includes('Migraines and your cycle'), 'migraine hidden from overview');
  assert(!root.querySelectorAll('.hd-mig-mark').length);
  assert(tabs().includes('Migraine'), 'migraine tab still there');
  assert(setting('Show "Migraines and your cycle"').controls[0].disabled === true, 'cycle toggle disabled');
  console.log('overview cards (no migraine):', root.querySelectorAll('.hd-sum').map((x) => x.querySelector('h3').textContent).join(', '));
  await flip('Show period tracking', false);
  await flip('Show doctor visits', false);
  for (const n of ['Show blood pressure', 'Show sickness and general health', 'Show medications', 'Show A1C']) await flip(n, false);
  assert(text(root).includes('Nothing to show on the Overview'));
  await flip('Show period tracking', true);
  assert(!text(root).includes('Nothing to show') && root.querySelector('.hd-calendar'));
  // calendar shows only period counts
  console.log('calendar footer:', root.querySelector('.hd-calendar').children.slice(-1)[0].textContent);

  // --- turn period off while viewing it
  root.querySelectorAll('.hd-tab')[1].click();
  assert(root.querySelector('.pt-dashboard'));
  host.settings.lastTab = 'period';
  await flip('Period tracking', false);
  assert(!root.querySelector('.pt-dashboard') && tabs()[0] === 'Overview' && !tabs().includes('Period'), 'fell back to overview');
  assert(!registry.codeblocks['period-tracker']);
  const be = new El('div'); registry.codeblocks['health-dashboard']('period', be, { addChild: (c) => c.load() });
  assert(!be.querySelector('.pt-dashboard'), 'code block falls back');
  // default-tab dropdown excludes inactive tabs
  const dd = setting('Open the dashboard on').controls[0];
  console.log('default tab options:', Object.values(dd.options).join(', '));
  assert(!('period' in dd.options));
  // Visits since-summary still works without period
  console.log('since without period:', host.sinceSummary('2026-09-01', '2026-11-09').join(' / '));

  // --- restart keeps choices
  host.unload();
  const h2 = await boot(app);
  assert.strictEqual(h2.period, null);
  assert(!registry.views['period-tracker-dashboard']);
  assert.strictEqual(h2.initialTab(), 'overview');
  assert(h2.migraine && h2.visits);
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const r2 = app.workspace.getLeavesOfType('health-dashboard').slice(-1)[0].view.contentEl;
  console.log('after restart tabs:', r2.querySelectorAll('.hd-tab').map((b) => b.textContent).join(', '), '| cards:', r2.querySelectorAll('.hd-sum').map((x) => x.querySelector('h3').textContent).join(', '));
  console.log('TOGGLES OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
