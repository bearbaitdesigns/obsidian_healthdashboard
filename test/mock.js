// Minimal Obsidian + DOM mock, enough to load the plugin and render every view
const Module = require('module');

class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.cls = new Set(); this.attrs = {}; this.style = { setProperty(k, v) { this[k] = v; } }; this._text = ''; this.listeners = {}; this.scrollTop = 0; this.options = []; }
  _opts(o) {
    if (typeof o === 'string') o = { cls: o };
    o = o || {};
    if (o.cls) (Array.isArray(o.cls) ? o.cls : String(o.cls).split(/\s+/)).filter(Boolean).forEach((c) => this.cls.add(c));
    if (o.text != null) this._text = String(o.text);
    if (o.attr) for (const k in o.attr) this.attrs[k] = String(o.attr[k]);
    if (o.href) this.attrs.href = o.href;
    if (o.type) this.attrs.type = o.type;
    if (o.value != null) this.value = o.value;
    if (o.placeholder) this.attrs.placeholder = o.placeholder;
    return this;
  }
  createEl(tag, o, cb) { const e = new El(tag)._opts(o); this.appendChild(e); if (tag === 'option') { this.options.push(e); e.value = e.attrs.value != null ? e.attrs.value : e._text; if (this.value === undefined) this.value = e.value; } if (cb) cb(e); return e; }
  createDiv(o, cb) { return this.createEl('div', o, cb); }
  createSpan(o, cb) { return this.createEl('span', o, cb); }
  createSvg(tag, o) { return this.createEl(tag, o); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => (typeof c === 'string' ? this.appendText(c) : this.appendChild(c))); }
  appendText(t) { const e = new El('#text'); e._text = t; this.appendChild(e); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); }
  detach() { this.remove(); }
  empty() { this.children = []; this._text = ''; this.options = []; }
  addClass(...c) { c.forEach((x) => this.cls.add(x)); }
  removeClass(...c) { c.forEach((x) => this.cls.delete(x)); }
  toggleClass(c, on) { if (on === undefined ? !this.cls.has(c) : on) this.cls.add(c); else this.cls.delete(c); }
  hasClass(c) { return this.cls.has(c); }
  get classList() { const s = this; return { add: (...c) => s.addClass(...c), remove: (...c) => s.removeClass(...c), contains: (c) => s.cls.has(c), toggle: (c, b) => s.toggleClass(c, b) }; }
  setText(t) { this.children = []; this._text = String(t); }
  set textContent(t) { this.setText(t); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  get innerText() { return this.textContent; }
  get text() { return this.textContent; }
  set innerHTML(v) { this.children = []; this._text = ''; }
  setAttr(k, v) { this.attrs[k] = String(v); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  removeAttribute(k) { delete this.attrs[k]; }
  show() { this.hidden = false; }
  hide() { this.hidden = true; }
  toggle(on) { this.hidden = !on; }
  isShown() { return !this.hidden; }
  focus() {}
  select() {}
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  get selectedOptions() { return this.options.filter((o) => o.value === this.value); }
  get firstChild() { return this.children[0]; }
  get childElementCount() { return this.children.length; }
  all() { const out = []; const walk = (e) => { for (const c of e.children) { out.push(c); walk(c); } }; walk(this); return out; }
  querySelectorAll(sel) { const c = sel.replace(/^\./, ''); return this.all().filter((e) => (sel.startsWith('.') ? e.cls.has(c) : e.tagName === sel.toUpperCase())); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest() { return null; }
  click(evt) { const e = evt || { shiftKey: false, preventDefault() {}, stopPropagation() {} }; if (this.onclick) this.onclick(e); (this.listeners.click || []).forEach((f) => f(e)); }
  find(sel) { return this.querySelector(sel); }
}
global.document = { createElementNS: (ns, tag) => new El(tag), createElement: (tag) => new El(tag), body: new El('body') };
global.window = global;
global.activeDocument = global.document;
global.createFragment = () => new El('#fragment');
global.createDiv = (o) => new El('div')._opts(o);
global.createEl = (t, o) => new El(t)._opts(o);
global.createSpan = (o) => new El('span')._opts(o);
global.navigator = global.navigator || { platform: 'test' };

class Component {
  constructor() { this._children = []; this._cleanups = []; this._loaded = false; }
  load() { if (this._loaded) return; this._loaded = true; this.onload(); for (const c of this._children) c.load(); }
  unload() { if (!this._loaded) return; this._loaded = false; for (const c of this._children) c.unload(); this._cleanups.forEach((f) => f()); this.onunload(); }
  onload() {} onunload() {}
  addChild(c) { this._children.push(c); if (this._loaded) c.load(); return c; }
  removeChild(c) { const i = this._children.indexOf(c); if (i >= 0) { this._children.splice(i, 1); c.unload(); } return c; }
  register(fn) { this._cleanups.push(fn); }
  registerEvent() {} registerInterval(id) { return id; } registerDomEvent() {}
}

const registry = { views: {}, commands: {}, ribbons: [], codeblocks: {}, settingTabs: [], status: [], postProcessors: [], protocols: {}, editorExtensions: [] };
class Plugin extends Component {
  constructor(app, manifest) { super(); this.app = app; this.manifest = manifest; }
  registerView(type, fn) { if (registry.views[type]) throw new Error('Attempting to register an existing view type "' + type + '"'); registry.views[type] = fn; this.register(() => { delete registry.views[type]; }); }
  addRibbonIcon(icon, title, cb) { const r = { id: this.manifest.id, icon, title, cb }; registry.ribbons.push(r); this.register(() => { registry.ribbons = registry.ribbons.filter((x) => x !== r); }); return new El('div'); }
  addCommand(c) { const id = this.manifest.id + ':' + c.id; if (registry.commands[id]) throw new Error('dup command ' + id); registry.commands[id] = Object.assign({}, c, { name: this.manifest.name + ': ' + c.name }); this.register(() => { delete registry.commands[id]; }); return c; }
  registerMarkdownCodeBlockProcessor(lang, fn) { if (registry.codeblocks[lang]) throw new Error('dup codeblock ' + lang); registry.codeblocks[lang] = fn; this.register(() => { delete registry.codeblocks[lang]; }); }
  registerMarkdownPostProcessor(fn) { registry.postProcessors.push(fn); this.register(() => { registry.postProcessors = registry.postProcessors.filter((x) => x !== fn); }); }
  registerObsidianProtocolHandler(a, fn) { registry.protocols[a] = fn; this.register(() => { delete registry.protocols[a]; }); }
  registerEditorExtension(e) { registry.editorExtensions.push(e); }
  addSettingTab(t) { registry.settingTabs.push(t); this.register(() => { registry.settingTabs = registry.settingTabs.filter((x) => x !== t); }); }
  addStatusBarItem() { const e = new El('div'); registry.status.push(e); this.register(() => { registry.status = registry.status.filter((x) => x !== e); }); return e; }
  async loadData() { return this.app.__pluginData[this.manifest.id] || null; }
  async saveData(d) { this.app.__pluginData[this.manifest.id] = JSON.parse(JSON.stringify(d)); this.app.__saves++; }
}
class ItemView extends Component {
  constructor(leaf) { super(); this.leaf = leaf; this.app = leaf.app; this.containerEl = new El('div'); this.containerEl.appendChild(new El('div')); this.contentEl = this.containerEl.appendChild(new El('div')); }
}
class Modal {
  constructor(app) { this.app = app; this.containerEl = new El('div'); this.modalEl = new El('div'); this.titleEl = new El('div'); this.contentEl = new El('div'); this.scope = { register() {} }; }
  setTitle(t) { this.titleEl.setText(t); return this; }
  open() { Modal.opened.push(this); this.onOpen(); }
  close() { if (this.onClose) this.onClose(); }
}
Modal.opened = [];
const notices = [];
class Notice { constructor(m) { notices.push(m); } setMessage() {} hide() {} }
class FuzzySuggestModal extends Modal { setPlaceholder() {} }
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = new El('div'); } }
function chain(el) {
  const comp = new Proxy({}, { get: (t, k) => {
    if (k === 'inputEl' || k === 'selectEl' || k === 'buttonEl' || k === 'toggleEl' || k === 'extraSettingsEl') return new El('input');
    if (k === 'getValue') return () => '';
    return (...args) => { if (k === 'addOption') {} return comp; };
  } });
  return comp;
}
function recorder() {
  const r = { value: undefined, handler: null, disabled: false, options: null };
  const api = new Proxy(r, { get: (t, k) => {
    if (k in t && typeof t[k] !== 'function' && !['value', 'options'].includes(k)) return t[k];
    if (k === 'setValue') return (v) => { r.value = v; return api; };
    if (k === 'onChange') return (f) => { r.handler = f; return api; };
    if (k === 'setDisabled') return (d) => { r.disabled = d; return api; };
    if (k === 'addOptions') return (o) => { r.options = o; return api; };
    if (k === 'onClick') return (f) => { r.click = f; return api; };
    if (k === 'setIcon') return (i) => { r.icon = i; return api; };
    if (k === 'setButtonText') return (t) => { r.text = t; return api; };
    if (k === 'inputEl' || k === 'selectEl' || k === 'buttonEl' || k === 'toggleEl') return new El('input');
    if (k === 'getValue') return () => r.value;
    if (k === '_r') return r;
    return () => api;
  } });
  return api;
}
class Setting {
  constructor(el) { this.settingEl = el.createDiv('setting-item'); this.controlEl = this.settingEl.createDiv(); this.nameEl = this.settingEl.createDiv(); this.descEl = this.settingEl.createDiv(); this.infoEl = this.settingEl.createDiv(); this.controls = []; (el.__settings = el.__settings || []).push(this); }
  setName(n) { this.name = n; this.settingEl._text = ''; this.nameEl.setText(n); return this; } setDesc(d) { this.desc = d; return this; } setHeading() { return this; } setClass() { return this; } setTooltip() { return this; } setDisabled() { return this; }
  _add(cb) { const r = recorder(); this.controls.push(r._r); cb(r); return this; }
  addText(cb) { return this._add(cb); } addTextArea(cb) { return this._add(cb); } addToggle(cb) { return this._add(cb); } addDropdown(cb) { return this._add(cb); }
  addButton(cb) { return this._add(cb); } addSlider(cb) { return this._add(cb); } addExtraButton(cb) { return this._add(cb); } addMomentFormat(cb) { return this._add(cb); }
  then(cb) { cb(this); return this; }
}
class TFile { constructor(path, stat) { this.path = path; this.name = path.split('/').pop(); this.basename = this.name.replace(/\.[^.]+$/, ''); this.extension = this.name.split('.').pop(); this.stat = stat || { mtime: 0, ctime: 0 }; } }
class TFolder { constructor(path) { this.path = path; } }
const menus = [];
class Menu {
  constructor() { this.items = []; menus.push(this); }
  addItem(cb) { const it = { title: '', click: null }; const api = { setTitle: (t) => { it.title = t; return api; }, setIcon: () => api, setSection: () => api, setChecked: () => api, setDisabled: () => api, onClick: (f) => { it.click = f; return api; } }; cb(api); this.items.push(it); return this; }
  addSeparator() { return this; }
  showAtMouseEvent() {} showAtPosition() {}
}
class MarkdownRenderChild extends Component { constructor(el) { super(); this.containerEl = el; } }
const obsidian = {
  Plugin, ItemView, Modal, FuzzySuggestModal, Notice, PluginSettingTab, Setting, TFile, TFolder, Menu, MarkdownRenderChild, Component,
  normalizePath: (p) => String(p).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, ''),
  stringifyYaml: (o) => Object.entries(o).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n',
  setIcon: (el, icon) => { el.attrs['data-icon'] = icon; if (!el.children.some((c) => c.tagName === 'SVG')) el.appendChild(new El('svg')); },
  Platform: { isMobile: false, isDesktop: true },
  moment: null,
};

