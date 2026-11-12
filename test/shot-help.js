// Screenshots: Overview disclaimer + ? button, a help window, and an expanded chart (real browser)
require('./clock');
const path = require('path'); const fs = require('fs');
const mock = require('./mock'); const { registry, makeApp } = mock;
const PluginClass = require(path.resolve('dist/main.js'));
const src = fs.readFileSync('test/shot.js', 'utf8');
eval(src.slice(src.indexOf('const esc'), src.indexOf('(async')));
const { seed } = require('./run-seed'); const { seedNew } = require('./seed-new');
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'test';
(async () => {
  const app = makeApp(); await seed(app); await seedNew(app);
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard', version: 't' }); host._loaded = true; await host.onload();
  await new Promise((r) => setTimeout(r, 400));
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const v = app.workspace.getLeavesOfType('health-dashboard')[0].view;
  const css = fs.readFileSync('dist/styles.css', 'utf8');
  const vars = fs.readFileSync('test/out-overview-light.html', 'utf8').match(/<style>([\s\S]*?)\/\* Period Tracker/)[1];
  const extra = `.clickable-icon{background:transparent;border:0;box-shadow:none;padding:4px;cursor:pointer;color:var(--text-muted)} button{font:inherit;padding:4px 12px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary)} button.mod-cta{background:var(--interactive-accent);color:#fff;border:0}
  .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:40}.modal{position:fixed;left:50%;top:30px;transform:translateX(-50%);background:var(--background-primary);border-radius:12px;padding:20px 24px;z-index:41;box-shadow:0 20px 50px rgba(0,0,0,.3);max-height:calc(100vh - 60px);overflow:auto;box-sizing:border-box}.modal-title{font-weight:700;font-size:18px;margin-bottom:10px}
  a{color:var(--text-accent)}`;
  const page = (body, th = 'light') => `<!doctype html><meta charset=utf-8><style>${vars}${css}${extra}</style><body class="theme-${th}">${body}</body>`;
  v.renderer.setTab('overview'); await new Promise((r) => setTimeout(r, 100));
  const ov = html(v.contentEl);
  v.renderer.setTab(process.env.HELP_TAB || 'migraine'); await new Promise((r) => setTimeout(r, 100));
  v.contentEl.querySelector('.hd-help-btn').onclick();
  const migModal = '<div class="modal-bg"></div><div class="modal hd-help-modal"><div class="modal-content">' + html(mock.Modal.opened[mock.Modal.opened.length - 1].contentEl) + '</div></div>';
  v.renderer.setTab('bp'); await new Promise((r) => setTimeout(r, 100));
  const bpHtml = html(v.contentEl);
  v.contentEl.querySelector('.hd-help-btn').onclick();
  const m = mock.Modal.opened[mock.Modal.opened.length - 1];
  const modal = '<div class="modal-bg"></div><div class="modal hd-help-modal"><div class="modal-content">' + html(m.contentEl) + '</div></div>';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
  await p.setContent(page(ov)); await p.screenshot({ path: OUT + '/help-1-overview.png', clip: { x: 0, y: 0, width: 1000, height: 330 } });
  await p.setViewportSize({ width: 1000, height: 1500 });
  await p.setContent(page(bpHtml + modal)); await p.waitForTimeout(100);
  const mh = await p.evaluate(() => document.querySelector('.modal').scrollHeight);
  await p.setViewportSize({ width: 1000, height: Math.min(2400, mh + 70) });
  await p.screenshot({ path: OUT + '/help-2-bp-window.png' });
  await p.setContent(page(migModal)); await p.setViewportSize({ width: 1000, height: 2300 }); await p.screenshot({ path: OUT + '/help-5-migraine-window.png' }); await p.setViewportSize({ width: 1000, height: Math.min(2400, mh + 70) });
  for (const th of ['dark']) { await p.setContent(page(bpHtml + modal, th)); await p.screenshot({ path: OUT + '/help-2-bp-window-dark.png' }); }
  // expand: run the real addExpanders + ExpandModal in the browser with small Obsidian shims
  const main = fs.readFileSync('dist/main.js', 'utf8');
  const code = main.slice(main.indexOf('/* ---------------- Expand any chart'));
  await p.setViewportSize({ width: 1000, height: 900 });
  await p.setContent(page(bpHtml));
  await p.evaluate((code) => {
    const P = HTMLElement.prototype;
    P.createEl = function (tag, o = {}) { const e = document.createElement(tag); if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; for (const [k, v] of Object.entries(o.attr || {})) e.setAttribute(k, v); this.appendChild(e); return e; };
    P.createDiv = function (o) { return this.createEl('div', o); };
    P.addClass = function (...c) { this.classList.add(...c); };
    P.setText = function (t) { this.textContent = t; };
    P.empty = function () { this.innerHTML = ''; };
    window.setIcon = (el, n) => { el.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>'; };
    window.Modal = class { constructor(app) { this.bg = document.createElement('div'); this.bg.className = 'modal-bg'; this.modalEl = document.createElement('div'); this.modalEl.className = 'modal'; this.titleEl = this.modalEl.createDiv({ cls: 'modal-title' }); this.contentEl = this.modalEl.createDiv({ cls: 'modal-content' }); }
      open() { document.body.append(this.bg, this.modalEl); this.onOpen(); } close() { this.bg.remove(); this.modalEl.remove(); } };
    (0, eval)(code.replace(/class ExpandModal extends Modal/, 'window.ExpandModal = class extends Modal').replace(/function addExpanders/, 'window.addExpanders = function addExpanders'));
    addExpanders(document.querySelector('.hd-panel'), {});
  }, code);
  const n = await p.locator('.hd-expand-btn').count();
  console.log('expand buttons on BP:', n);
  await p.screenshot({ path: OUT + '/help-3-expand-buttons.png', clip: { x: 0, y: 150, width: 1000, height: 560 } });
  await p.locator('.hd-expand-btn').first().click();
  await p.waitForTimeout(100);
  await p.screenshot({ path: OUT + '/help-4-expanded.png' });
  await b.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
