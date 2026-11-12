// Dashboard links in notes: block, inline, protocol handler, settings, tab fallback
const assert = require('assert'); const path = require('path');
const { registry, makeApp, El } = require('./mock');
const PluginClass = require(path.resolve(process.argv[2] || 'dist/main.js'));
const K = PluginClass._link;

(async () => {
  // parsing
  assert.deepStrictEqual(K.parseLinkOptions('label: My health\ntab: bp\nsize: large\nalign: center'), { label: 'My health', tab: 'bp', size: 'large', align: 'center' });
  assert.deepStrictEqual(K.parseLinkInline('health-link: label=blood pressure; tab=bp | size=small'), { label: 'blood pressure', tab: 'bp', size: 'small' });
  assert.deepStrictEqual(K.parseLinkInline('health-link: My health'), { label: 'My health' });
  assert.deepStrictEqual(K.parseLinkInline('health-link'), {});
  assert.deepStrictEqual(K.linkSize('150%'), { scale: 1.5 }); assert.deepStrictEqual(K.linkSize('22px'), { px: '22px' }); assert.deepStrictEqual(K.linkSize('xl'), { scale: 1.7 });
  for (const [a, b] of [['blood pressure', 'bp'], ['Medications', 'meds'], ['sickness', 'illness'], ['doctor', 'visits'], ['hba1c', 'a1c'], ['nonsense', 'overview'], ['', 'overview']]) assert.strictEqual(K.linkTab(a), b, a);
  K.LINK_INLINE_RE.lastIndex = 0;
  const found = [...'Check my `health-link: label=BP; tab=bp` and `code` and `health-link`.'.matchAll(K.LINK_INLINE_RE)].map((m) => m[1]);
  assert.deepStrictEqual(found, ['health-link: label=BP; tab=bp', 'health-link']);

  const app = makeApp();
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload();
  await new Promise((r) => setTimeout(r, 300));
  assert(registry.codeblocks['health-link'], 'block processor');
  assert.strictEqual(registry.postProcessors.length >= 1, true, 'inline post-processor');
  assert(registry.protocols['health-dashboard'], 'obsidian:// handler');
  assert(registry.commands['health-dashboard:insert-link'] && registry.commands['health-dashboard:insert-inline-link']);
  assert.deepStrictEqual(host.settings.link, { label: 'Health dashboard', icon: 'heart-pulse', image: '', style: 'card', size: 'medium', reuseTab: true });

  // block link to the blood pressure tab
  const el = new El('div');
  registry.codeblocks['health-link']('label: My blood pressure\ntab: blood pressure\nsize: large\nalign: center', el, {});
  const a = el.querySelector('.hd-link-embed');
  assert(a.cls.has('is-card'));
  assert.strictEqual(a.querySelector('.hd-link-title').textContent, 'My blood pressure');
  assert.strictEqual(a.querySelector('.hd-link-sub').textContent, 'Open Blood pressure');
  assert.strictEqual(a.style['--hd-link-scale'], '1.3');
  assert.strictEqual(a.querySelector('.hd-link-media').attrs['data-icon'], 'activity', 'tab icon when no picture is set');
  assert(el.children[0].cls.has('is-align-center'));
  a.click();
  await new Promise((r) => setTimeout(r, 100));
  let leaves = app.workspace.getLeavesOfType('health-dashboard');
  assert.strictEqual(leaves.length, 1, 'opened the dashboard');
  assert.strictEqual(leaves[0].view.renderer.tab, 'bp', 'on the blood pressure tab');

  // clicking again reuses the open tab; inline button form
  const inl = new El('span');
  host.mountLink(inl, K.parseLinkInline('health-link: label=meds; tab=medications'), true);
  const b = inl.querySelector('.hd-link-embed');
  assert(b.cls.has('is-button') && b.cls.has('is-inline'));
  b.click(); await new Promise((r) => setTimeout(r, 100));
  leaves = app.workspace.getLeavesOfType('health-dashboard');
  assert.strictEqual(leaves.length, 1, 'switched to the open dashboard');
  assert.strictEqual(leaves[0].view.renderer.tab, 'meds');

  // Always open a new tab
  host.settings.link.reuseTab = false;
  await registry.protocols['health-dashboard']({ tab: 'a1c' });
  leaves = app.workspace.getLeavesOfType('health-dashboard');
  assert.strictEqual(leaves.length, 2, 'new tab every time');
  assert.strictEqual(leaves[1].view.renderer.tab, 'a1c');

  // settings changes re-draw links already in notes; a turned-off tracker falls back to the Overview
  host.settings.link.label = 'Mitt heilsuyfirlit'; host.settings.link.style = 'button';
  host.refreshLinks();
  const plain = new El('div'); registry.codeblocks['health-link']('', plain, {});
  assert.strictEqual(plain.querySelector('.hd-link-title').textContent, 'Mitt heilsuyfirlit');
  assert(plain.querySelector('.hd-link-embed').cls.has('is-button'));
  host.settings.active.bp = false;
  host.renderLink(el, K.parseLinkOptions('tab: bp'), false);
  assert.strictEqual(el.querySelector('.hd-link-embed').attrs['aria-label'], 'Open Mitt heilsuyfirlit (Overview) in a new tab');

  // settings tab has the section and the preview
  const tab = registry.settingTabs.find((t) => t.host === host); tab.containerEl.__settings = []; tab.display();
  const names = tab.containerEl.__settings.map((x) => x.name);
  for (const s of ['Dashboard link', 'Link text', 'Size', 'Style', 'Icon', 'Picture', 'Always open a new tab', 'Link code']) assert(names.includes(s), s);
  assert(names.indexOf('Dashboard link') < names.indexOf('Selectors'), 'before the selectors');
  // the "Always open a new tab" toggle writes the setting
  await tab.containerEl.__settings.find((x) => x.name === 'Always open a new tab').controls[0].handler(false);
  assert.strictEqual(host.settings.link.reuseTab, true);
  const pv = tab.containerEl.querySelector('.hd-link-preview');
  assert(pv.querySelectorAll('.hd-link-embed').length === 2);
  console.log('LINK OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
