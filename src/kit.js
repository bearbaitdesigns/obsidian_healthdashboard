/*
 * Shared toolkit for the Blood pressure, Sickness and Medications trackers:
 * date helpers, a base plugin class, form helpers, SVG charts and a PDF report builder.
 */
const obsidian = require('obsidian');
const { Plugin, ItemView, Modal, Notice, TFile, normalizePath, stringifyYaml, setIcon } = obsidian;
const MI = MigraineModule._internals;
const ChipSelect = MI.ChipSelect;

/* ---------------- Dates: 'YYYY-MM-DD' local-day strings ---------------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayKey = () => keyOf(new Date());
const nowTime = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDaysKey = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const addMonthsKey = (k, n) => { const d = parseKey(k); d.setMonth(d.getMonth() + n); return keyOf(d); };
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / DAY_MS);
function normDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return keyOf(v);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v).trim());
  return m ? m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) : '';
}
function normTime(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v >= 0 && v < 1440) return pad(Math.floor(v / 60)) + ':' + pad(v % 60);
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v).trim());
  return m ? pad(+m[1]) + ':' + m[2] : '';
}
const fmtKey = (k) => { if (!k) return ''; const d = parseKey(k); return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); };
const fmtShort = (k) => { const d = parseKey(k); return MONTHS[d.getMonth()] + ' ' + d.getDate(); };
const plural = (n, w, pl) => n + ' ' + (n === 1 ? w : (pl || w + 's'));
function relDays(k, today) {
  const n = daysBetween(today || todayKey(), k);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? 'in ' + plural(n, 'day') : plural(-n, 'day') + ' ago';
}
function durationText(days) {
  if (days < 14) return plural(days, 'day');
  if (days < 60) return plural(Math.round(days / 7), 'week');
  if (days < 730) return plural(Math.round(days / 30.44), 'month');
  return (Math.round(days / 36.5) / 10) + ' years';
}
const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/* ---------------- Values ---------------- */
function asArray(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== '').map((x) => String(x).trim()).filter(Boolean);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}
const str = (v) => (v == null ? '' : String(v).trim());
const num = (v) => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const linesOf = (v) => asArray(Array.isArray(v) ? v : String(v || '').split('\n'));
const isEmpty = (x) => x == null || x === '' || (Array.isArray(x) && !x.length);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
function tally(lists) {
  const m = new Map();
  for (const l of lists) for (const v of new Set(l)) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
const csvEsc = (x) => { const s = String(x == null ? '' : x); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const safeName = (s) => String(s).replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim();

/* ---------------- Base plugin ---------------- */
class TrackerView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return this.plugin.cfg.viewType; }
  getDisplayText() { return this.plugin.cfg.title; }
  getIcon() { return this.plugin.cfg.icon; }
  async onOpen() { this.renderer = new this.plugin.cfg.Renderer(this.plugin, this.contentEl); this.plugin.renderers.add(this.renderer); this.renderer.render(); }
  async onClose() { this.plugin.renderers.delete(this.renderer); }
}

/** Subclasses set `this.cfg` = { viewType, title, icon, defaults, listKeys, Renderer, parse(file, fm) } before calling setup(). */
class TrackerPlugin extends Plugin {
  async setup() {
    await this.loadSettings();
    this.renderers = new Set();
    this.registerView(this.cfg.viewType, (leaf) => new TrackerView(leaf, this));
    this.addRibbonIcon(this.cfg.icon, this.cfg.title, () => this.activateView());
    this.addCommand({ id: 'open-dashboard', name: 'Open dashboard', callback: () => this.activateView() });
    this.addCommand({ id: 'export-csv', name: 'Export to CSV', callback: () => this.exportCsv() });
    const refresh = (f) => { if (!f || f.extension === 'md') this.requestRefresh(); };
    this.registerEvent(this.app.metadataCache.on('changed', refresh));
    this.registerEvent(this.app.vault.on('delete', refresh));
    this.registerEvent(this.app.vault.on('rename', refresh));
    this.app.workspace.onLayoutReady(() => this.requestRefresh());
  }
  onunload() { if (this._timer) window.clearTimeout(this._timer); }

  async loadSettings() {
    const d = this.cfg.defaults;
    this.settings = Object.assign({}, d, (await this.loadData()) || {});
    for (const k of this.cfg.listKeys) this.settings[k] = Array.isArray(this.settings[k]) ? this.settings[k].slice() : d[k].slice();
  }
  async saveSettings() { await this.saveData(this.settings); this.requestRefresh(); }
  remember(key, values) { const l = this.settings[key]; for (const v of values) if (v && !l.includes(v)) l.push(v); }

  requestRefresh() {
    if (this._timer) window.clearTimeout(this._timer);
    this._timer = window.setTimeout(() => {
      this._cache = null;
      for (const r of this.renderers) { try { r.render(); } catch (e) { console.error(this.cfg.title + ' render failed', e); } }
      if (this.afterRefresh) this.afterRefresh();
      if (this.onRefresh) this.onRefresh();
    }, 250);
  }

