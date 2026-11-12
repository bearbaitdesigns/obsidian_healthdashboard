require('./clock');
const assert = require('assert');
const path = require('path');
const mock = require('./mock');
const { registry, makeApp, notices, menus, Modal, El } = mock;
const PluginClass = require(path.resolve(process.argv[2]));
const flush = () => new Promise((r) => setTimeout(r, 400));
const text = (el) => el.textContent;

function seed(app) {
  const add = (p, fm) => app.vault.create(p, '---\n' + Object.entries(fm).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n');
  const starts = ['2026-05-20', '2026-06-17', '2026-07-15', '2026-08-12', '2026-09-09', '2026-10-07', '2026-11-05'];
  const ps = [];
  for (const s of starts) {
    const d0 = new Date(s + 'T00:00:00Z');
    ['medium', 'heavy', 'medium', 'light', 'light'].forEach((flow, i) => {
      const d = new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10);
      if (d > '2026-11-09') return;
      ps.push(add('Period Tracker/Logs/' + d + '.md', { type: 'period-log', date: d, flow, pain: i < 2 ? 3 : 1, symptoms: ['Cramps'], medications: i === 0 ? ['Ibuprofen'] : [] }));
    });
  }
  const migs = [['2026-06-16', '2026-06-17', 4], ['2026-07-16', '2026-07-16', 3], ['2026-08-12', '2026-08-13', 5], ['2026-08-25', '2026-08-25', 2], ['2026-09-10', '2026-09-11', 4], ['2026-10-20', '2026-10-20', 2], ['2026-11-08', '', 3]];
  for (const [s, e, p] of migs) ps.push(add('Migraine Log/Migraine ' + s + '.md', { entry: 'migraine', start: s, end: e, type: 'Migraine without aura', pain_max: p, pain_avg: p - 1, symptoms: ['Nausea'], triggers: ['Stress'], relief: [], medications: ['Sumatriptan | 50 mg | ' + s + ' |  | Some relief'], head_location: ['Left side'], notes: '' }));
  return Promise.all(ps);
}

async function loadHost(app) {
  for (const k of Object.keys(registry)) registry[k] = Array.isArray(registry[k]) ? [] : {};
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard', dir: '.obsidian/plugins/health-dashboard', version: '1.0.0' });
  host._loaded = true;
  await host.onload();
  return host;
}

