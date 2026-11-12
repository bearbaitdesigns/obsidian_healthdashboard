const assert = require('assert'); const path = require('path');
const { registry, makeApp } = require('./mock');
const { seed } = require('./run-seed'); const { seedNew, daysAgo } = require('./seed-new');
const PluginClass = require(path.resolve(process.argv[2]));
const flush = () => new Promise((r) => setTimeout(r, 350));
(async () => {
  const app = makeApp(); await seed(app); await seedNew(app);
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload(); await flush();
  console.log('ribbon icons:', registry.ribbons.map((r) => r.title).join(', '));
  assert.deepStrictEqual(registry.ribbons.map((r) => r.id), ['health-dashboard']);
  // commands still there
  for (const c of ['period-tracker:open-dashboard', 'migraine-tracker:open-dashboard', 'doctor-visits:open-dashboard', 'blood-pressure:open-dashboard', 'sickness-tracker:open-dashboard', 'medication-list:open-dashboard']) assert(registry.commands[c], c);

  const tab = registry.settingTabs.find((t) => t.plugin === host.bp);
  const rows = () => { tab.containerEl.__settings = []; tab.display(); return tab.containerEl.__settings; };
  const row = (n) => rows().find((x) => x.name === n);
  console.log('BP settings:', rows().map((x) => x.name).join(' | '));
  const g = row('Guideline').controls[0];
  console.log('guideline options:', Object.values(g.options).join(' | '), '| current:', g.value);
  assert.strictEqual(g.value, 'esc-home');
  assert(!row('Target systolic (top number)'), 'target fields hidden until toggled');
  // switch to ACC/AHA
  await g.handler('aha'); await flush();
  assert.strictEqual(host.bp.settings.guideline, 'aha');
  // doctor's target
  await row('Use my doctor’s target').controls.find((c) => c.handler).handler(true); await flush();
  await row('Target systolic (top number)').controls.find((c) => c.handler).handler('125'); await row('Target diastolic (bottom number)').controls.find((c) => c.handler).handler('75'); await flush();
  assert.deepStrictEqual(host.bp._internalsTarget ? 0 : require(path.resolve(process.argv[2]))._bp.target(host.bp.settings), [125, 75]);
  await registry.commands['blood-pressure:open-dashboard'].callback();
  const el = app.workspace.getLeavesOfType('blood-pressure-dashboard')[0].view.contentEl;
  const t = el.textContent;
  assert(t.includes('Below your target 125/75') && t.includes('set by your doctor') && t.includes('ACC/AHA 2025 (American)') && t.includes('your target 125/75'));
  console.log('target tile:', el.querySelectorAll('.hk-tile').find((x) => x.textContent.includes('target')).textContent);
  const B = require(path.resolve(process.argv[2]))._bp;
  const pdf = Buffer.from(B.buildReport(host.bp, { from: daysAgo(29), to: daysAgo(0), includeLog: false, includeMeds: false })).toString('latin1');
  assert(pdf.includes('Target set by doctor: below 125/75') && pdf.includes('Stage 1 range'));
  // invalid target ignored
  await row('Target systolic (top number)').controls.find((c) => c.handler).handler('9'); await flush();
  assert.strictEqual(host.bp.settings.targetSys, null);
  // turning it off goes back to guideline threshold
  await row('Use my doctor’s target').controls.find((c) => c.handler).handler(false); await flush();
  assert.deepStrictEqual(B.target(host.bp.settings), [130, 80]);
  // not duplicated in Settings → Health Dashboard
  const hub = registry.settingTabs.find((t) => t.plugin === host);
  hub.containerEl.__settings = []; hub.display();
  assert(!hub.containerEl.__settings.some((x) => x.name === 'Blood pressure: guideline and target'));
  // old saved target (pre-1.6) turns the toggle on automatically
  const app2 = makeApp();
  app2.__pluginData['health-dashboard'] = { bp: { targetSys: 128, targetDia: 78 } };
  for (const k of Object.keys(registry)) registry[k] = Array.isArray(registry[k]) ? [] : {};
  const h2 = new PluginClass(app2, { id: 'health-dashboard', name: 'Health Dashboard' }); h2._loaded = true; await h2.onload(); await flush();
  assert.deepStrictEqual(B.target(h2.bp.settings), [128, 78]);
  console.log('BP SETTINGS OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
