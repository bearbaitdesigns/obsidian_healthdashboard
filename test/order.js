const assert = require('assert'); const path = require('path');
const { registry, makeApp } = require('./mock');
const { seed } = require('./run-seed'); const { seedNew } = require('./seed-new');
const PluginClass = require(path.resolve(process.argv[2]));
const flush = () => new Promise((r) => setTimeout(r, 300));
const reset = () => { for (const k of Object.keys(registry)) registry[k] = Array.isArray(registry[k]) ? [] : {}; };
const boot = async (app) => { reset(); const h = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); h._loaded = true; await h.onload(); await flush(); return h; };
(async () => {
  const app = makeApp(); await seed(app); await seedNew(app);
  const host = await boot(app);
  const hub = () => registry.settingTabs.find((t) => t.plugin === host);
  const rows = () => { const t = hub(); t.containerEl.__settings = []; t.display(); return t.containerEl.__settings; };
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const root = app.workspace.getLeavesOfType('health-dashboard')[0].view.contentEl;
  const tabs = () => root.querySelectorAll('.hd-tab').map((b) => b.textContent);
  const board = () => root.querySelector('.hd-board').children.map((c) => c.attrs['data-key']);
  root.querySelectorAll('.hd-tab')[0].click();
  console.log('default board:', board().join(', '));
  assert.deepStrictEqual(board(), ['period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c', 'calendar', 'cycle', 'notes']);
  assert(root.querySelector('.hd-board').children.every((c) => c.cls.has('hd-sortable')), 'every block is draggable');
  assert(root.querySelector('.hd-calendar').querySelector('.hd-grip') && root.querySelector('.hd-link-card').querySelector('.hd-grip'), 'grips on calendar and chart');

  // no up/down arrows anywhere in Health Dashboard settings
  const all = rows();
  const icons = all.flatMap((r) => r.controls.map((c) => c.icon)).filter(Boolean);
  assert(!icons.includes('arrow-up') && !icons.includes('arrow-down'), 'no arrows: ' + icons);
  assert(!all.some((r) => /^\d+\. /.test(r.name || '')), 'no numbered order rows');
  console.log('order-related settings:', all.filter((r) => /order|Show /i.test(r.name || '')).map((r) => r.name).join(' | '));

  // drag the calendar to the top, the cycle chart after the period card
  await host.setVisibleOrder('overviewOrder', ['calendar', 'period', 'cycle', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c']); await flush();
  console.log('board after dragging:', board().join(', '));
  assert.deepStrictEqual(board().slice(0, 3), ['calendar', 'period', 'cycle']);
  assert.strictEqual(root.querySelector('.hd-actions').children[0].textContent, 'Log period day', 'quick buttons ignore non-tracker blocks');
  // hiding the cycle chart keeps its slot
  host.settings.showCycleLink = false; host.refreshHub(); await flush();
  assert.deepStrictEqual(board().slice(0, 2), ['calendar', 'period']);
  await host.setVisibleOrder('overviewOrder', ['period', 'calendar', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c']); await flush();
  assert.deepStrictEqual(host.settings.overviewOrder.slice(0, 3), ['period', 'calendar', 'cycle'], 'hidden chart kept its place');
  host.settings.showCycleLink = true; host.refreshHub(); await flush();

  // tabs dragged; reset buttons in settings
  await host.setVisibleOrder('tabOrder', ['a1c', 'period', 'migraine', 'visits', 'bp', 'illness', 'meds']); await flush();
  assert.deepStrictEqual(tabs().slice(0, 3), ['Overview', 'A1C', 'Period']);
  const dd = rows().find((x) => x.name === 'Open the dashboard on').controls[0];
  assert.deepStrictEqual(Object.keys(dd.options).slice(0, 3), ['last', 'overview', 'a1c'], 'default-tab dropdown follows tab order');
  await rows().find((x) => x.name === 'Overview order').controls.find((c) => c.text === 'Use the tab order').click(); await flush();
  console.log('after "Use the tab order":', host.settings.overviewOrder.join(', '));
  assert.deepStrictEqual(host.settings.overviewOrder, ['a1c', 'period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'calendar', 'cycle', 'notes']);
  await rows().find((x) => x.name === 'Overview order').controls.find((c) => c.text === 'Reset to default order').click(); await flush();
  assert.deepStrictEqual(board(), ['period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c', 'calendar', 'cycle', 'notes']);
  await rows().find((x) => x.name === 'Tab order').controls.find((c) => c.text === 'Reset to default order').click(); await flush();
  assert.deepStrictEqual(host.settings.tabOrder, ['period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c']);

  // an older saved order (trackers only) gets the calendar and chart added at the end; junk removed
  host.unload();
  app.__pluginData['health-dashboard'].hub.overviewOrder = ['bp', 'a1c', 'nonsense', 'bp'];
  const h2 = await boot(app);
  console.log('restored overview order:', h2.settings.overviewOrder.join(', '));
  assert.deepStrictEqual(h2.settings.overviewOrder.slice(0, 2), ['bp', 'a1c']);
  assert.deepStrictEqual(h2.settings.overviewOrder.slice(-3), ['calendar', 'cycle', 'notes']);
  assert.strictEqual(h2.settings.overviewOrder.length, 10);
  console.log('ORDER OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
