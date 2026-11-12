require('./clock');
const path = require('path'); const fs = require('fs');
const mock = require('./mock'); const { registry, makeApp } = mock;
const PluginClass = require(path.resolve('dist/main.js'));
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
function html(e) {
  if (e.tagName === '#TEXT') return esc(e._text);
  const tag = e.tagName.toLowerCase();
  const attrs = Object.assign({}, e.attrs);
  if (e.cls.size) attrs.class = [...e.cls].join(' ') + (attrs.class ? ' ' + attrs.class : '');
  const st = Object.entries(e.style).map(([k,v]) => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + ':' + v).join(';'); if (st) attrs.style = st;
  const icon = attrs['data-icon'] ? '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' : '';
  return '<' + tag + Object.entries(attrs).map(([k,v]) => ' ' + k + '="' + esc(v).replace(/"/g,'&quot;') + '"').join('') + '>' + icon + esc(e._text) + e.children.map(html).join('') + '</' + tag + '>';
}
(async () => {
  const run = require('./run-seed');
  const app = makeApp(); await run.seed(app);
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload();
  await new Promise(r => setTimeout(r, 400));
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const v = app.workspace.getLeavesOfType('health-dashboard')[0].view;
  const css = fs.readFileSync('dist/styles.css', 'utf8');
  const out = {};
  for (const [i, name] of [[0,'overview'],[1,'period'],[2,'migraine']]) {
    v.contentEl.querySelectorAll('.hd-tab')[i].click();
    out[name] = html(v.contentEl);
  }
  const vars = `body{margin:0;font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;--font-ui-smaller:12px;--font-ui-small:13px;--font-ui-medium:15px;background:var(--background-primary);color:var(--text-normal)}
  .theme-light{--background-primary:#fff;--background-secondary:#f6f6f6;--background-modifier-border:#e0e0e0;--background-modifier-hover:#ececec;--text-normal:#222;--text-muted:#6b6b6b;--text-accent:#7852ee;--interactive-accent:#7852ee;--text-on-accent:#fff}
  .theme-dark{--background-primary:#1e1e1e;--background-secondary:#262626;--background-modifier-border:#363636;--background-modifier-hover:#303030;--text-normal:#dadada;--text-muted:#999;--text-accent:#a68af9;--interactive-accent:#8a5cf5;--text-on-accent:#fff}
  button{font:inherit;border:0;border-radius:6px;padding:4px 12px;background:var(--background-modifier-hover);color:var(--text-normal);cursor:pointer;box-shadow:0 1px 1px rgba(0,0,0,.1)} button.mod-cta{background:var(--interactive-accent);color:#fff} select{font:inherit}`;
  for (const [name, body] of Object.entries(out)) for (const theme of ['light','dark'])
    fs.writeFileSync(`test/out-${name}-${theme}.html`, `<!doctype html><meta charset=utf-8><style>${vars}${css}</style><body class="theme-${theme}">${body}</body>`);
  process.exit(0);
})();