  recordFromFile(file) {
    if (!(file instanceof TFile) || file.extension !== 'md') return null;
    const c = this.app.metadataCache.getFileCache(file);
    return this.cfg.parse(file, c && c.frontmatter);
  }
  getRecords() {
    if (this._cache) return this._cache;
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) { const r = this.recordFromFile(f); if (r) out.push(r); }
    this._cache = out;
    window.setTimeout(() => { this._cache = null; }, 0); // only reuse within one render pass
    return out;
  }

  async ensureFolder(path) {
    const parts = normalizePath(path).split('/');
    let cur = '';
    for (const part of parts) {
      cur = cur ? cur + '/' + part : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) { try { await this.app.vault.createFolder(cur); } catch (e) { /* exists */ } }
    }
  }
  async createNote(folder, base, fm, body) {
    folder = normalizePath(folder);
    await this.ensureFolder(folder);
    const name = safeName(base);
    let path = normalizePath(folder + '/' + name + '.md');
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(folder + '/' + name + ' (' + i + ').md');
    const clean = {};
    for (const [k, v] of Object.entries(fm)) if (!isEmpty(v)) clean[k] = v;
    this._cache = null;
    return this.app.vault.create(path, '---\n' + stringifyYaml(clean) + '---\n\n' + (body || ''));
  }
  async updateNote(file, data) {
    this._cache = null;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      for (const [k, v] of Object.entries(data)) { if (isEmpty(v)) delete fm[k]; else fm[k] = v; }
    });
  }
  async trash(file) {
    this._cache = null;
    if (this.app.fileManager.trashFile) await this.app.fileManager.trashFile(file);
    else await this.app.vault.trash(file, true);
  }
  async activateView() {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(this.cfg.viewType)[0];
    if (!leaf) { leaf = ws.getLeaf('tab'); await leaf.setViewState({ type: this.cfg.viewType, active: true }); }
    ws.revealLeaf(leaf);
  }
  async writeFile(folder, name, content, binary) {
    folder = normalizePath(folder);
    await this.ensureFolder(folder);
    const path = normalizePath(folder + '/' + safeName(name));
    const existing = this.app.vault.getAbstractFileByPath(path);
    let file;
    if (binary) {
      const buf = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
      if (existing instanceof TFile) { await this.app.vault.modifyBinary(existing, buf); file = existing; } else file = await this.app.vault.createBinary(path, buf);
    } else if (existing instanceof TFile) { await this.app.vault.modify(existing, content); file = existing; } else file = await this.app.vault.create(path, content);
    return { file, path };
  }
  async exportRows(folder, name, rows) {
    if (rows.length < 2) { new Notice('Nothing to export yet.'); return; }
    const { path } = await this.writeFile(folder, name + ' ' + todayKey() + '.csv', rows.map((r) => r.map(csvEsc).join(',')).join('\n') + '\n');
    new Notice('Exported ' + (rows.length - 1) + ' rows to ' + path);
  }
}

/* ---------------- Form helpers (match the migraine form look) ---------------- */
class FormModal extends Modal {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; }
  begin(title) { this.modalEl.addClass('mt-modal', 'hk-modal'); this.titleEl.setText(title); this.contentEl.empty(); }
  section(title, icon) {
    const sec = this.contentEl.createDiv({ cls: 'mt-section' });
    const h = sec.createDiv({ cls: 'mt-section-title' });
    setIcon(h.createSpan({ cls: 'mt-section-icon' }), icon);
    h.createSpan({ text: title });
    return sec;
  }
  label(parent, text) { return parent.createDiv({ cls: 'mt-label', text }); }
  row(parent) { return parent.createDiv({ cls: 'hk-row' }); }
  field(row, label, type, value, attrs) {
    const f = row.createDiv({ cls: 'mt-field' });
    const lab = f.createDiv({ cls: 'mt-label', text: label });
    const i = f.createEl('input', { type, attr: attrs || {} });
    i.hkLabel = lab;
    i.value = value == null ? '' : String(value);
    return i;
  }
  area(parent, label, value, placeholder, rows) {
    this.label(parent, label);
    const ta = parent.createEl('textarea', { cls: 'hk-textarea', attr: { rows: String(rows || 3), placeholder: placeholder || '' } });
    ta.value = value || '';
    return ta;
  }
  chips(parent, label, options, selected, single, extra) {
    if (label) this.label(parent, label);
    const sel = selected == null ? [] : Array.isArray(selected) ? selected : [selected];
    return new ChipSelect(parent, Object.assign({ options, selected: sel.filter(Boolean), single: !!single }, extra || {}));
  }
  /** Row of numbered buttons (1-5) with words; returns { get, set } */
  scale(parent, label, words, value, onChange) {
    this.label(parent, label);
    const wrap = parent.createDiv({ cls: 'hk-scale' });
    let cur = value;
    const btns = words.map((w, i) => {
      const b = wrap.createEl('button', { cls: 'hk-scale-btn', attr: { type: 'button', 'aria-pressed': 'false' } });
      b.createDiv({ cls: 'hk-scale-num', text: String(i + 1) });
      b.createDiv({ cls: 'hk-scale-word', text: w });
      b.onclick = () => { api.set(cur === i + 1 ? null : i + 1); if (onChange) onChange(cur); };
      return b;
    });
    const api = {
      get: () => cur,
      set: (v) => { cur = v; btns.forEach((b, i) => { b.toggleClass('is-selected', cur === i + 1); b.setAttr('aria-pressed', String(cur === i + 1)); }); },
    };
    api.set(value);
    return api;
  }
  footer(opts) {
    const foot = this.contentEl.createDiv({ cls: 'mt-footer hk-footer' });
    if (opts.onDelete) foot.createEl('button', { text: 'Delete', cls: 'mod-warning' }).onclick = () => this.confirm(opts.deleteTitle || 'Delete this entry?', 'The note will be moved to the trash.', 'Delete', opts.onDelete);
    if (opts.file) foot.createEl('button', { text: 'Open note' }).onclick = () => { this.close(); this.app.workspace.getLeaf('tab').openFile(opts.file); };
    foot.createDiv({ cls: 'mt-spacer' });
    foot.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
    for (const b of opts.extra || []) foot.createEl('button', { text: b.text }).onclick = b.onClick;
    foot.createEl('button', { text: opts.saveText || 'Save', cls: 'mod-cta' }).onclick = opts.onSave;
    return foot;
  }
  confirm(title, msg, yes, fn) {
    const m = new Modal(this.app);
    m.titleEl.setText(title);
    m.contentEl.createEl('p', { text: msg });
    const r = m.contentEl.createDiv({ cls: 'mt-footer' });
    r.createDiv({ cls: 'mt-spacer' });
    r.createEl('button', { text: 'Cancel' }).onclick = () => m.close();
    r.createEl('button', { text: yes, cls: 'mod-warning' }).onclick = async () => { await fn(); m.close(); this.close(); };
    m.open();
  }
  onClose() { this.contentEl.empty(); }
}

