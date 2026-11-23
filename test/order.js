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
  const show = () => { const t = hub(); t.containerEl.__settings = []; t.display(); return t; };
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const root = app.workspace.getLeavesOfType('health-dashboard')[0].view.contentEl;
  const tabs = () => root.querySelectorAll('.hd-tab').map((b) => b.attrs['data-key']);
  const cards = () => root.querySelectorAll('.hd-sum').map((c) => c.attrs['data-key']);
  root.querySelectorAll('.hd-tab')[0].click();

  // Fixed Overview: calendar then cycle chart on the left; cards in tab order on the right; nothing draggable
  const left = root.querySelector('.hd-home-left'), right = root.querySelector('.hd-home-right');
  assert(left && right, 'two columns');
  assert.deepStrictEqual(left.children.map((c) => c.attrs['data-key']), ['calendar', 'cycle'], 'calendar, then the cycle chart below it');
  assert.deepStrictEqual(cards(), host.settings.tabOrder.filter((k) => host.settings.overview[k]));
  assert(!root.querySelector('.hd-grip') && !root.querySelector('.hd-board') && !root.querySelector('.hd-cal-wide'), 'no drag handles, board or width toggle');
  assert(right.querySelector('.hd-x-notes'), 'notes under the cards');
  console.log('overview cards:', cards().join(', '));

  // Cycle chart only when both period and migraine are on the Overview
  host.settings.overview.migraine = false; host.refreshHub(); await flush();
  assert.deepStrictEqual(root.querySelector('.hd-home-left').children.map((c) => c.attrs['data-key']), ['calendar']);
  host.settings.overview.migraine = true; host.refreshHub(); await flush();

  // Settings: one draggable row per dashboard with a toggle; dragging changes the tabs, cards and quick buttons
  let t = show();
  const list = t.containerEl.querySelector('.hd-dash-list');
  assert(list && list.listeners.pointerdown, 'dashboard rows can be dragged');
  assert.deepStrictEqual(list.children.map((r) => r.attrs['data-key']), host.settings.tabOrder);
  assert(list.children.every((r) => r.querySelector('.hd-dash-grip')), 'grip on every row');
  assert(list.__settings.every((r) => r.controls.length === 1), 'each row has its on/off toggle');
  await host.setVisibleOrder('tabOrder', ['a1c', 'period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'glucose']); await flush();
  assert.deepStrictEqual(tabs().slice(0, 3), ['overview', 'a1c', 'period']);
  root.querySelectorAll('.hd-tab')[0].click(); await flush();
  assert.strictEqual(cards()[0], 'a1c', 'cards follow the tab order');
  assert.strictEqual(root.querySelector('.hd-actions').children[0].textContent, 'Log A1C', 'quick buttons follow the tab order');
  t = show();
  assert.strictEqual(t.containerEl.querySelector('.hd-dash-list').children[0].attrs['data-key'], 'a1c', 'settings list follows');
  const dd = t.containerEl.__settings.find((x) => x.name === 'Open the dashboard on').controls[0];
  assert.deepStrictEqual(Object.keys(dd.options).slice(0, 3), ['last', 'overview', 'a1c'], 'default-tab dropdown follows tab order');
  // Turning a dashboard off from its row hides the tab
  const bpRow = t.containerEl.querySelector('.hd-dash-list').__settings.find((r) => r.name === 'Blood pressure');
  await bpRow.controls[0].handler(false); await flush();
  assert(!tabs().includes('bp'), 'tab hidden');
  t = show();
  await t.containerEl.querySelector('.hd-dash-list').__settings.find((r) => r.name === 'Blood pressure').controls[0].handler(true); await flush();
  assert(tabs().includes('bp'), 'tab back');
  await show().containerEl.__settings.find((x) => x.name === 'Reset the order').controls[0].click(); await flush();
  assert.deepStrictEqual(host.settings.tabOrder, ['period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c', 'glucose']);
  console.log('ORDER OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
