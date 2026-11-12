// ? button on every tab, the Overview disclaimer, new guideline settings and the standalone report appendix
require('./clock');
const assert = require('assert'); const path = require('path'); const fs = require('fs');
const mock = require('./mock'); const { registry, makeApp } = mock;
const PluginClass = require(path.resolve(process.argv[2] || 'dist/main.js'));
const { seed } = require('./run-seed'); const { seedNew } = require('./seed-new');
const flush = () => new Promise((r) => setTimeout(r, 400));
const text = (el) => (el.tagName === '#TEXT' ? el._text : (el._text || '') + ' ' + el.children.map(text).join(' ')).replace(/\s+/g, ' ');

(async () => {
  const app = makeApp(); await seed(app); await seedNew(app);
  await app.vault.create('A1C/A1C 2026-10-01.md', '---\nentry: a1c-result\ndate: 2026-10-01\na1c_percent: 6.1\n---\n');
  await app.vault.create('A1C/A1C 2026-07-01.md', '---\nentry: a1c-result\ndate: 2026-07-01\na1c_percent: 5.8\n---\n');
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard', version: 't' }); host._loaded = true; await host.onload();
  await flush();
  await registry.commands['health-dashboard:open-dashboard'].callback();
  const v = app.workspace.getLeavesOfType('health-dashboard')[0].view;
  const Modal = mock.obsidian ? mock.obsidian.Modal : require('obsidian').Modal;
  // disclaimer on the Overview
  v.renderer.setTab('overview'); await flush();
  let t = text(v.contentEl);
  assert(t.includes('For your own records, not medical advice.') && t.includes('not a medical device'), 'disclaimer on Overview');
  // ? on every tab
  for (const k of ['overview', 'period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c']) {
    v.renderer.setTab(k); await flush();
    const btn = v.contentEl.querySelector('.hd-help-btn');
    assert(btn, 'help button on ' + k);
    const before = Modal.opened.length;
    btn.onclick();
    const m = Modal.opened[Modal.opened.length - 1];
    assert(Modal.opened.length === before + 1, 'help opens on ' + k);
    const ht = text(m.contentEl);
    assert(ht.includes('What you see') && ht.includes('How it’s calculated'), k + ' sections');
    if (['overview', 'period', 'migraine', 'bp', 'a1c'].includes(k)) assert(ht.includes('Sources') && /https:\/\//.test(ht + JSON.stringify(m.contentEl.querySelectorAll('a').map ? '' : '')) || ht.includes('Sources'), k + ' has sources');
    if (['period', 'migraine', 'bp', 'a1c'].includes(k)) assert(ht.includes('This is a choice you can change'), k + ' reminds about settings');
    console.log(k.padEnd(9), ht.length, 'chars ·', ht.slice(ht.indexOf('This is a choice'), ht.indexOf('This is a choice') + 90).trim() || ht.slice(0, 60));
  }
  // A1C: switching to NICE moves the at-risk boundary to 6.0%
  const A = PluginClass._a1c || null;
  host.a1c.settings.rangeStandard = 'nice';
  v.renderer.setTab('a1c'); v.renderer.render(true); await flush();
  v.contentEl.querySelector('.hd-help-btn').onclick();
  let ht = text(Modal.opened[Modal.opened.length - 1].contentEl);
  assert(ht.includes('NICE (UK)') && ht.includes('6.0–6.4%') && ht.includes('High-risk range'), 'NICE ranges');
  { const tt = text(v.contentEl); assert(tt.includes('6.0%'), 'dashboard chart note follows the setting: ' + tt.slice(0, 400)); }
  host.a1c.settings.rangeStandard = 'ada';
  v.renderer.render(true);
  // Period: FIGO ranges
  host.period.settings.refStandard = 'figo';
  v.renderer.setTab('period'); await flush();
  t = text(v.contentEl);
  assert(t.includes('24–38 days (FIGO 2018'), 'period band uses FIGO: ' + t.slice(t.indexOf('Shaded band'), t.indexOf('Shaded band') + 90));
  v.contentEl.querySelector('.hd-help-btn').onclick();
  ht = text(Modal.opened[Modal.opened.length - 1].contentEl);
  assert(ht.includes('You’re using FIGO 2018'), 'period help follows the setting');
  host.period.settings.refStandard = 'nih';
  console.log('HELP OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