/* ---------------- Dashboard helpers ---------------- */
function header(el, title, sub, buttons) {
  const head = el.createDiv({ cls: 'hk-header' });
  const tw = head.createDiv();
  tw.createEl('h2', { text: title });
  if (sub) tw.createDiv({ cls: 'hk-sub', text: sub });
  const actions = head.createDiv({ cls: 'hk-actions' });
  for (const b of buttons) {
    if (b.select) {
      const s = actions.createEl('select', { cls: 'dropdown', attr: { 'aria-label': b.label || '' } });
      for (const [v, t] of b.select) s.createEl('option', { text: t, attr: { value: v } });
      s.value = b.value;
      s.onchange = () => b.onChange(s.value);
      continue;
    }
    const btn = actions.createEl('button', { cls: 'hk-btn' + (b.cta ? ' mod-cta' : '') });
    setIcon(btn.createSpan({ cls: 'hk-btn-icon' }), b.icon);
    btn.createSpan({ text: b.text });
    btn.onclick = b.onClick;
  }
  return head;
}
function tiles(el) {
  const box = el.createDiv({ cls: 'hk-tiles' });
  return (label, value, sub, cls) => {
    const t = box.createDiv({ cls: 'hk-tile' + (cls ? ' ' + cls : '') });
    t.createDiv({ cls: 'hk-tile-label', text: label });
    const v = t.createDiv({ cls: 'hk-tile-value', text: value });
    if (sub) t.createDiv({ cls: 'hk-tile-sub', text: sub });
    return { tile: t, value: v };
  };
}
function card(parent, title, sub, cls) {
  const c = parent.createDiv({ cls: 'hk-card' + (cls ? ' ' + cls : '') });
  if (title) c.createEl('h4', { text: title });
  if (sub) c.createDiv({ cls: 'hk-card-sub', text: sub });
  return c;
}
function emptyState(el, icon, title, text, btnText, onClick) {
  const e = el.createDiv({ cls: 'hk-card hk-empty' });
  setIcon(e.createDiv({ cls: 'hk-empty-icon' }), icon);
  e.createEl('h3', { text: title });
  e.createEl('p', { text });
  if (btnText) e.createEl('button', { text: btnText, cls: 'mod-cta' }).onclick = onClick;
}
function hbars(parent, entries, total, opts = {}) {
  if (!entries.length) { parent.createDiv({ cls: 'hk-muted', text: opts.empty || 'Nothing recorded in this period.' }); return; }
  const max = Math.max(...entries.map((e) => e[1]));
  for (const [name, n, extra] of entries.slice(0, opts.limit || 8)) {
    const row = parent.createDiv({ cls: 'hk-hbar' });
    row.createDiv({ cls: 'hk-hbar-label', text: name, attr: { title: name } });
    const tr = row.createDiv({ cls: 'hk-hbar-track' });
    tr.createDiv({ cls: 'hk-hbar-fill' + (opts.cls ? ' ' + opts.cls : '') }).style.width = Math.max(3, (n / max) * 100) + '%';
    row.createDiv({ cls: 'hk-hbar-val', text: extra != null ? extra : total ? n + ' of ' + total + ' · ' + Math.round((100 * n) / total) + '%' : String(n) });
  }
}
function svg(tag, attrs, parent) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}
/** Vertical bars: items [{label, value, title?, cls?}] */
function vbars(parent, items, opts = {}) {
  const VW = 600, VH = opts.height || 180, L = 26, R = 6, T = 16, B = 26, cw = VW - L - R, ch = VH - T - B;
  const s = svg('svg', { viewBox: '0 0 ' + VW + ' ' + VH, class: 'hk-chart', role: 'img', 'aria-label': opts.label || 'Bar chart' }, parent);
  const max = Math.max(opts.min || 1, ...items.map((i) => i.value));
  const Y = (v) => T + ch - (v / max) * ch;
  const step = Math.max(1, Math.ceil(max / 4));
  for (let v = 0; v <= max; v += step) {
    svg('line', { x1: L, x2: L + cw, y1: Y(v), y2: Y(v), class: 'hk-gridline' }, s);
    svg('text', { x: L - 5, y: Y(v) + 4, 'text-anchor': 'end', class: 'hk-axis' }, s).textContent = v;
  }
  const slot = cw / Math.max(1, items.length), bw = Math.min(38, slot * 0.66);
  items.forEach((it, i) => {
    const x = L + slot * i + (slot - bw) / 2;
    if (it.value) {
      const r = svg('rect', { x, y: Y(it.value), width: bw, height: T + ch - Y(it.value), rx: 3, class: 'hk-bar ' + (it.cls || opts.cls || '') }, s);
      svg('title', {}, r).textContent = it.title || it.label + ': ' + it.value;
      svg('text', { x: x + bw / 2, y: Y(it.value) - 4, 'text-anchor': 'middle', class: 'hk-val' }, s).textContent = it.display != null ? it.display : it.value;
    }
    svg('text', { x: x + bw / 2, y: VH - 8, 'text-anchor': 'middle', class: 'hk-axis' }, s).textContent = it.label;
  });
  return s;
}
/**
 * Line chart over days. series: [{ name, cls, points: [{ key, y, title? }] }]
 * bands: [{ from, to, cls }] (y ranges), refs: [{ y, label, cls }]
 */
