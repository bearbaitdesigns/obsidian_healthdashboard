// Renders links as they'd appear in a note (Reading view) for a visual check
const path = require('path'); const fs = require('fs');
const { makeApp, registry, El } = require('./mock');
const PluginClass = require(path.resolve('dist/main.js'));
const src = fs.readFileSync('test/shot.js', 'utf8');
eval(src.slice(src.indexOf('const esc'), src.indexOf('(async')));
const K = PluginClass._link;
(async () => {
  const app = makeApp();
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload();
  await new Promise((r) => setTimeout(r, 300));
  const note = new El('div'); note.addClass('markdown-preview-view');
  const blk = (s) => { const d = note.createDiv(); registry.codeblocks['health-link'](s, d, {}); };
  note.createEl('h2', { text: 'Daily note' });
  blk('');
  blk('label: Blood pressure\ntab: bp\nsubtitle: Log this morning\'s reading');
  blk('label: Medications\ntab: meds\nstyle: button\nsize: large');
  blk('tab: a1c\nstyle: icon\nalign: center');
  blk('label: Doctor visits\ntab: visits\nwidth: full');
  const p = note.createEl('p'); p.appendText('Before the appointment, check my ');
  const h = p.createSpan(); host.mountLink(h, K.parseLinkInline('health-link: label=migraines; tab=migraine'), true);
  p.appendText(' and my ');
  const h2 = p.createSpan(); host.mountLink(h2, K.parseLinkInline('health-link: label=cycle; tab=period; size=small'), true);
  p.appendText(' for anything unusual.');
  const css = fs.readFileSync('dist/styles.css', 'utf8');
  const vars = fs.readFileSync('test/out-overview-light.html', 'utf8').match(/<style>([\s\S]*?)\/\* Period Tracker/)[1];
  for (const th of ['light', 'dark']) fs.writeFileSync('test/out-link-' + th + '.html', `<!doctype html><meta charset=utf-8><style>${vars}${css} body{padding:24px;max-width:700px;font-size:16px;font-family:system-ui}</style><body class="theme-${th}">${html(note)}</body>`);
  process.exit(0);
})();