(async () => {
  const app = makeApp();
  app.__adapter['.obsidian/plugins/migraine-tracker/data.json'] = JSON.stringify({ weekStart: 'monday', overuseThreshold: 8, folder: 'Migraine Log' });
  await seed(app);
  const host = await loadHost(app);
  await flush();

  // Registration
  assert.deepStrictEqual(Object.keys(registry.views).sort(), ['a1c-dashboard', 'blood-pressure-dashboard', 'doctor-visits-dashboard', 'health-dashboard', 'medications-dashboard', 'migraine-tracker-dashboard', 'period-tracker-dashboard', 'sickness-dashboard']);
  assert.deepStrictEqual(Object.keys(registry.codeblocks).sort(), ['health-dashboard', 'health-link', 'period-tracker']);
  console.log('commands:\n  ' + Object.values(registry.commands).map((c) => c.name).join('\n  '));
  console.log('ribbons:', registry.ribbons.map((r) => r.title).join(' | '));
  console.log('setting tabs:', registry.settingTabs.map((t) => t.plugin.manifest.name).join(', '));
  // settings import
  assert.strictEqual(host.migraine.settings.overuseThreshold, 8, 'imported migraine settings');
  assert.strictEqual(app.__pluginData['health-dashboard'].migraine.weekStart, 'monday');

  // Open hub
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const leaf = app.workspace.getLeavesOfType('health-dashboard')[0];
  const r = leaf.view.renderer;
  const root = leaf.view.contentEl;
  let t = text(root);
  assert(t.includes('Health dashboard') && t.includes('Overview'));
  assert(t.includes('Period day'), 'period ongoing tile');
  assert(t.includes('Migraine in progress'), 'ongoing banner');
  assert(t.includes('Migraines and your cycle'));
  const m = /Started around period day 1(\d+ of \d+ \(\d+%\))About (\d+)% expected/.exec(t);
  console.log('cycle link:', m && m[1], 'chance', m && m[2] + '%');
  const pm = /Periods with a migraine nearby(\d+ of \d+)/.exec(t); console.log('periods w/ migraine:', pm && pm[1]);
  console.log('note shown:', t.includes('2 of every 3 cycles'));
  console.log('summary:', root.querySelectorAll('.hd-sum').map((s) => s.querySelectorAll('.hd-stat').map((x) => x.textContent).join(' | ')).join('\n         '));
  const days = root.querySelectorAll('.hd-cal-day').filter((d) => !d.cls.has('is-blank'));
  assert.strictEqual(days.length, 30);
  console.log('Nov flow days:', days.filter((d) => [...d.cls].some((c) => c.startsWith('hd-flow-'))).length, 'migraine marks:', root.querySelectorAll('.hd-mig-mark').length, 'predicted:', days.filter((d) => d.cls.has('is-predicted')).length);
  assert(root.querySelector('.hd-cal-head').textContent === 'Mo');

  // Day menu (Nov 8: period + migraine)
  days[7].click({ shiftKey: false });
  const menu = menus[menus.length - 1];
  console.log('menu:', menu.items.map((i) => i.title).join(' / '));
  for (const it of menu.items) it.click();
  console.log('modals opened from menu:', Modal.opened.map((x) => x.constructor.name).join(', '));
  for (const mo of Modal.opened) assert(mo.contentEl.children.length > 0, mo.constructor.name + ' rendered');

  // Month navigation
  root.querySelector('.hd-cal-nav').children.find((c) => c.attrs['aria-label'] === 'Previous month').click();
  assert(text(root).includes('October 2026'));

  // Tabs
  const tabBtns = () => root.querySelectorAll('.hd-tab');
  tabBtns()[1].click();
  t = text(root);
  assert(root.querySelector('.pt-dashboard'), 'period panel');
  assert(t.includes('Period tracker') && t.includes('Cycle length') && t.includes('Recent periods'));
  // period internal navigation works inside the hub
  root.querySelector('.pt-cal-nav').children[0].click();
  assert(text(root).includes('October'));
  tabBtns()[2].click();
  t = text(root);
  assert(root.querySelector('.mt-dashboard'), 'migraine panel');
  assert(t.includes('Migraine dashboard') && t.includes('Episodes'));
  root.querySelector('.mt-cal-head').children[0].click();
  assert(text(root).includes('October 2026'));
  assert.strictEqual(app.__pluginData['health-dashboard'].hub.lastTab, 'migraine');
  // summary card link switches tab
  tabBtns()[0].click();
  root.querySelectorAll('.hd-link')[0].click();
  assert(root.querySelector('.pt-dashboard'));

  // Refresh: logging a new period day re-renders the hub
  tabBtns()[0].click();
  await host.period.saveEntry({ day: host.period.getAnalysis().today, flow: 'light', pain: null, symptoms: [], medications: [], notes: '' });
  await flush();
  assert(text(leaf.view.contentEl).includes('Health dashboard'));
  // ending migraine updates the hub (via migraine refresh hook)
  const before = text(root).includes('Migraine in progress');
  await host.migraine.endEpisode(host.migraine.getEpisodes().find((e) => !e.end));
  host.migraine.refreshViews();
  await flush();
  console.log('banner before/after ending:', before, text(root).includes('Migraine in progress'));

  // Standalone dashboards still work
  await registry.commands['period-tracker:open-dashboard'].callback();
  await registry.commands['migraine-tracker:open-dashboard'].callback();
  assert(text(app.workspace.getLeavesOfType('period-tracker-dashboard')[0].view.contentEl).includes('Cycle length'));
  assert(text(app.workspace.getLeavesOfType('migraine-tracker-dashboard')[0].view.containerEl.children[1]).includes('Migraine dashboard'));
  registry.commands['health-dashboard:open-migraine'].checkCallback(false); await new Promise((r) => setTimeout(r, 200));
  assert(root.querySelector('.mt-dashboard'));

  // Code blocks
  const blockEl = new El('div');
  const ctx = { addChild: (c) => { c.load(); } };
  registry.codeblocks['health-dashboard']('period', blockEl, ctx);
  assert(blockEl.querySelector('.pt-dashboard'));
  const pb = new El('div'); registry.codeblocks['period-tracker']('', pb, ctx); assert(text(pb).includes('Period tracker'));

  // Settings tabs
  for (const st of registry.settingTabs) st.display();
  // Module settings persist into Health Dashboard data
  host.period.settings.cyclesToAverage = 3; await host.period.saveSettings();
  assert.strictEqual(app.__pluginData['health-dashboard'].period.cyclesToAverage, 3);

  // Reports
  Modal.opened.length = 0;
  await registry.commands['period-tracker:pdf-report'].callback();
  await registry.commands['migraine-tracker:pdf-report'].callback();
  for (const mo of Modal.opened) { const b = mo.contentEl.querySelectorAll('button').find((x) => x.cls.has('mod-cta')) || mo.modalEl.querySelectorAll('button').find((x) => x.cls.has('mod-cta')); if (b) await b.click(); }
  await flush();
  await host.period.generateReport({ name: 'Test', range: '6', from: host.period.getAnalysis().today - 180, to: host.period.getAnalysis().today, includeLog: true, includeNotes: true });
  const pdfs = [...app.__files.keys()].filter((p) => p.endsWith('.pdf'));
  console.log('pdfs:', pdfs.join(', '));
  for (const p of pdfs) { const b = Buffer.from(app.__files.get(p).bin); assert(b.slice(0, 5).toString() === '%PDF-'); }
  await registry.commands['period-tracker:export-csv'].callback();
  await registry.commands['migraine-tracker:export-csv'].callback();

  // Unload
  host.unload();

  // Conflict: standalone Period Tracker still enabled
  const app2 = makeApp();
  app2.plugins.enabledPlugins.add('period-tracker');
  await seed(app2);
  const host2 = await loadHost(app2);
  await flush();
  assert.strictEqual(host2.period, null);
  assert(!registry.views['period-tracker-dashboard']);
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const r2 = app2.workspace.getLeavesOfType('health-dashboard')[0].view.contentEl;
  assert(text(r2).includes('still turned on'));
  r2.querySelectorAll('.hd-tab')[1].click();
  assert(text(r2).includes('is turned off here'));
  r2.querySelectorAll('.hd-tab')[2].click();
  assert(r2.querySelector('.mt-dashboard'));

  // Empty vault
  const app3 = makeApp();
  await loadHost(app3); await flush();
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const r3 = app3.workspace.getLeavesOfType('health-dashboard')[0].view.contentEl;
  assert(text(r3).includes('Log a period to begin') && text(r3).includes('No migraines logged yet'));
  for (const i of [1, 2, 0]) r3.querySelectorAll('.hd-tab')[i].click();

  const errs = notices.filter((n) => /fail|error/i.test(n));
  console.log('notices:', notices.length, 'error-like:', errs);
  console.log('ALL OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
