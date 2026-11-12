const assert = require('assert'); const path = require('path');
const { registry, makeApp } = require('./mock');
const { seed } = require('./run-seed'); const { seedNew } = require('./seed-new');
const PluginClass = require(path.resolve(process.argv[2]));
const flush = () => new Promise((r) => setTimeout(r, 350));
(async () => {
  const app = makeApp(); await seed(app); await seedNew(app);
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload(); await flush();
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const root = app.workspace.getLeavesOfType('health-dashboard')[0].view.contentEl;
  const tabs = () => root.querySelectorAll('.hd-tab').map((b) => b.attrs['data-key']);
  const cards = () => root.querySelectorAll('.hd-sum').map((c) => c.attrs['data-key']);
  root.querySelectorAll('.hd-tab')[0].click();
  assert(root.querySelector('.hd-tabs').listeners.pointerdown, 'tabs are draggable');
  assert(root.querySelector('.hd-board').listeners.pointerdown, 'cards are draggable');
  assert(root.querySelector('.hd-board').children.every((c) => c.querySelector('.hd-grip')), 'grip on every block');
  assert(!root.querySelectorAll('.hd-tab')[0].cls.has('hd-tab-sortable'), 'Overview tab is fixed');

  // A tracker turned off keeps its slot when the visible ones are dragged
  host.settings.active.visits = false; host.disableModule(host.constructor === Object ? null : { key: 'visits', view: 'doctor-visits-dashboard', label: 'Doctor visits' }); await flush();
  console.log('tabs before:', tabs().join(','));
  await host.setVisibleOrder('tabOrder', ['a1c', 'bp', 'period', 'migraine', 'illness', 'meds']); await flush();
  console.log('tabs after drag:', tabs().join(','), '| saved:', host.settings.tabOrder.join(','));
  assert.deepStrictEqual(tabs(), ['overview', 'a1c', 'bp', 'period', 'migraine', 'illness', 'meds']);
  assert.deepStrictEqual(host.settings.tabOrder, ['a1c', 'bp', 'visits', 'period', 'migraine', 'illness', 'meds'], 'hidden visits kept its slot');
  assert.deepStrictEqual(app.__pluginData['health-dashboard'].hub.tabOrder, host.settings.tabOrder, 'saved');

  // Cards: hide migraine on the Overview, drag the rest
  host.settings.overview.migraine = false;
  await host.setVisibleOrder('overviewOrder', ['meds', 'a1c', 'period', 'bp', 'illness']); await flush();
  console.log('cards after drag:', cards().join(','), '| saved:', host.settings.overviewOrder.join(','));
  assert.deepStrictEqual(cards(), ['meds', 'a1c', 'period', 'bp', 'illness']);
  assert.deepStrictEqual(host.settings.overviewOrder.indexOf('migraine'), 1, 'hidden migraine kept its slot');
  const quick = root.querySelector('.hd-actions').children.map((b) => b.textContent);
  console.log('quick buttons follow:', quick.join(' | '));
  assert(quick.indexOf('Log A1C') < quick.indexOf('Log period day') && quick.indexOf('Log period day') < quick.indexOf('Log blood pressure'));
  // settings arrows reflect the dragged order
  const hub = registry.settingTabs.find((t) => t.plugin === host);
  hub.containerEl.__settings = []; hub.display();
  const dd = hub.containerEl.__settings.find((x) => x.name === 'Open the dashboard on').controls[0];
  console.log('default-tab choices follow the dragged order:', Object.values(dd.options).slice(2, 4).join(', '));
  assert.strictEqual(Object.keys(dd.options)[2], 'a1c');
  // unknown keys ignored
  await host.setVisibleOrder('tabOrder', ['bogus', 'a1c', 'bp', 'period', 'migraine', 'illness', 'meds']);
  assert(!host.settings.tabOrder.includes('bogus') && host.settings.tabOrder.length === 7);

  // Full-width calendar: button in the calendar and the settings toggle
  const cal = () => root.querySelector('.hd-calendar');
  assert(!cal().cls.has('is-wide'));
  const wideBtn = cal().querySelector('.hd-cal-wide');
  assert.strictEqual(wideBtn.attrs['aria-label'], 'Full width');
  await wideBtn.click(); await flush();
  assert(cal().cls.has('is-wide') && host.settings.calendarWide && app.__pluginData['health-dashboard'].hub.calendarWide === true);
  assert.strictEqual(cal().querySelector('.hd-cal-wide').attrs['aria-label'], 'Half width');
  hub.containerEl.__settings = []; hub.display();
  const calSetting = hub.containerEl.__settings.find((x) => x.name === 'Calendar takes the full width');
  assert.strictEqual(calSetting.controls[0].value, true);
  await calSetting.controls[0].handler(false); await flush();
  assert(!cal().cls.has('is-wide'), 'settings toggle switches it back');
  console.log('DRAG ORDER OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
