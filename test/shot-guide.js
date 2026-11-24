// Screenshots for the user guide, from the generated test data, with real Lucide icons.
// node test/shot-guide.js <testDataDir> <outDir>   (needs NODE_PATH with the 'yaml' package)
process.env.FAKE_NOW = process.env.FAKE_NOW || '2026-11-12T15:00:00';
require('./clock');
const fs = require('fs'); const path = require('path'); const YAML = require('yaml');
const mock = require('./mock'); const { makeApp, registry } = mock;
const Plugin = require(path.resolve('health-dashboard/main.js'));
const src = fs.readFileSync('test/shot.js', 'utf8');
eval(src.slice(src.indexOf('const esc'), src.indexOf('(async')));
const { chromium } = require('playwright');
const [DIR, OUT] = process.argv.slice(2);
const ICONS = JSON.parse(fs.readFileSync(path.join(OUT, 'lucide.json'), 'utf8'));
const ALIAS = { 'alert-triangle': 'triangle-alert', 'help-circle': 'circle-help', 'maximize-2': 'maximize2' };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const app = makeApp();
  for (const f of walk(DIR).filter((x) => x.endsWith('.md'))) {
    const txt = fs.readFileSync(f, 'utf8'); const m = /^---\n([\s\S]*?)\n---/.exec(txt); if (!m) continue;
    const fm = YAML.parse(m[1]);
    await app.vault.create(path.relative(DIR, f), '---\n' + Object.entries(fm).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n');
  }
  const host = new Plugin(app, { id: 'health-dashboard', name: 'Health Dashboard', version: 't' }); host._loaded = true; await host.onload();
  host.settings.userName = 'Alex Example'; await wait(400); try { host.applyUserName && await host.applyUserName(); } catch (e) {}
  await wait(400);
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const v = app.workspace.getLeavesOfType('health-dashboard')[0].view;
  const pages = {};
  const markSel = (el) => { if (el.tagName === 'SELECT' && el.value != null) (el.children || []).forEach((o) => { if (o.value === el.value || (o.attrs && o.attrs.value === el.value)) o.attrs.selected = 'selected'; }); (el.children || []).forEach(markSel); };
  for (const t of ['overview', 'period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c', 'glucose']) { v.renderer.setTab(t); await wait(); markSel(v.contentEl); pages[t] = html(v.contentEl); }
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(pages));
  const lastModal = () => mock.Modal.opened[mock.Modal.opened.length - 1];
  const markChecked = (el) => { if (el.tagName === 'SELECT' && el.value != null) (el.children || []).forEach((o) => { if (o.value === el.value) o.attrs.selected = 'selected'; }); if (el.tagName === 'INPUT' && el.checked) el.attrs.checked = 'checked'; if (el.tagName === 'INPUT' && el.value && !el.attrs.value) el.attrs.value = el.value; (el.children || []).forEach(markChecked); };
  const modalHtml = (m) => { markChecked(m.contentEl); return '<div class="modal-bg"></div><div class="modal-container"><div class="modal ' + [...(m.modalEl.cls || [])].join(' ') + '"><div class="modal-title">' + (m.titleEl ? m.titleEl.textContent || '' : '') + '</div><div class="modal-content">' + html(m.contentEl) + '</div></div></div>'; };
  const modals = {};
  const grab = async (name, fn, tab) => { if (tab) { v.renderer.setTab(tab); await wait(); } const n = mock.Modal.opened.length; await fn(); await wait(150); if (mock.Modal.opened.length > n) modals[name] = { html: modalHtml(lastModal()), under: tab ? html(v.contentEl) : pages.overview }; else console.log('no modal for', name); };
  await grab('log-migraine', () => registry.commands['migraine-tracker:log-migraine'].callback(), 'migraine');
  await grab('mig-start', () => new (Plugin._migraine.MigraineDayModal)(host.migraine, new Date(2026, 10, 12), { mode: 'start' }).open(), 'migraine');
  await grab('log-mig-day', () => registry.commands['migraine-tracker:log-day'].callback(), 'migraine');
  await grab('mig-end', () => host.migraine.endMigraineDay(host.migraine.getEpisodes().find((e) => !e.end)), 'migraine');
  await grab('mig-edit', () => { const e = host.migraine.getEpisodes().filter((x) => x.days && x.days.length > 1)[0] || host.migraine.getEpisodes()[0]; new (Plugin._migraine.EpisodeModal)(host.migraine, e).open(); }, 'migraine');
  await grab('mig-summary', () => { const e = host.migraine.getEpisodes().sort((a, b) => b.start - a.start).find((x) => x.end); new (Plugin._migraine.MigraineSummaryModal)(host.migraine, e, 'ended').open(); }, 'migraine');
  await grab('log-bp', () => registry.commands['blood-pressure:log-reading'].callback(), 'bp');
  await grab('log-period', () => registry.commands['period-tracker:log-today'].callback(), 'period');
  await grab('bp-report', () => registry.commands['blood-pressure:pdf-report'].callback(), 'bp');
  await grab('health-report', () => registry.commands['health-dashboard:health-report'].callback(), 'overview');
  await grab('help-bp', () => v.contentEl.querySelector('.hd-help-btn').onclick(), 'bp');
  await grab('add-note', () => registry.commands['health-dashboard:add-note'].callback(), 'overview');
  await grab('missed-migraine', () => (registry.commands['health-dashboard:missed-migraine'].callback || registry.commands['health-dashboard:missed-migraine'].checkCallback)(false), 'migraine');
  v.renderer.setTab('overview'); await wait();

  const css = fs.readFileSync('health-dashboard/styles.css', 'utf8');
  const vars = fs.readFileSync('test/out-overview-light.html', 'utf8').match(/<style>([\s\S]*?)\/\* Period Tracker/)[1];
  const obs = `body{font-family:Inter,-apple-system,"Segoe UI",sans-serif;margin:0;padding:24px 28px;background:var(--background-primary);color:var(--text-normal)}
    button{font:inherit;font-size:13px;padding:5px 12px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--interactive-normal,#fff);color:var(--text-normal);display:inline-flex;align-items:center;gap:6px;cursor:pointer;box-shadow:0 1px 1px rgba(0,0,0,.04)}
    button.mod-cta{background:var(--interactive-accent);color:#fff;border-color:transparent}
    button.mod-warning{background:#d1495b;color:#fff;border-color:transparent}
    .clickable-icon{background:transparent!important;border:0!important;box-shadow:none!important;padding:4px!important;color:var(--text-muted)}
    svg{width:16px;height:16px;flex:none}
    select.dropdown,select{font:inherit;font-size:13px;padding:4px 26px 4px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary)}
    input,textarea{font:inherit;font-size:13px;padding:5px 8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal)}
    .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:40}
    .modal-container{position:fixed;inset:0;display:flex;align-items:flex-start;justify-content:center;padding-top:28px;z-index:41}
    .modal{background:var(--background-primary);border-radius:12px;padding:20px 24px;box-shadow:0 20px 50px rgba(0,0,0,.3);width:560px;max-width:92vw;box-sizing:border-box}
    .modal-title{font-weight:700;font-size:18px;margin-bottom:10px}
    .setting-item{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--background-modifier-border)}
    .setting-item-name{font-weight:600}.setting-item-description{color:var(--text-muted);font-size:12px}
    .checkbox-container{width:34px;height:18px;border-radius:9px;background:var(--interactive-accent);flex:none}
    a{color:var(--text-accent)}`;
  const icons = (h) => h.replace(/(<([a-z]+)[^>]*data-icon="([a-z0-9-]+)"[^>]*>)\s*<svg[^>]*>[\s\S]*?<\/svg>/g, (all, open, tag, name) => {
    const svg = ICONS[name] || ICONS[ALIAS[name]] || ICONS[name.replace(/-(\d)$/, '$1')] || ICONS.circle;
    return open + svg.replace('<svg ', '<svg width="16" height="16" ');
  }).replace(/set-property:setProperty\(k, v\) \{ this\[k\] = v; \};?/g, '');
  const page = (body) => `<!doctype html><meta charset=utf-8><style>${vars}${css}${obs}</style><body class="theme-light">${icons(body)}</body>`;
  const main = fs.readFileSync('health-dashboard/main.js', 'utf8');
  const fb = main.slice(main.indexOf('/* sortable:start */'), main.indexOf('/* sortable:end */')) + main.slice(main.indexOf('/* freeboard:start */'), main.indexOf('/* freeboard:end */'));
  const layoutJs = `<script>${fb};const b=document.querySelector('.hd-board');if(b)freeBoard(b,{itemClass:'hd-sortable',load:()=>({})});</script>`;

  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
  const shot = async (name, body, opts = {}) => {
    await p.setViewportSize({ width: opts.width || 1180, height: 900 });
    await p.setContent(page(body) + (opts.board ? layoutJs : ''));
    await p.waitForTimeout(250);
    if (opts.eval) await p.evaluate(opts.eval);
    const file = path.join(OUT, name + '.png');
    if (opts.selector) { const el = p.locator(opts.selector).first(); await el.screenshot({ path: file }); }
    else if (opts.clip) await p.screenshot({ path: file, clip: opts.clip, fullPage: true });
    else await p.screenshot({ path: file, fullPage: !!opts.full });
    console.log('shot', name);
  };
  await shot('overview', pages.overview, { board: true, clip: { x: 0, y: 0, width: 1180, height: 1500 } });
  await shot('overview-top', pages.overview, { board: true, clip: { x: 0, y: 0, width: 1180, height: 330 } });
  for (const t of ['period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c', 'glucose']) await shot('tab-' + t, pages[t], { clip: { x: 0, y: 0, width: 1180, height: 1250 } });
  await shot('tab-bp-top', pages.bp, { clip: { x: 0, y: 0, width: 1180, height: 210 } });
  if (process.env.LIVE) {
    const tipJs = main.slice(main.indexOf('/* ---------------- Hover tooltips'), main.indexOf('/* ---------------- Same header'));
    const poly = "HTMLElement.prototype.createDiv=function(o){const d=document.createElement('div');if(o&&o.cls)d.className=o.cls;if(o&&o.text)d.textContent=o.text;this.appendChild(d);return d;};HTMLElement.prototype.empty=function(){this.innerHTML='';};";
    const order = ['overview', 'period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c', 'glucose'];
    const bodies = order.map((k) => '<div class="lp-page" data-page="' + k + '"' + (k === 'overview' ? '' : ' hidden') + '>' + icons(pages[k]) + '</div>').join('');
    const live = '<title>Health Dashboard Restyle</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>' + vars + css + obs.replace('margin:0;padding:24px 28px;', 'margin:0;padding-block:20px 32px;padding-left:max(16px, env(safe-area-inset-left, 0px));padding-right:max(16px, env(safe-area-inset-right, 0px));') +
      ':root{color-scheme:light}body{background:#f6f6f6;color:#222}body>.hd-tip{background:#ffffff;color:#222222;border-color:#dddddd}.lp-root{background:var(--background-primary)}.lp-note{font-size:13px;color:var(--text-muted);background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:8px;padding:8px 12px;margin:0 auto 16px;max-width:1180px}.lp-page{max-width:1180px;margin:0 auto}.hd-tab,.hd-tabs button{cursor:pointer}</style>\n' +
      '<div class="theme-light lp-root"><div class="lp-note"><b>Preview with made-up test data.</b> Edit migraine episode: only when it started and ended, type, place, possible causes and notes at the top; pain, where it hurt, symptoms, relief and medications are in the list of migraine days at the end. The tabs switch dashboards and charts show tooltips; logging, editing and PDF buttons do nothing here.</div>' + bodies + '</div>' +
      '<script>' + fs.readFileSync('test/preview-expand.js', 'utf8').replace('__EXP__', JSON.stringify(ICONS.maximize2 || ICONS.circle)) + '</script>' +
      layoutJs + '<script>{' + poly + tipJs + ';addTooltips(document.body);' +
      "const keys=" + JSON.stringify(order) + ";document.addEventListener('click',(e)=>{const t=e.target.closest('.hd-tab');if(!t)return;const lab=t.textContent.trim().toLowerCase();const map={overview:'overview',period:'period',migraine:'migraine',visits:'visits','blood pressure':'bp',sickness:'illness',medications:'meds',a1c:'a1c',glucose:'glucose'};const k=map[lab];if(!k)return;document.querySelectorAll('.lp-page').forEach((p)=>{p.hidden=p.dataset.page!==k;});window.scrollTo(0,0);if(k==='overview'){const b=document.querySelector('.lp-page[data-page=overview] .hd-board');if(b&&!b._laid){b._laid=1;freeBoard(b,{itemClass:'hd-sortable',load:()=>({})});}}});}</script>";
    const shotsHtml = (process.env.LIVE_SHOTS || '').split(',').filter(Boolean).filter((n) => fs.existsSync(path.join(OUT, n + '.png'))).map((n) => '<figure><img alt="' + n + '" src="data:image/png;base64,' + fs.readFileSync(path.join(OUT, n + '.png')).toString('base64') + '"><figcaption>' + ({ 'modal-mig-start': 'Migraine started: 1 · About this migraine, 2 · How it is today', 'modal-log-mig-day': 'Log migraine day: the same day questions', 'modal-mig-end': 'End migraine: the day questions plus end date and time', 'modal-mig-summary': 'Summary after saving, with Back to dashboard', 'modal-mig-edit': 'Edit migraine episode: when, type and place, possible causes, notes, then the migraine days (pain, where it hurt, symptoms, relief, notes and medications per day)' }[n] || n) + '</figcaption></figure>').join('');
    const liveOut = shotsHtml ? live.replace('<div class="lp-note">', '<details class="lp-shots" open><summary>Migraine logging windows (screenshots; buttons in this preview don’t open windows)</summary><div class="lp-shot-grid">' + shotsHtml + '</div></details><div class="lp-note">') .replace('</style>', '.lp-shots{max-width:1180px;margin:0 auto 16px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:10px 14px}.lp-shots summary{cursor:pointer;font-weight:600;font-size:14px}.lp-shot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:10px;align-items:start}.lp-shot-grid img{width:100%;border:1px solid var(--background-modifier-border);border-radius:8px}.lp-shot-grid figure{margin:0}.lp-shot-grid figcaption{font-size:12px;color:var(--text-muted);margin-top:4px}</style>') : live;
    fs.writeFileSync(path.join(OUT, process.env.LIVE_NAME || 'period-preview.html'), liveOut);
    console.log('live written', live.length);
  }
  if (process.env.TIPS) {
    const tipJs = main.slice(main.indexOf('/* ---------------- Hover tooltips'), main.indexOf('/* ---------------- Same header'));
    const poly = "HTMLElement.prototype.createDiv=function(o){const d=document.createElement('div');if(o&&o.cls)d.className=o.cls;if(o&&o.text)d.textContent=o.text;this.appendChild(d);return d;};HTMLElement.prototype.empty=function(){this.innerHTML='';};";
    const hov = async (name, body, sel, idx, dx = 0, dy = 0) => {
      await p.setViewportSize({ width: 1180, height: 1300 });
      await p.setContent(page(body) + '<script>{' + poly + tipJs + ';addTooltips(document.body);}</script>'); await p.waitForTimeout(200);
      p.removeAllListeners('pageerror'); p.on('pageerror', (e) => console.log('ERR', name, e.message)); const el = p.locator(sel).nth(idx); await el.scrollIntoViewIfNeeded(); const bb = await el.boundingBox(); console.log(name, JSON.stringify(bb));
      await p.mouse.move(bb.x + bb.width / 2 + dx, bb.y + bb.height / 2 + dy); await p.waitForTimeout(100);
      await p.screenshot({ path: path.join(OUT, 'tip-' + name + '.png'), clip: { x: Math.max(0, bb.x - 300), y: Math.max(0, bb.y - 200), width: 700, height: 420 } });
      console.log('tip', name, await p.evaluate(() => { const t = document.querySelector('.hd-tip'); return t && t.style.display !== 'none' ? t.innerText : '(none)'; }));
    };
    await hov('period-cycle', pages.period, 'svg.pt-chart rect.pt-bar', 3);
    await hov('period-sym', pages.period, '.pt-hbar', 1);
    await hov('bp-line', pages.bp, 'svg.hk-chart circle', 10, 2, 0);
    await hov('mig-vbar', pages.migraine, '.mt-vbar-col', 6);
    await hov('mig-hbar', pages.migraine, '.mt-hbar-row', 2);
    await hov('ill-bar', pages.illness, 'svg.hk-chart rect.hk-bar', 2);
    await hov('ov-cycle', pages.overview, 'svg.hd-chart rect.hd-bar', 1);
  }
  for (const [k, m] of Object.entries(modals)) {
    await p.setViewportSize({ width: 1180, height: 900 });
    await p.setContent(page(m.under + m.html)); await p.waitForTimeout(200);
    const h = await p.evaluate(() => document.querySelector('.modal').scrollHeight);
    await p.setViewportSize({ width: 1180, height: Math.min(2600, h + 70) });
    const bb = await p.locator('.modal').boundingBox();
    await p.screenshot({ path: path.join(OUT, 'modal-' + k + '.png'), clip: { x: Math.max(0, bb.x - 12), y: Math.max(0, bb.y - 12), width: bb.width + 24, height: Math.min(2580, bb.height + 24) } });
    console.log('modal', k);
  }
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
