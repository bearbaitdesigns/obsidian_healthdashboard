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
  assert(!root.querySelectorAll('.hd-tab')[0].cls.has('hd-tab-sortable'), 'Overview tab is fixed');
  assert(!root.querySelector('.hd-home').listeners.pointerdown, 'Overview cards are not draggable');

  // A tracker turned off keeps its slot when the visible ones are dragged
  host.settings.active.visits = false; host.disableModule({ key: 'visits', view: 'doctor-visits-dashboard', label: 'Doctor visits' }); await flush();
  await host.setVisibleOrder('tabOrder', ['a1c', 'bp', 'period', 'migraine', 'illness', 'meds', 'glucose']); await flush();
  console.log('tabs after drag:', tabs().join(','), '| saved:', host.settings.tabOrder.join(','));
  assert.deepStrictEqual(tabs(), ['overview', 'a1c', 'bp', 'period', 'migraine', 'illness', 'meds', 'glucose']);
  assert.deepStrictEqual(host.settings.tabOrder, ['a1c', 'bp', 'visits', 'period', 'migraine', 'illness', 'meds', 'glucose'], 'hidden visits kept its slot');
  assert.deepStrictEqual(app.__pluginData['health-dashboard'].hub.tabOrder, host.settings.tabOrder, 'saved');

  // Cards follow the tab order; a tracker hidden from the Overview has no card
  host.settings.overview.migraine = false; host.refreshHub(); await flush();
  root.querySelectorAll('.hd-tab')[0].click(); await flush();
  console.log('cards:', cards().join(','));
  assert.deepStrictEqual(cards(), ['a1c', 'bp', 'period', 'illness', 'meds', 'glucose']);
  const quick = root.querySelector('.hd-actions').children.map((b) => b.textContent);
  console.log('quick buttons:', quick.join(' | '));
  assert(quick.indexOf('Log A1C') < quick.indexOf('Log blood pressure') && quick.indexOf('Log blood pressure') < quick.indexOf('Log period day'));
  // unknown keys ignored
  await host.setVisibleOrder('tabOrder', ['bogus', 'a1c', 'bp', 'period', 'migraine', 'illness', 'meds', 'glucose']);
  assert(!host.settings.tabOrder.includes('bogus') && host.settings.tabOrder.length === 8);
  console.log('DRAG ORDER OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
