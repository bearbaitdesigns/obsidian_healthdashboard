const path = require('path'); const fs = require('fs');
const { registry, makeApp } = require('./mock'); const { seed } = require('./run-seed');
const PluginClass = require(path.resolve('dist/main.js'));
const src = fs.readFileSync('test/shot.js', 'utf8');
eval(src.slice(src.indexOf('const esc'), src.indexOf('(async')));
const { seedNew, daysAgo } = require('./seed-new');
(async () => {
  const app = makeApp(); await seed(app); await seedNew(app);
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload();
  host.settings.calendarWide = true; await new Promise(r => setTimeout(r, 400));
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const v = app.workspace.getLeavesOfType('health-dashboard')[0].view;
  const css = fs.readFileSync('dist/styles.css', 'utf8');
  const vars = fs.readFileSync('test/out-overview-light.html', 'utf8').match(/<style>([\s\S]*?)\/\* Period Tracker/)[1];
  const extra = 'input,textarea{font:inherit;padding:4px 8px;border:1px solid var(--background-modifier-border);border-radius:5px;background:var(--background-primary);color:var(--text-normal)} .clickable-icon{background:transparent;box-shadow:none;padding:4px}';
  const page = (name, body, theme) => fs.writeFileSync('test/out-' + name + '-' + theme + '.html', `<!doctype html><meta charset=utf-8><style>${vars}${css}${extra}</style><body class="theme-${theme}">${body}</body>`);
  for (const [i, name] of [[0, 'ovwide']]) {
    v.contentEl.querySelectorAll('.hd-tab')[i].click();
    for (const th of ['light', 'dark']) page(name, html(v.contentEl), th);
  }
  // PDFs
  const B = require(path.resolve('dist/main.js'))._bp, D = require(path.resolve('dist/main.js'))._meds;
  fs.writeFileSync('test/bp-report.pdf', Buffer.from(B.buildReport(host.bp, { from: daysAgo(29), to: daysAgo(0), name: 'Sample Person', notes: 'Morning readings are higher than evening. Should the dose timing change?', includeLog: true, includeMeds: true })));
  host.meds.settings.allergies = 'Penicillin (rash)';
  fs.writeFileSync('test/med-list.pdf', Buffer.from(D.buildList(host.meds, { name: 'Sample Person', includePast: true, includeSide: true })));
  process.exit(0);
})();