function lineChart(parent, o) {
  const VW = 640, VH = o.height || 240, L = 34, R = 10, T = 12, B = 28, cw = VW - L - R, ch = VH - T - B;
  const s = svg('svg', { viewBox: '0 0 ' + VW + ' ' + VH, class: 'hk-chart', role: 'img', 'aria-label': o.label || 'Line chart' }, parent);
  const x0 = parseKey(o.fromKey).getTime(), x1 = Math.max(x0 + DAY_MS, parseKey(o.toKey).getTime());
  const X = (k) => L + ((parseKey(k).getTime() - x0) / (x1 - x0)) * cw;
  const Y = (v) => T + ch - ((Math.min(o.yMax, Math.max(o.yMin, v)) - o.yMin) / (o.yMax - o.yMin)) * ch;
  for (const b of o.bands || []) svg('rect', { x: L, y: Y(b.to), width: cw, height: Math.max(0, Y(b.from) - Y(b.to)), class: 'hk-band ' + b.cls }, s);
  for (let v = o.yMin; v <= o.yMax; v += o.yStep || 20) {
    svg('line', { x1: L, x2: L + cw, y1: Y(v), y2: Y(v), class: 'hk-gridline' }, s);
    svg('text', { x: L - 5, y: Y(v) + 4, 'text-anchor': 'end', class: 'hk-axis' }, s).textContent = v;
  }
  for (const r of o.refs || []) {
    svg('line', { x1: L, x2: L + cw, y1: Y(r.y), y2: Y(r.y), class: 'hk-ref ' + (r.cls || '') }, s);
    if (r.label) svg('text', { x: L + cw - 2, y: Y(r.y) - 3, 'text-anchor': 'end', class: 'hk-axis hk-ref-label' }, s).textContent = r.label;
  }
  // x ticks
  const days = Math.round((x1 - x0) / DAY_MS);
  const nt = Math.min(6, Math.max(2, days));
  for (let i = 0; i <= nt; i++) {
    const k = addDaysKey(o.fromKey, Math.round((days * i) / nt));
    svg('text', { x: X(k), y: VH - 8, 'text-anchor': i === 0 ? 'start' : i === nt ? 'end' : 'middle', class: 'hk-axis' }, s).textContent = fmtShort(k);
  }
  for (const se of o.series) {
    const pts = se.points.filter((p) => p.y != null).sort((a, b) => a.key.localeCompare(b.key));
    if (pts.length > 1) svg('polyline', { points: pts.map((p) => X(p.key).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' '), class: 'hk-line ' + se.cls }, s);
    if (pts.length <= 120) for (const p of pts) {
      const c = svg('circle', { cx: X(p.key), cy: Y(p.y), r: pts.length > 60 ? 2 : 3, class: 'hk-dot ' + se.cls }, s);
      svg('title', {}, c).textContent = p.title || fmtKey(p.key) + ': ' + p.y;
    }
  }
  if (o.legend !== false && o.series.length > 1) {
    const lg = parent.createDiv({ cls: 'hk-legend' });
    for (const se of o.series) { const it = lg.createSpan({ cls: 'hk-legend-item' }); it.createSpan({ cls: 'hk-swatch ' + se.cls }); it.createSpan({ text: se.name }); }
  }
  return s;
}
/** Month calendar. dayInfo(key) -> { cls:[], marks:[{cls, style}], tip:[] } ; onClick(evt, key) */
function monthCalendar(parent, state, onNav, dayInfo, onClick, mondayFirst) {
  const box = parent;
  const today = todayKey();
  const base = parseKey(today); base.setDate(1); base.setMonth(base.getMonth() + state.monthOffset);
  const nav = box.createDiv({ cls: 'hk-cal-nav' });
  const prev = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Previous month' } });
  setIcon(prev, 'chevron-left');
  prev.onclick = () => { state.monthOffset--; onNav(); };
  nav.createDiv({ cls: 'hk-cal-title', text: MONTHS_LONG[base.getMonth()] + ' ' + base.getFullYear() });
  nav.createEl('button', { cls: 'hk-small-btn', text: 'Today' }).onclick = () => { state.monthOffset = 0; onNav(); };
  const next = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Next month' } });
  setIcon(next, 'chevron-right');
  next.onclick = () => { state.monthOffset++; onNav(); };
  const grid = box.createDiv({ cls: 'hk-cal-grid' });
  const names = mondayFirst ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  for (const n of names) grid.createDiv({ cls: 'hk-cal-head', text: n });
  const lead = mondayFirst ? (base.getDay() + 6) % 7 : base.getDay();
  for (let i = 0; i < lead; i++) grid.createDiv({ cls: 'hk-cal-day is-blank' });
  const dim = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const k = keyOf(new Date(base.getFullYear(), base.getMonth(), d));
    const info = dayInfo(k) || {};
    const cell = grid.createEl('button', { cls: 'hk-cal-day' });
    cell.createSpan({ cls: 'hk-cal-num', text: String(d) });
    for (const c of info.cls || []) cell.addClass(c);
    for (const m of info.marks || []) { const s = cell.createSpan({ cls: m.cls }); if (m.style) Object.assign(s.style, m.style); }
    if (k === today) cell.addClass('is-today');
    if (k > today) cell.addClass('is-future');
    cell.setAttr('aria-label', [fmtKey(k)].concat(info.tip || []).join('\n'));
    cell.onclick = (evt) => onClick(evt, k);
  }
  return box;
}