function makeApp() {
  const files = new Map(); // path -> {file, fm, content}
  const folders = new Set();
  const app = { __pluginData: {}, __saves: 0, __files: files };
  const listeners = [];
  app.vault = {
    configDir: '.obsidian',
    getMarkdownFiles: () => [...files.values()].filter((x) => x.file.extension === 'md').map((x) => x.file),
    getAbstractFileByPath: (p) => (files.has(p) ? files.get(p).file : folders.has(p) ? new TFolder(p) : null),
    create: async (p, content) => { const f = new TFile(p); files.set(p, { file: f, fm: parseFm(content), content }); fire(); return f; },
    createBinary: async (p, buf) => { const f = new TFile(p); files.set(p, { file: f, bin: buf }); return f; },
    modify: async (f, c) => { files.get(f.path).content = c; },
    modifyBinary: async (f, b) => { files.get(f.path).bin = b; },
    createFolder: async (p) => { folders.add(p); },
    trash: async (f) => { files.delete(f.path); fire(); },
    on: () => ({}),
    adapter: { exists: async (p) => !!app.__adapter[p], read: async (p) => app.__adapter[p] },
  };
  app.__adapter = {};
  app.metadataCache = { getFileCache: (f) => (files.get(f.path) ? { frontmatter: files.get(f.path).fm } : null), on: (n, cb) => { listeners.push(cb); return {}; } };
  function fire() { for (const cb of listeners) cb(); }
  app.fileManager = {
    processFrontMatter: async (f, fn) => { const r = files.get(f.path); r.fm = r.fm || {}; fn(r.fm); fire(); },
    trashFile: async (f) => { files.delete(f.path); fire(); },
  };
  const leaves = [];
  app.workspace = {
    onLayoutReady: (cb) => cb(),
    getLeavesOfType: (t) => leaves.filter((l) => l.view && l.view.getViewType() === t),
    getLeaf: () => { const l = { app, async setViewState(s) { this.view = registry.views[s.type](this); await this.view.onOpen(); }, async openFile(f) { this.file = f; }, detach() { if (this.view && this.view.onClose) this.view.onClose(); leaves.splice(leaves.indexOf(this), 1); } }; leaves.push(l); return l; },
    revealLeaf: () => {},
    getActiveFile: () => null,
    on: () => ({}),
  };
  app.plugins = { enabledPlugins: new Set() };
  return app;
}
function parseFm(content) {
  const m = /^---\n([\s\S]*?)---/.exec(content || '');
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) { const i = line.indexOf(': '); if (i > 0) { try { fm[line.slice(0, i)] = JSON.parse(line.slice(i + 2)); } catch (e) { fm[line.slice(0, i)] = line.slice(i + 2); } } }
  return fm;
}

const origLoad = Module._load;
Module._load = function (req, ...rest) { if (req === 'obsidian') return obsidian; return origLoad.call(this, req, ...rest); };

module.exports = { El, registry, makeApp, notices, menus, Modal, TFile };
