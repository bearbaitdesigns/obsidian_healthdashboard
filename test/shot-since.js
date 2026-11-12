// Renders the Visits tab from the generated test data, for the "since your last visit" preview
process.env.FAKE_NOW = process.env.FAKE_NOW || '2026-11-12T15:00:00';
require('./clock');
const fs = require('fs'); const path = require('path'); const YAML = require('yaml');
const { makeApp, registry } = require('./mock');
const Plugin = require(path.resolve('dist/main.js'));
const src = fs.readFileSync('test/shot.js', 'utf8');
eval(src.slice(src.indexOf('const esc'), src.indexOf('(async')));
const DIR = process.argv[2], OUT = process.argv[3];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
(async () => {
  const app = makeApp();
  for (const f of walk(DIR).filter((x) => x.endsWith('.md'))) {
    const txt = fs.readFileSync(f, 'utf8'); const m = /^---\n([\s\S]*?)\n---/.exec(txt); if (!m) continue;
    const fm = YAML.parse(m[1]);
    await app.vault.create(path.relative(DIR, f), '---\n' + Object.entries(fm).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n');
  }
  const host = new Plugin(app, { id: 'health-dashboard', name: 'Health Dashboard', version: 't' }); host._loaded = true; await host.onload();
  await new Promise((r) => setTimeout(r, 400));
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const v = app.workspace.getLeavesOfType('health-dashboard')[0].view;
  v.renderer.setTab('visits'); await new Promise((r) => setTimeout(r, 100));
  if (process.env.HVIEW) { host.visits.settings.historyView = process.env.HVIEW; v.renderer.render(true); await new Promise((r) => setTimeout(r, 100)); }
  const css = fs.readFileSync('dist/styles.css', 'utf8');
  const vars = fs.readFileSync('test/out-overview-light.html', 'utf8').match(/<style>([\s\S]*?)\/\* Period Tracker/)[1];
  for (const th of ['light', 'dark']) fs.writeFileSync(OUT + '-' + th + '.html', `<!doctype html><meta charset=utf-8><style>${vars}${css}</style><body class="theme-${th}">${html(v.contentEl)}</body>`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