/* ---------------- PDF report builder (uses the migraine tracker's PDF writer) ---------------- */
const RC = {
  ink: [0.13, 0.13, 0.15], muted: [0.42, 0.42, 0.46], faint: [0.62, 0.62, 0.66], rule: [0.86, 0.86, 0.89],
  panel: [0.965, 0.965, 0.975], warn: MI.hexRgb('#b45309'), warnSoft: MI.hexRgb('#fff4e5'),
};
class Report {
  constructor(title, rangeText, accentHex) {
    this.doc = new MI.PdfDoc(title + (rangeText ? ' ' + rangeText : ''));
    this.title = title; this.rangeText = rangeText || '';
    this.accent = MI.hexRgb(accentHex || '#1f8a8a');
    this.M = 48; this.W = this.doc.W - 96; this.BOTTOM = this.doc.H - 54;
    this.newPage();
  }
  newPage() {
    const d = this.doc;
    d.addPage();
    this.y = this.M;
    if (d.pages.length > 1) {
      d.text(this.M, this.y, this.title, { size: 8, bold: true, color: RC.muted });
      d.text(this.M + this.W, this.y, this.rangeText, { size: 8, color: RC.muted, align: 'right' });
      d.line(this.M, this.y + 6, this.M + this.W, this.y + 6, { color: RC.rule });
      this.y += 24;
    }
  }
  ensure(h) { if (this.y + h > this.BOTTOM) this.newPage(); }
  /** Filled triangle centred at (cx, cy), pointing up or down */
  triangle(cx, cy, size, up, rgb) {
    const d = this.doc, w = size * 1.15, h = size, Y = (y) => d.num(d.H - y);
    const pts = up ? [[cx - w / 2, cy + h / 2], [cx + w / 2, cy + h / 2], [cx, cy - h / 2]] : [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx, cy + h / 2]];
    d.page.push('q ' + d.color(rgb) + ' rg ' + d.num(pts[0][0]) + ' ' + Y(pts[0][1]) + ' m ' + d.num(pts[1][0]) + ' ' + Y(pts[1][1]) + ' l ' + d.num(pts[2][0]) + ' ' + Y(pts[2][1]) + ' l f Q');
  }
  /** Rounded "pill" with centred text, like the dashboard badges */
  pill(x, y, text, o = {}) {
    const d = this.doc, size = o.size || 8.5, padX = o.padX || 6, h = o.h || size + 6;
    const w = d.width(text, size, true) + padX * 2, r = h / 2, k = 0.5523 * r, Y = (yy) => d.num(d.H - yy);
    const L = o.align === 'right' ? x - w : x, T = y, R = L + w, B = T + h;
    d.page.push('q ' + d.color(o.fill) + ' rg ' + [
      d.num(L + r) + ' ' + Y(T) + ' m', d.num(R - r) + ' ' + Y(T) + ' l',
      d.num(R - r + k) + ' ' + Y(T) + ' ' + d.num(R) + ' ' + Y(T + r - k) + ' ' + d.num(R) + ' ' + Y(T + r) + ' c',
      d.num(R) + ' ' + Y(B - r + k) + ' ' + d.num(R - r + k) + ' ' + Y(B) + ' ' + d.num(R - r) + ' ' + Y(B) + ' c',
      d.num(L + r) + ' ' + Y(B) + ' l',
      d.num(L + r - k) + ' ' + Y(B) + ' ' + d.num(L) + ' ' + Y(B - r + k) + ' ' + d.num(L) + ' ' + Y(B - r) + ' c',
      d.num(L) + ' ' + Y(T + r - k) + ' ' + d.num(L + r - k) + ' ' + Y(T) + ' ' + d.num(L + r) + ' ' + Y(T) + ' c',
    ].join(' ') + ' f Q');
    d.text(L + padX, T + h / 2 + size * 0.35, text, { size, bold: true, color: o.color || [1, 1, 1] });
    return w;
  }
  cover(lines) {
    const d = this.doc;
    d.rect(this.M, this.y, this.W, 4, { fill: this.accent });
    this.y += 26;
    d.text(this.M, this.y, this.title, { size: 20, bold: true });
    this.y += 18;
    for (const l of lines.filter(Boolean)) { d.text(this.M, this.y, l, { size: 10, color: RC.muted }); this.y += 14; }
    this.y += 8;
  }
  heading(t, sub, keepWith) {
    this.ensure(Math.max(70, (keepWith || 0) + 40));
    this.y += 8;
    this.doc.text(this.M, this.y, t, { size: 13, bold: true, color: this.accent });
    this.y += 6;
    this.doc.line(this.M, this.y, this.M + this.W, this.y, { color: RC.rule });
    this.y += 14;
    if (sub) { this.para(sub, { size: 8.5, color: RC.muted }); }
  }
  para(text, o = {}) {
    const size = o.size || 10, lh = size * 1.35;
    for (const line of this.doc.wrap(text, o.width || this.W, size, o.bold)) {
      this.ensure(lh);
      this.doc.text(this.M + (o.indent || 0), this.y, line, { size, bold: o.bold, color: o.color || RC.ink });
      this.y += lh;
    }
    this.y += o.after == null ? 4 : o.after;
  }
  note(text, warn) {
    const lines = this.doc.wrap(text, this.W - 20, 9);
    const h = lines.length * 12 + 12;
    this.ensure(h + 6);
    this.doc.rect(this.M, this.y - 2, this.W, h, { fill: warn ? RC.warnSoft : RC.panel });
    this.doc.rect(this.M, this.y - 2, 3, h, { fill: warn ? RC.warn : this.accent });
    let yy = this.y + 10;
    for (const l of lines) { this.doc.text(this.M + 12, yy, l, { size: 9, color: warn ? RC.warn : RC.ink }); yy += 12; }
    this.y += h + 8;
  }
  /** Key figures in boxes: [[label, value, sub?]] */
  stats(items, cols) {
    cols = cols || 3;
    const gap = 8, w = (this.W - gap * (cols - 1)) / cols, h = 46;
    for (let i = 0; i < items.length; i += cols) {
      this.ensure(h + gap);
      items.slice(i, i + cols).forEach(([label, value, sub, st], j) => {
        st = st || {};
        const x = this.M + j * (w + gap);
        this.doc.rect(x, this.y, w, h, { fill: RC.panel });
        if (st.accent) this.doc.rect(x, this.y, 3, h, { fill: st.accent });
        this.doc.text(x + 8, this.y + 13, String(label).toUpperCase(), { size: 6.5, bold: true, color: RC.muted, maxWidth: w - 16 });
        let vx = x + 8;
        if (st.arrow) { this.triangle(vx + 4.5, this.y + 25, 8, st.arrow === 'up', st.arrowColor || st.valueColor || RC.ink); vx += 13; }
        const avail = w - 16 - (vx - x - 8);
        let vs = 13;
        while (vs > 9 && this.doc.width(String(value), vs, true) > avail) vs -= 0.5; // shrink long values before cutting them
        this.doc.text(vx, this.y + 29, String(value), { size: vs, bold: true, maxWidth: avail, color: st.valueColor || RC.ink });
        if (sub) this.doc.text(x + 8, this.y + 40, String(sub), { size: 7, color: RC.muted, maxWidth: w - 16 });
      });
      this.y += h + gap;
    }
    this.y += 4;
  }
  /** cols: [{ label, w (fraction), align? }], rows: string[][]; rowColor(i) -> rgb|null for first column swatch */
  table(cols, rows, o = {}) {
    const d = this.doc, size = o.size || 8.5, lh = size * 1.3, pad = 4;
    const widths = cols.map((c) => c.w * this.W);
    const drawHead = () => {
      this.ensure(lh + 10);
      d.rect(this.M, this.y - 2, this.W, lh + 6, { fill: RC.panel });
      let x = this.M;
      cols.forEach((c, i) => { d.text(c.align === 'right' ? x + widths[i] - pad : x + pad, this.y + lh - 1, c.label, { size: size - 0.5, bold: true, color: RC.muted, align: c.align, maxWidth: widths[i] - pad * 2 }); x += widths[i]; });
      this.y += lh + 8;
    };
    drawHead();
    rows.forEach((r, ri) => {
      const wrapped = r.map((cell, i) => (cols[i].wrap ? d.wrap(cell, widths[i] - pad * 2, size) : [String(cell == null ? '' : cell)]));
      const h = Math.max(...wrapped.map((w) => w.length)) * lh + 4;
      if (this.y + h > this.BOTTOM) { this.newPage(); drawHead(); }
      let x = this.M;
      wrapped.forEach((lines, i) => {
        if (o.drawCell && o.drawCell(ri, i, { x, y: this.y, w: widths[i], lh, pad, align: cols[i].align, size })) { x += widths[i]; return; }
        const color = o.cellColor ? o.cellColor(ri, i) : null;
        lines.forEach((l, li) => d.text(cols[i].align === 'right' ? x + widths[i] - pad : x + pad, this.y + lh * (li + 1) - 2, l, { size, color: color || RC.ink, bold: !!(color && o.boldColored), align: cols[i].align, maxWidth: widths[i] - pad * 2 }));
        x += widths[i];
      });
      this.y += h;
      d.line(this.M, this.y, this.M + this.W, this.y, { color: RC.rule, width: 0.3 });
      this.y += 2;
    });
    this.y += 10;
  }
  /** Line chart: series [{ color, points:[{key, y}] }], bands [{from,to,color}], refs [{y,label,color}] */
  chart(o) {
    const d = this.doc, h = o.height || 170;
    this.ensure(h + 30);
    const L = this.M + 30, R = this.M + this.W - 4, T = this.y + 4, B = this.y + h - 18, cw = R - L, ch = B - T;
    const x0 = parseKey(o.fromKey).getTime(), x1 = Math.max(x0 + DAY_MS, parseKey(o.toKey).getTime());
    const X = (k) => L + ((parseKey(k).getTime() - x0) / (x1 - x0)) * cw;
    const Y = (v) => B - ((Math.min(o.yMax, Math.max(o.yMin, v)) - o.yMin) / (o.yMax - o.yMin)) * ch;
    for (const b of o.bands || []) d.rect(L, Y(b.to), cw, Math.max(0, Y(b.from) - Y(b.to)), { fill: b.color });
    for (let v = o.yMin; v <= o.yMax; v += o.yStep || 20) { d.line(L, Y(v), R, Y(v), { color: RC.rule, width: 0.3 }); d.text(L - 4, Y(v) + 3, String(v), { size: 7, color: RC.muted, align: 'right' }); }
    for (const r of o.refs || []) { d.line(L, Y(r.y), R, Y(r.y), { color: r.color || RC.faint, width: 0.8 }); if (r.label) d.text(R - 2, Y(r.y) - 3, r.label, { size: 6.5, color: r.color || RC.muted, align: 'right' }); }
    const days = Math.round((x1 - x0) / DAY_MS), nt = Math.min(6, Math.max(2, days));
    for (let i = 0; i <= nt; i++) { const k = addDaysKey(o.fromKey, Math.round((days * i) / nt)); d.text(X(k), B + 12, fmtShort(k), { size: 7, color: RC.muted, align: i === 0 ? undefined : i === nt ? 'right' : 'center' }); }
    for (const se of o.series) {
      const pts = se.points.filter((p) => p.y != null).sort((a, b) => a.key.localeCompare(b.key));
      for (let i = 1; i < pts.length; i++) d.line(X(pts[i - 1].key), Y(pts[i - 1].y), X(pts[i].key), Y(pts[i].y), { color: se.color, width: 1.2 });
      if (pts.length <= 90) for (const p of pts) d.rect(X(p.key) - 1.5, Y(p.y) - 1.5, 3, 3, { fill: se.color });
    }
    this.y += h + 8;
    if (o.legend) {
      let x = this.M + 30;
      for (const [label, color] of o.legend) { d.rect(x, this.y - 6, 8, 8, { fill: color }); d.text(x + 12, this.y + 1, label, { size: 7.5, color: RC.muted }); x += d.width(label, 7.5) + 30; }
      this.y += 12;
    }
    this.y += 6;
  }
  /** Vertical bars: items [{ label, value, color? }]; o: { height, band: {from, to, color, label}, ref: {y, label}, yMax } */
  bars(items, o = {}) {
    const d = this.doc, h = o.height || 150;
    this.ensure(h + 24);
    const L = this.M + 26, R = this.M + this.W - 4, T = this.y + 10, B = this.y + h - 16, cw = R - L, ch = B - T;
    const max = Math.max(o.yMax || 0, 1, ...items.map((i) => i.value));
    const Y = (v) => B - (Math.min(v, max) / max) * ch;
    if (o.band) d.rect(L, Y(o.band.to), cw, Math.max(0, Y(o.band.from) - Y(o.band.to)), { fill: o.band.color });
    // a shaded run of columns (for example a window of days), behind the bars
    if (o.xBand) { const sl = cw / Math.max(1, items.length); d.rect(L + sl * o.xBand.from, T, sl * (o.xBand.to - o.xBand.from + 1), ch, { fill: o.xBand.color }); }
    const step = o.step || Math.max(1, Math.ceil(max / 4));
    for (let v = 0; v <= max; v += step) { d.line(L, Y(v), R, Y(v), { color: RC.rule, width: 0.3 }); d.text(L - 4, Y(v) + 3, String(v), { size: 7, color: RC.muted, align: 'right' }); }
    const slot = cw / Math.max(1, items.length), bw = Math.min(30, slot * 0.64);
    const every = Math.ceil(items.length / (o.maxLabels || 14));
    items.forEach((it, i) => {
      const x = L + slot * i + (slot - bw) / 2;
      if (it.value) {
        d.rect(x, Y(it.value), bw, B - Y(it.value), { fill: it.color || this.accent });
        d.text(x + bw / 2, Y(it.value) - 3, String(it.display != null ? it.display : it.value), { size: 7, color: RC.muted, align: 'center' });
      }
      if (i % every === 0) d.text(x + bw / 2, B + 11, it.label, { size: 6.8, color: RC.muted, align: 'center' });
    });
    if (o.ref) {
      d.line(L, Y(o.ref.y), R, Y(o.ref.y), { color: RC.ink, width: 0.7 });
      if (!o.ref.inLegend) d.text(L + 3, Y(o.ref.y) - 3, o.ref.label, { size: 7, bold: true, color: RC.ink });
    }
    this.y += h + 6;
    if (o.legend) {
      let x = this.M + 26;
      for (const [label, color] of o.legend) { d.rect(x, this.y - 6, 8, 8, { fill: color }); d.text(x + 12, this.y + 1, label, { size: 7.5, color: RC.muted }); x += d.width(label, 7.5) + 30; }
      this.y += 12;
    }
    this.y += 6;
  }
  /** Small month calendars, 4 per row. months: [{ y, m }]; color(key) -> rgb | null; inRange(key) -> bool */
  calendars(months, color, inRange, o = {}) {
    const d = this.doc, cols = 4, gap = 14, mw = (this.W - gap * (cols - 1)) / cols, cell = mw / 7;
    const names = o.mondayFirst ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const rowH = 24 + 6 * cell + 8;
    months.forEach((mo, i) => {
      if (i % cols === 0) { if (i > 0) this.y += rowH; this.ensure(rowH); }
      const x0 = this.M + (i % cols) * (mw + gap);
      d.text(x0, this.y + 8, MONTHS_LONG[mo.m] + ' ' + mo.y, { size: 8.5, bold: true });
      names.forEach((n, j) => d.text(x0 + j * cell + cell / 2, this.y + 20, n, { size: 6.5, color: RC.faint, align: 'center' }));
      const first = new Date(mo.y, mo.m, 1), lead = o.mondayFirst ? (first.getDay() + 6) % 7 : first.getDay();
      const dim = new Date(mo.y, mo.m + 1, 0).getDate();
      for (let day = 1; day <= dim; day++) {
        const idx = lead + day - 1, cx = x0 + (idx % 7) * cell, cy = this.y + 24 + Math.floor(idx / 7) * cell;
        const k = keyOf(new Date(mo.y, mo.m, day)), c = color(k), inside = inRange(k);
        d.rect(cx + 0.8, cy + 0.8, cell - 1.6, cell - 1.6, { fill: c || (inside ? RC.panel : [1, 1, 1]) });
        d.text(cx + cell / 2, cy + cell / 2 + 2.4, String(day), { size: 6.3, bold: !!c, color: c ? RC.ink : inside ? RC.muted : [0.8, 0.8, 0.82], align: 'center' });
      }
    });
    if (months.length) this.y += rowH;
    if (o.legend) {
      let x = this.M;
      d.text(x, this.y + 6, o.legendTitle || '', { size: 7.5, color: RC.muted });
      x += o.legendTitle ? d.width(o.legendTitle, 7.5) + 6 : 0;
      for (const [label, c] of o.legend) { d.rect(x, this.y, 9, 9, { fill: c }); d.text(x + 12, this.y + 7.5, label, { size: 7, color: RC.muted }); x += d.width(label, 7) + 22; }
      this.y += 16;
    }
    this.y += 6;
  }
  /** Frequency lists as bars, two per row. blocks: [{ title, entries: [[name, n]], total, keepAll }] */
  freqGrid(blocks) {
    const d = this.doc, gap = 20, colW = (this.W - gap) / 2, rowH = 13;
    const rowsOf = (b) => (b.keepAll ? b.entries : b.entries.filter((e) => e[1] > 0).slice(0, 8));
    const heightOf = (b) => (b ? 20 + Math.max(1, rowsOf(b).length) * rowH + 10 : 0);
    for (let i = 0; i < blocks.length; i += 2) {
      const h = Math.max(heightOf(blocks[i]), heightOf(blocks[i + 1]));
      this.ensure(h);
      [blocks[i], blocks[i + 1]].forEach((b, j) => {
        if (!b) return;
        const x0 = this.M + j * (colW + gap), rows = rowsOf(b);
        d.text(x0, this.y + 9, b.title, { size: 9.5, bold: true });
        if (!rows.length) { d.text(x0, this.y + 24, 'Nothing recorded', { size: 8, color: RC.faint }); return; }
        const max = Math.max(1, ...rows.map((r) => r[1])), labelW = colW * 0.36, valW = 72, barW = colW - labelW - valW - 8;
        rows.forEach((r, k) => {
          const ry = this.y + 18 + k * rowH;
          d.text(x0, ry + 8, r[0], { size: 7.8, maxWidth: labelW - 4 });
          d.rect(x0 + labelW, ry + 2.5, barW, 6, { fill: [0.92, 0.92, 0.94] });
          if (r[1]) d.rect(x0 + labelW, ry + 2.5, Math.max(1.5, (r[1] / max) * barW), 6, { fill: this.accent });
          d.text(x0 + colW, ry + 8, r[1] + (b.total ? ' of ' + b.total + ' (' + Math.round((100 * r[1]) / b.total) + '%)' : ''), { size: 7.5, color: RC.muted, align: 'right' });
        });
      });
      this.y += h;
    }
    this.y += 4;
  }
    /** Extra sections supplied by Health Dashboard: [{ title, intro, cols: [{label, w}], rows, empty }] */
  extraSections(list) {
    for (const sec of list || []) {
      this.heading(sec.title, sec.intro);
      if (sec.rows && sec.rows.length) this.table(sec.cols.map((c) => ({ label: c.label, w: c.w, wrap: true })), sec.rows, { size: 8.5 });
      else if (sec.empty) this.para(sec.empty, { size: 9, color: RC.muted });
    }
  }
  footerAll(text) {
    const d = this.doc;
    d.pages.forEach((p, i) => {
      d.page = p;
      d.text(this.M, d.H - 30, text, { size: 7, color: RC.faint });
      d.text(this.M + this.W, d.H - 30, 'Page ' + (i + 1) + ' of ' + d.pages.length, { size: 7, color: RC.faint, align: 'right' });
    });
  }
  output() { return this.doc.output(); }
}

