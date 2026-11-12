const path = require('path'); const fs = require('fs');
const { registry, makeApp } = require('./mock'); const { seed } = require('./run-seed');
const PluginClass = require(path.resolve('dist/main.js'));
const src = fs.readFileSync('test/shot.js', 'utf8');
eval(src.slice(src.indexOf('const esc'), src.indexOf('(async')));
(async () => {
  const app = makeApp(); await seed(app);
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload();
  await new Promise(r => setTimeout(r, 300));
  const tab = registry.settingTabs.find((t) => t.plugin === host);
  tab.open.add('migraine:types'); tab.open.add('period:flowLabels');
  tab.display();
  // mock Setting rows are empty; give headings text for the preview
  const css = fs.readFileSync('dist/styles.css', 'utf8');
  const vars = fs.readFileSync('test/out-overview-light.html', 'utf8').match(/<style>([\s\S]*?)\/\* Period Tracker/)[1];
  const extra = 'input[type=text]{font:inherit;padding:4px 8px;border:1px solid var(--background-modifier-border);border-radius:5px;background:var(--background-primary);color:var(--text-normal)} .clickable-icon{background:transparent;box-shadow:none;padding:4px} body{padding:20px;max-width:720px}';
  for (const theme of ['light', 'dark']) fs.writeFileSync('test/out-settings-' + theme + '.html', `<!doctype html><meta charset=utf-8><style>${vars}${css}${extra}</style><body class="theme-${theme}"><h3>Selectors</h3>${html(tab.containerEl)}</body>`);
  process.exit(0);
})();