/** Range picker modal used by the PDF reports */
class ReportOptionsModal extends FormModal {
  constructor(plugin, o) { super(plugin); this.o = o; }
  onOpen() {
    const o = this.o, s = this.plugin.settings;
    this.begin(o.title);
    const sec = this.section('Report', 'file-text');
    if (!o.noRange) this.label(sec, 'Period');
    const ranges = [['30', 'Last 30 days'], ['90', 'Last 3 months'], ['180', 'Last 6 months'], ['365', 'Last 12 months'], ['all', 'All data'], ['custom', 'Custom dates']];
    this.range = this.chips(sec, null, ranges.map((r) => r[1]), ranges.find((r) => r[0] === (o.defaultRange || '90'))[1], true, { allowCustom: false, onChange: () => toggle() });
    const row = this.row(sec);
    this.from = this.field(row, 'From', 'date', addDaysKey(todayKey(), -89));
    this.to = this.field(row, 'To', 'date', todayKey());
    const toggle = () => { const custom = this.range.value() === 'Custom dates'; row.toggleClass('hk-hidden', !custom); };
    toggle();
    if (o.noRange) this.range.el.addClass('hk-hidden');
    const r2 = this.row(sec);
    this.name = this.field(r2, 'Name on report', 'text', s.reportName || '', { placeholder: 'Set your name in Health Dashboard settings' });
    this.notes = this.area(sec, 'Questions or notes for your doctor (optional)', '', 'Printed in the report.', 3);
    this.toggles = {};
    const toggles = (o.toggles || []).slice();
    if (this.plugin.reportExtras) toggles.push(['includeGenNotes', 'Include general notes', true]);
    for (const [key, label, def] of toggles) {
      const lab = sec.createEl('label', { cls: 'hk-check' });
      const cb = lab.createEl('input', { type: 'checkbox' });
      cb.checked = def;
      lab.appendText(' ' + label);
      this.toggles[key] = cb;
    }
    this.footer({ saveText: 'Create PDF', onSave: () => this.go(ranges) });
  }
  async go(ranges) {
    const label = this.range.value();
    const code = (ranges.find((r) => r[1] === label) || ranges[1])[0];
    const today = todayKey();
    let from, to = today;
    if (code === 'custom') { from = normDate(this.from.value); to = normDate(this.to.value); }
    else if (code === 'all') from = '';
    else from = addDaysKey(today, -(Number(code) - 1));
    if (code === 'custom' && (!from || !to || from > to)) { new Notice('Choose a valid date range.'); return; }
    const s = this.plugin.settings;
    const opts = { from, to, name: this.name.value.trim(), notes: this.notes.value.trim() };
    for (const k in this.toggles) opts[k] = this.toggles[k].checked;
    try {
      const file = await this.o.build(opts);
      this.close();
      if (file) await this.app.workspace.getLeaf('tab').openFile(file);
    } catch (e) {
      console.error(e);
      new Notice('Report failed: ' + e.message);
    }
  }
}

module.exports = {
  ChipSelect, MI, MONTHS, MONTHS_LONG, DOW, DAY_MS, pad, keyOf, todayKey, nowTime, parseKey, addDaysKey, addMonthsKey, daysBetween,
  normDate, normTime, fmtKey, fmtShort, plural, relDays, durationText, cap, asArray, str, num, linesOf, isEmpty, mean, round, tally,
  csvEsc, safeName, TrackerPlugin, TrackerView, FormModal, header, tiles, card, emptyState, hbars, svg, vbars, lineChart, monthCalendar,
  Report, RC, ReportOptionsModal,
};
