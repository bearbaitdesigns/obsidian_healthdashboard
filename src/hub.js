/* ================================================================== */
/* Health Dashboard: hosts both trackers and adds a combined view      */
/* ================================================================== */
const {
  Plugin, ItemView, Modal, Notice, PluginSettingTab, Setting, Menu, setIcon, MarkdownRenderChild, normalizePath,
} = obsidian;

const P = PeriodModule._internals;
const M = MigraineModule._internals;
const V = VisitsModule._internals;
const B = BPModule._internals;
const I = IllnessModule._internals;
const D = MedsModule._internals;
const A = A1CModule._internals;
const HUB_VIEW = 'health-dashboard';
const TABS = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { id: 'period', label: 'Period', icon: 'droplet' },
  { id: 'migraine', label: 'Migraine', icon: 'brain' },
  { id: 'visits', label: 'Visits', icon: 'stethoscope' },
  { id: 'bp', label: 'Blood pressure', icon: 'activity' },
  { id: 'illness', label: 'Sickness', icon: 'thermometer' },
  { id: 'meds', label: 'Medications', icon: 'pill' },
  { id: 'a1c', label: 'A1C', icon: 'test-tube' },
];
const HUB_DEFAULTS = { defaultTab: 'last', lastTab: 'overview', showCycleLink: true, showDisclaimer: true, userName: '', calendarWide: false, overviewLayoutMode: 'free', overviewLayout: {}, notesFolder: 'Health Notes', reportOrder: null, reportSkip: [] };
const MODULE_KEYS = ['period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c'];
const OVERVIEW_KEYS = MODULE_KEYS.concat(['calendar', 'cycle', 'notes']);
const GENERIC_TABS = { bp: 'Blood pressure', illness: 'Sickness tracking', meds: 'Medications', a1c: 'A1C' };
// ICHD-3 menstrual window: day -2 to day +3, day 1 = first day of bleeding (no day 0) => offsets -2..+2
const WIN_LO = -2, WIN_HI = 2, WIN_DAYS = WIN_HI - WIN_LO + 1;

function hubButton(parent, icon, label, onClick, cta) {
  const b = parent.createEl('button', { cls: 'hd-btn' + (cta ? ' mod-cta' : '') });
  setIcon(b.createSpan({ cls: 'hd-btn-icon' }), icon);
  b.createSpan({ text: label });
  b.addEventListener('click', onClick);
  return b;
}
function svg(tag, attrs, parent) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}
const epDay = (date) => P.toDayNum(M.dayKey(date));

const MODULES = [
  { key: 'period', id: 'period-tracker', name: 'Period Tracker', label: 'Period tracking', view: P.VIEW_TYPE, Base: PeriodModule,
    desc: 'Cycle logging, predictions, PDF report, the Period tab and the period-tracker code block.' },
  { key: 'migraine', id: 'migraine-tracker', name: 'Migraine Tracker', label: 'Migraine tracking', view: M.VIEW_TYPE, Base: MigraineModule,
    desc: 'Migraine episodes, statistics, doctor report and the Migraine tab.' },
  { key: 'visits', id: 'doctor-visits', name: 'Doctor Visits', label: 'Doctor visits', view: V.VIEW_TYPE, Base: VisitsModule,
    desc: 'Appointments, follow-ups, care team and the Visits tab.' },
  { key: 'bp', id: 'blood-pressure', name: 'Blood Pressure', label: 'Blood pressure', view: B.VIEW_TYPE, Base: BPModule,
    desc: 'Readings, averages, trend chart, doctor report and the Blood pressure tab.' },
  { key: 'illness', id: 'sickness-tracker', name: 'Sickness Tracker', label: 'Sickness and general health', view: I.VIEW_TYPE, Base: IllnessModule,
    desc: 'Sickness episodes, symptoms, treatment and the Sickness tab.' },
  { key: 'meds', id: 'medication-list', name: 'Medications', label: 'Medications', view: D.VIEW_TYPE, Base: MedsModule,
    desc: 'Current medications, schedule, refills, printable medication list and the Medications tab.' },
  { key: 'a1c', id: 'a1c-tracker', name: 'A1C', label: 'A1C', view: A.VIEW_TYPE, Base: A1CModule,
    desc: 'A1C (HbA1c) results, trend, estimated average glucose, test reminders, doctor report and the A1C tab.' },
];

/* sortable:start */
/**
 * Drag-to-reorder for the direct children of `container` that have `opts.itemClass`.
 * Mouse and pen: press and move. Touch: press and hold briefly, then move.
 * Items move live while dragging; `opts.onSort(keys)` gets the new order on drop.
 */
function makeSortable(container, opts) {
  const doc = container.ownerDocument || document;
  const win = doc.defaultView || window;
  const keyOf = opts.keyOf || ((el) => el.getAttribute('data-key'));
  const items = () => Array.from(container.children).filter((c) => c.classList && c.classList.contains(opts.itemClass));
  const isControl = (t, item) => {
    for (let n = t; n && n !== item; n = n.parentElement) if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL)$/.test(n.tagName) || (n.classList && n.classList.contains('clickable-icon'))) return true;
    return false;
  };
  let drag = null;
  const cleanup = () => {
    doc.removeEventListener('pointermove', onMove, true);
    doc.removeEventListener('pointerup', onUp, true);
    doc.removeEventListener('pointercancel', onCancel, true);
    container.removeEventListener('touchmove', blockTouch);
    if (drag && drag.timer) win.clearTimeout(drag.timer);
  };
  const begin = () => {
    if (!drag || drag.active) return;
    drag.active = true;
    drag.before = items().map(keyOf).join('|');
    drag.item.classList.add('is-dragging');
    container.classList.add('is-sorting');
    doc.body.classList.add('hd-no-select');
    try { drag.item.setPointerCapture(drag.pointerId); } catch (e) { /* not supported */ }
    if (drag.touch && win.navigator && win.navigator.vibrate) { try { win.navigator.vibrate(15); } catch (e) { /* ignore */ } }
  };
  const blockTouch = (e) => { if (drag && drag.active) e.preventDefault(); };
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.active) {
      if (drag.touch) { if (Math.hypot(dx, dy) > 10) { cleanup(); drag = null; } return; } // a scroll, not a drag
      if (Math.hypot(dx, dy) < 6) return;
      begin();
    }
    e.preventDefault();
    let target = null, after = false;
    for (const el of items()) {
      if (el === drag.item) continue;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        target = el;
        const sameRow = Math.abs(r.top - drag.item.getBoundingClientRect().top) < r.height / 2;
        after = sameRow || opts.horizontal ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
        break;
      }
    }
    if (target) {
      const ref = after ? target.nextSibling : target;
      if (ref !== drag.item && drag.item.nextSibling !== ref) container.insertBefore(drag.item, ref);
    }
  }
  function finish(commit) {
    const d = drag;
    cleanup();
    drag = null;
    if (!d || !d.active) return;
    d.item.classList.remove('is-dragging');
    container.classList.remove('is-sorting');
    doc.body.classList.remove('hd-no-select');
    // the drop must not also count as a click on the tab or card
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    container.addEventListener('click', stop, true);
    win.setTimeout(() => container.removeEventListener('click', stop, true), 0);
    const keys = items().map(keyOf);
    if (commit && keys.join('|') !== d.before) opts.onSort(keys);
  }
  function onUp(e) { if (drag && e.pointerId === drag.pointerId) finish(true); }
  function onCancel(e) { if (drag && e.pointerId === drag.pointerId) finish(!!(drag && drag.active)); }
  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag || (opts.enabled && !opts.enabled())) return;
    let item = e.target;
    while (item && item !== container && !(item.classList && item.classList.contains(opts.itemClass))) item = item.parentElement;
    if (!item || item === container || item.parentElement !== container) return;
    if (!opts.allowControls && isControl(e.target, item)) return;
    drag = { item, x: e.clientX, y: e.clientY, pointerId: e.pointerId, touch: e.pointerType === 'touch', active: false, timer: null };
    if (drag.touch) {
      drag.timer = win.setTimeout(begin, 350);
      container.addEventListener('touchmove', blockTouch, { passive: false });
    }
    doc.addEventListener('pointermove', onMove, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onCancel, true);
  });
  // Native drag (images, links) would fight with ours
  container.addEventListener('dragstart', (e) => { if (drag) e.preventDefault(); });
}
/* sortable:end */

/* freeboard:start */
/**
 * Free-form board: each child with `opts.itemClass` sits at its own pixel position and width.
 * Drag a block anywhere (it snaps to an 8px grid and to nearby edges); drag the corner handle to resize.
 * Blocks never overlap: anything underneath is pushed down. Below `stackBelow` px the blocks stack in order.
 * opts: itemClass, load() -> {key: {x, y, w, h}}, save(layout, keysInReadingOrder), snap, gap, minW, minH, stackBelow
 * Returns { relayout, tidy, reset }.
 */
function freeBoard(board, opts) {
  const doc = board.ownerDocument || document;
  const win = doc.defaultView || window;
  const snap = opts.snap || 8, gap = opts.gap == null ? 14 : opts.gap, minW = opts.minW || 220, minH = opts.minH || 80, stackBelow = opts.stackBelow || 600;
  const keyOf = (el) => el.getAttribute('data-key');
  const items = () => Array.from(board.children).filter((c) => c.classList && c.classList.contains(opts.itemClass));
  const isControl = (t, item) => {
    for (let n = t; n && n !== item; n = n.parentElement) if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL)$/.test(n.tagName) || (n.classList && n.classList.contains('clickable-icon'))) return true;
    return false;
  };
  const rnd = (v) => Math.round(v / snap) * snap;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const overlap = (a, b) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.hh + gap && b.y < a.y + a.hh + gap;
  board.classList.add('hd-board-free');
  for (const el of items()) {
    if (!el.querySelector(':scope > .hd-resize')) {
      const h = el.createDiv ? el.createDiv({ cls: 'hd-resize', attr: { title: 'Drag to resize', 'aria-hidden': 'true' } }) : el.appendChild(doc.createElement('div'));
      h.classList.add('hd-resize');
    }
  }

  let saved = Object.assign({}, (opts.load && opts.load()) || {});
  let W = 0, current = {}, stacked = false, drag = null, ghost = null;

  // Default width: the same columns the grid layout would use
  const defaultW = (el) => {
    const n = Math.max(1, Math.floor((W + gap) / (280 + gap)));
    const col = (W - (n - 1) * gap) / n;
    if (el.classList.contains('is-wide')) return W;
    if (el.classList.contains('hd-span2')) return Math.min(W, col * 2 + gap);
    return col;
  };
  // First free spot: lowest row, then leftmost
  const findSpot = (placed, w, hh) => {
    const xs = Array.from(new Set([0].concat(placed.map((p) => p.x + p.w + gap), placed.map((p) => p.x)))).filter((x) => x + w <= W + 0.5).sort((a, b) => a - b);
    const ys = Array.from(new Set([0].concat(placed.map((p) => p.y + p.hh + gap)))).sort((a, b) => a - b);
    for (const y of ys) for (const x of xs) { const r = { x, y, w, hh }; if (!placed.some((p) => overlap(p, r))) return r; }
    return { x: 0, y: placed.reduce((m, p) => Math.max(m, p.y + p.hh + gap), 0), w, hh };
  };

  /**
   * Lay out every block from `src` (key -> {x, y, w, h}); `first` keeps its spot and the rest move down out of its way.
   * `skip` is the element being dragged: it is sized but left where the pointer has it.
   */
  function layout(src, first, skip) {
    W = board.clientWidth || 0;
    if (!W) return null;
    stacked = W < stackBelow;
    board.classList.toggle('is-stacked', stacked);
    const els = items();
    if (stacked) {
      for (const el of els) { el.style.left = el.style.top = el.style.width = el.style.minHeight = ''; }
      board.style.height = '';
      current = {};
      return null;
    }
    const lo = Math.min(minW, W);
    const info = els.map((el) => {
      const k = keyOf(el), s = src[k];
      const w = Math.round(clamp(s && s.w ? s.w : defaultW(el), lo, W));
      const h = s && s.h ? Math.max(minH, s.h) : 0;
      el.style.width = w + 'px';
      el.style.minHeight = h ? h + 'px' : '';
      return { el, k, s, w, h };
    });
    for (const it of info) it.hh = it.el.offsetHeight || it.h || minH; // one reflow for all
    const placed = [], out = {};
    const pinned = info.filter((it) => it.s && it.s.x != null && it.s.y != null)
      .sort((a, b) => (a.k === first ? -1 : b.k === first ? 1 : 0) || a.s.y - b.s.y || a.s.x - b.s.x);
    for (const it of pinned) {
      const r = { x: clamp(it.s.x, 0, W - it.w), y: Math.max(0, it.s.y), w: it.w, hh: it.hh };
      for (let guard = 0; guard < 200; guard++) {
        const hits = placed.filter((p) => overlap(p, r));
        if (!hits.length) break;
        r.y = Math.max.apply(null, hits.map((p) => p.y + p.hh + gap));
      }
      placed.push(r); out[it.k] = Object.assign(r, { h: it.h });
    }
    for (const it of info) if (!out[it.k]) { const r = findSpot(placed, it.w, it.hh); placed.push(r); out[it.k] = Object.assign(r, { h: it.h }); }
    let bottom = 0;
    for (const it of info) {
      const r = out[it.k];
      if (it.el !== skip) { it.el.style.left = r.x + 'px'; it.el.style.top = r.y + 'px'; }
      bottom = Math.max(bottom, r.y + r.hh);
    }
    board.style.height = (bottom + (drag && drag.active ? 160 : 0)) + 'px';
    current = out;
    return out;
  }

  const snapshot = (rects) => {
    const o = {};
    for (const k of Object.keys(rects)) o[k] = { x: Math.round(rects[k].x), y: Math.round(rects[k].y), w: Math.round(rects[k].w), h: rects[k].h || 0 };
    return o;
  };
  const readingOrder = (rects) => Object.keys(rects).sort((a, b) => rects[a].y - rects[b].y || rects[a].x - rects[b].x);
  function commit(rects) {
    saved = Object.assign({}, saved, snapshot(rects));
    if (opts.save) opts.save(saved, readingOrder(rects));
  }

  // Snap to the 8px grid, or to an edge of another block when one is close
  function magnet(k, x, y, w) {
    const near = (v, cands) => { let best = null; for (const c of cands) if (Math.abs(c - v) <= 10 && (best == null || Math.abs(c - v) < Math.abs(best - v))) best = c; return best; };
    const others = Object.keys(drag.base).filter((o) => o !== k).map((o) => drag.base[o]);
    const xs = [0, W - w].concat(others.map((o) => o.x), others.map((o) => o.x + o.w + gap), others.map((o) => o.x + o.w - w), others.map((o) => o.x - gap - w));
    const ys = [0].concat(others.map((o) => o.y), others.map((o) => o.y + o.hh + gap));
    const nx = near(x, xs), ny = near(y, ys);
    return { x: clamp(nx != null ? nx : rnd(x), 0, Math.max(0, W - w)), y: Math.max(0, ny != null ? ny : rnd(y)) };
  }

  const scroller = () => { for (let n = board.parentElement; n; n = n.parentElement) { const s = win.getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n; } return doc.scrollingElement; };
  const placeGhost = (r) => {
    if (!ghost) { ghost = doc.createElement('div'); ghost.className = 'hd-ghost'; board.appendChild(ghost); }
    ghost.style.left = r.x + 'px'; ghost.style.top = r.y + 'px'; ghost.style.width = r.w + 'px'; ghost.style.height = r.hh + 'px';
  };
  const cleanup = () => {
    doc.removeEventListener('pointermove', onMove, true);
    doc.removeEventListener('pointerup', onUp, true);
    doc.removeEventListener('pointercancel', onCancel, true);
    board.removeEventListener('touchmove', blockTouch);
    if (drag && drag.timer) win.clearTimeout(drag.timer);
  };
  const blockTouch = (e) => { if (drag && drag.active) e.preventDefault(); };
  const begin = () => {
    if (!drag || drag.active) return;
    drag.active = true;
    drag.base = snapshot(current);
    for (const k of Object.keys(current)) drag.base[k].hh = current[k].hh;
    drag.start = Object.assign({}, current[drag.key]);
    drag.item.classList.add(drag.mode === 'resize' ? 'is-resizing' : 'is-moving');
    board.classList.add('is-arranging');
    doc.body.classList.add('hd-no-select');
    try { drag.item.setPointerCapture(drag.pointerId); } catch (e) { /* not supported */ }
    if (drag.touch && win.navigator && win.navigator.vibrate) { try { win.navigator.vibrate(15); } catch (e) { /* ignore */ } }
    placeGhost(current[drag.key]);
  };
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.active) {
      if (drag.touch) { if (Math.hypot(dx, dy) > 10) { cleanup(); drag = null; } return; }
      if (Math.hypot(dx, dy) < 5) return;
      begin();
    }
    e.preventDefault();
    const sc = drag.scroller;
    if (sc) { // scroll when dragging near the top or bottom edge
      const sr = sc === doc.scrollingElement ? { top: 0, bottom: win.innerHeight } : sc.getBoundingClientRect();
      if (e.clientY > sr.bottom - 40) sc.scrollTop += 14; else if (e.clientY < sr.top + 40) sc.scrollTop -= 14;
    }
    const br = board.getBoundingClientRect();
    const k = drag.key, s = drag.start;
    const src = Object.assign({}, drag.base);
    if (drag.mode === 'move') {
      const rawX = e.clientX - br.left - drag.offX, rawY = e.clientY - br.top - drag.offY;
      const p = magnet(k, rawX, rawY, s.w);
      src[k] = { x: p.x, y: p.y, w: s.w, h: s.h };
      drag.item.style.left = clamp(rawX, -20, W - s.w + 20) + 'px';
      drag.item.style.top = Math.max(-20, rawY) + 'px';
      const out = layout(src, k, drag.item);
      if (out) placeGhost(out[k]);
    } else {
      const right = e.clientX - br.left + drag.offR, bottom = e.clientY - br.top + drag.offB;
      const w = clamp(rnd(right - s.x), Math.min(minW, W), W - s.x);
      const h = Math.max(minH, rnd(bottom - s.y));
      src[k] = { x: s.x, y: s.y, w, h };
      const out = layout(src, k);
      if (out) { placeGhost(out[k]); drag.item.style.minHeight = h + 'px'; }
    }
    drag.src = src;
  }
  function finish(ok) {
    const d = drag;
    cleanup();
    drag = null;
    if (!d || !d.active) return;
    d.item.classList.remove('is-moving', 'is-resizing');
    board.classList.remove('is-arranging');
    doc.body.classList.remove('hd-no-select');
    if (ghost) { ghost.remove(); ghost = null; }
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    board.addEventListener('click', stop, true);
    win.setTimeout(() => board.removeEventListener('click', stop, true), 0);
    if (ok && d.src) {
      // a resized block keeps the height the user chose only if it is taller than its content
      const out = layout(d.src, d.key);
      if (out) commit(out);
    } else layout(saved);
  }
  function onUp(e) { if (drag && e.pointerId === drag.pointerId) finish(true); }
  function onCancel(e) { if (drag && e.pointerId === drag.pointerId) finish(false); }
  board.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag || stacked || !W) return;
    let item = e.target;
    while (item && item !== board && !(item.classList && item.classList.contains(opts.itemClass))) item = item.parentElement;
    if (!item || item === board || item.parentElement !== board) return;
    const resize = !!(e.target.classList && e.target.classList.contains('hd-resize'));
    if (!resize && isControl(e.target, item)) return;
    const k = keyOf(item), r = current[k];
    if (!r) return;
    const br = board.getBoundingClientRect();
    drag = {
      item, key: k, mode: resize ? 'resize' : 'move', x: e.clientX, y: e.clientY, pointerId: e.pointerId,
      touch: e.pointerType === 'touch' && !resize, active: false, timer: null, scroller: scroller(),
      offX: e.clientX - br.left - r.x, offY: e.clientY - br.top - r.y,
      offR: r.x + r.w - (e.clientX - br.left), offB: r.y + r.hh - (e.clientY - br.top),
    };
    if (resize) e.preventDefault();
    if (drag.touch) {
      drag.timer = win.setTimeout(begin, 350);
      board.addEventListener('touchmove', blockTouch, { passive: false });
    }
    doc.addEventListener('pointermove', onMove, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onCancel, true);
  });
  board.addEventListener('dragstart', (e) => { if (drag) e.preventDefault(); });

  // Re-lay out when the pane width or a block's content height changes
  let frame = 0;
  const schedule = () => {
    if (frame || drag) return;
    const raf = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : (f) => win.setTimeout(f, 16);
    frame = raf(() => { frame = 0; if (board.isConnected === false) { if (ro) ro.disconnect(); return; } if (!drag) layout(saved); });
  };
  const ro = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(schedule) : null;
  if (ro) { ro.observe(board); for (const el of items()) ro.observe(el); }
  layout(saved);
  if (!W) schedule();

  return {
    relayout: () => layout(saved),
    /** Pack every block neatly in reading order, keeping sizes */
    tidy() {
      if (!W || stacked) return;
      const order = readingOrder(current);
      const src = {};
      for (const k of order) src[k] = { w: current[k].w, h: current[k].h };
      saved = {};
      const els = items();
      els.sort((a, b) => order.indexOf(keyOf(a)) - order.indexOf(keyOf(b)));
      for (const el of els) board.appendChild(el); // findSpot packs in DOM order
      if (ghost) board.appendChild(ghost);
      const out = layout(src);
      if (out) commit(out);
    },
    /** Forget positions and sizes; blocks go back to columns in the saved order */
    reset() {
      saved = {};
      if (opts.save) opts.save({}, null);
      layout(saved);
    },
  };
}
/* freeboard:end */

/* Wraps a tracker plugin class so it runs inside Health Dashboard and stores its settings here. */
function makeModule(Base, host, key) {
  class Hosted extends Base {
    onload() { this.ready = super.onload(); return this.ready; }
    // Only the Health dashboard keeps a ribbon icon; each tracker opens from its tab or command
    addRibbonIcon() { return document.createElement('div'); }
    async loadData() { return host.getModuleData(key); }
    async saveData(d) { await host.setModuleData(key, d); }
  }
  return Hosted;
}

/* ------------------------------------------------------------------ */
/* Combined renderer (used by the view and the code block)             */
/* ------------------------------------------------------------------ */
class HubRenderer {
  constructor(host, el, opts = {}) {
    this.host = host;
    this.el = el;
    this.scrollEl = opts.scrollEl || null;
    this.tab = opts.tab || host.initialTab();
    this.monthOffset = 0;
    this.periodRenderer = null;
    this.migraineEmbed = null;
  }

  setTab(id) {
    if (this.tab === id) return;
    this.tab = id;
    if (this.scrollEl) this.scrollEl.scrollTop = 0;
    this.host.rememberTab(id);
    this.render(true);
  }

  render(keepScrollTop) {
    const el = this.el, host = this.host;
    const top = this.scrollEl ? this.scrollEl.scrollTop : 0;
    el.empty();
    el.addClass('hd-root');

    const bar = el.createDiv({ cls: 'hd-topbar' });
    const title = bar.createDiv({ cls: 'hd-title' });
    setIcon(title.createSpan({ cls: 'hd-title-icon' }), 'heart-pulse');
    title.createEl('h2', { text: 'Health dashboard' });
    const tabRow = bar.createDiv({ cls: 'hd-tabrow' });
    const tabs = tabRow.createDiv({ cls: 'hd-tabs', attr: { role: 'tablist' } });
    if (!host.tabVisible(this.tab)) this.tab = 'overview';
    for (const t of host.orderedTabs()) {
      const movable = t.id !== 'overview';
      const b = tabs.createEl('button', { cls: 'hd-tab' + (movable ? ' hd-tab-sortable' : '') + (t.id === this.tab ? ' is-active' : ''), attr: { role: 'tab', 'aria-selected': String(t.id === this.tab), 'data-key': t.id } });
      if (movable) b.setAttr('title', 'Click to open · drag to reorder');
      setIcon(b.createSpan({ cls: 'hd-btn-icon' }), t.icon);
      b.createSpan({ text: t.label });
      b.onclick = () => this.setTab(t.id);
    }
    makeSortable(tabs, { itemClass: 'hd-tab-sortable', horizontal: true, onSort: (keys) => host.setVisibleOrder('tabOrder', keys) });
    // The Overview's PDF button sits in the same row as the tabs
    if (this.tab === 'overview') hubButton(tabRow, 'file-text', 'Health report (PDF)', () => host.openHealthReport()).addClass('hd-report-btn');
    const help = title.createEl('button', { cls: 'clickable-icon hd-help-btn', attr: { 'aria-label': 'About this dashboard: what it shows, how it’s calculated, and sources' } });
    setIcon(help, 'help-circle');
    help.onclick = () => new HelpModal(host, this.tab).open();

    const panel = el.createDiv({ cls: 'hd-panel hd-panel-' + this.tab });
    try {
      if (this.tab === 'period') this.renderPeriod(panel);
      else if (this.tab === 'migraine') this.renderMigraine(panel);
      else if (this.tab === 'visits') this.renderVisits(panel);
      else if (GENERIC_TABS[this.tab]) this.renderGeneric(panel, this.tab);
      else this.renderOverview(panel);
    } catch (e) {
      console.error('Health dashboard render failed', e);
      panel.createDiv({ cls: 'hd-card hd-muted', text: 'Something went wrong drawing this view. Details are in the developer console.' });
    }
    try { normalizeHeader(panel); addExpanders(panel, host.app); } catch (e) { console.error('Health Dashboard: chart expand buttons failed', e); }
    if (this.scrollEl && !keepScrollTop) this.scrollEl.scrollTop = top;
  }

  unavailable(panel, name, pluginId, key) {
    const box = panel.createDiv({ cls: 'hd-card hd-unavailable' });
    box.createEl('h3', { text: name + ' is turned off here' });
    box.createEl('p', {
      text: this.host.isActive(key) ? host_conflictText(name, pluginId) : 'Turn it on in Settings → Health Dashboard → Dashboards.',
    });
  }

  renderPeriod(panel) {
    const per = this.host.period;
    if (!per) return this.unavailable(panel, 'Period tracking', 'period-tracker', 'period');
    if (!this.periodRenderer || this.periodRenderer.plugin !== per) this.periodRenderer = new P.DashboardRenderer(per, panel);
    this.periodRenderer.el = panel;
    this.periodRenderer.render();
  }

  renderMigraine(panel) {
    const mig = this.host.migraine;
    if (!mig) return this.unavailable(panel, 'Migraine tracking', 'migraine-tracker', 'migraine');
    if (!this.migraineEmbed || this.migraineEmbed.plugin !== mig) {
      const v = Object.create(M.DashboardView.prototype);
      const now = new Date();
      v.plugin = mig;
      v.app = mig.app;
      v.range = mig.settings.defaultRange || '90';
      v.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      v.showAll = false;
      this.migraineEmbed = v;
    }
    this.migraineEmbed.rootEl = panel;
    this.migraineEmbed.render();
  }

  renderGeneric(panel, key) {
    const mod = this.host[key];
    if (!mod) return this.unavailable(panel, GENERIC_TABS[key], MODULES.find((d) => d.key === key).id, key);
    this.generic = this.generic || {};
    if (!this.generic[key] || this.generic[key].plugin !== mod) this.generic[key] = new mod.cfg.Renderer(mod, panel);
    this.generic[key].el = panel;
    this.generic[key].render();
  }

  renderVisits(panel) {
    const vis = this.host.visits;
    if (!vis) return this.unavailable(panel, 'Doctor visits', 'doctor-visits', 'visits');
    if (!this.visitsRenderer || this.visitsRenderer.plugin !== vis) this.visitsRenderer = new V.VisitsRenderer(vis, panel);
    this.visitsRenderer.el = panel;
    this.visitsRenderer.render();
  }

  /* ---------------- Overview ---------------- */
  renderOverview(panel) {
    const host = this.host, app = host.app;
    const onOv = (k) => host.isActive(k) && host.settings.overview[k];
    this.ov = {};
    for (const k of MODULE_KEYS) this.ov[k] = onOv(k) ? host[k] : null;
    const per = this.ov.period, mig = this.ov.migraine;
    if (host.settings.showDisclaimer !== false) {
      const d = panel.createDiv({ cls: 'hd-disclaimer', attr: { role: 'note' } });
      setIcon(d.createSpan({ cls: 'hd-disclaimer-icon' }), 'info');
      const t = d.createDiv({ cls: 'hd-disclaimer-text' });
      t.createEl('strong', { text: DISCLAIMER_SHORT + ' ' });
      t.appendText(DISCLAIMER);
      const x = d.createEl('button', { cls: 'clickable-icon hd-disclaimer-x', attr: { 'aria-label': 'Hide (you can show it again in settings)' } });
      setIcon(x, 'x');
      x.onclick = async () => { host.settings.showDisclaimer = false; await host.saveHub(); this.render(true); };
    }
    if (!MODULE_KEYS.some(onOv)) {
      const box = panel.createDiv({ cls: 'hd-card hd-unavailable' });
      box.createEl('h3', { text: 'Nothing to show on the Overview' });
      box.createEl('p', { text: 'Choose which dashboards appear here in Settings → Health Dashboard → Overview.' });
      return;
    }
    const today = P.todayNum();
    const now = new Date();
    const a = per ? per.getAnalysis() : null;
    const eps = mig ? mig.getEpisodes() : [];

    const vis = this.ov.visits;
    const actions = panel.createDiv({ cls: 'hd-actions' });
    const quick = {
      period: () => {
        hubButton(actions, 'plus', 'Log period day', () => new P.LogModal(app, per, today).open(), true);
        hubButton(actions, 'droplet', 'Period started', () => per.quickStart(), true);
      },
      migraine: () => hubButton(actions, 'brain', 'Log migraine', () => new M.EpisodeModal(mig).open(), true),
      visits: () => hubButton(actions, 'stethoscope', 'Log doctor visit', () => new V.VisitModal(vis).open(), true),
      bp: () => hubButton(actions, 'activity', 'Log blood pressure', () => new B.ReadingModal(this.ov.bp).open(), true),
      illness: () => hubButton(actions, 'thermometer', 'Log sickness', () => new I.IllnessModal(this.ov.illness).open(), true),
      a1c: () => hubButton(actions, 'test-tube', 'Log A1C', () => new A.ResultModal(this.ov.a1c).open(), true),
    };
    for (const k of host.settings.overviewOrder) if (this.ov[k] && quick[k]) quick[k]();

    for (const ep of eps.filter((e) => !e.end)) {
      const b = panel.createDiv({ cls: 'hd-banner' });
      setIcon(b.createSpan({ cls: 'hd-btn-icon' }), 'alarm-clock');
      b.createSpan({ text: 'Migraine in progress since ' + M.fmtDate(ep.start) + ' (day ' + M.spanDays(ep.start, now) + ').' });
      b.createDiv({ cls: 'hd-spacer' });
      b.createEl('button', { text: 'End now', cls: 'mod-cta' }).onclick = () => mig.endEpisode(ep);
      b.createEl('button', { text: 'Edit' }).onclick = () => new M.EpisodeModal(mig, ep).open();
    }

    // One board: summary cards, the calendar and the cycle chart, all draggable into one saved order
    const tools = host.settings.overviewLayoutMode === 'grid' ? null : panel.createDiv({ cls: 'hd-board-tools' });
    const board = panel.createDiv({ cls: 'hd-board' });
    const visits = vis ? vis.getVisits() : [];
    const blocks = {
      period: () => this.periodSummary(board, a), migraine: () => this.migraineSummary(board, eps, now), visits: () => this.visitsSummary(board, visits),
      bp: () => this.bpSummary(board), illness: () => this.illnessSummary(board), meds: () => this.medsSummary(board), a1c: () => this.a1cSummary(board),
      calendar: () => this.renderCalendar(board, a, eps, now, today, visits),
      cycle: () => this.renderCycleLink(board, a, eps),
      notes: () => host.renderNotes(board, 'general', { key: 'notes', cls: 'hd-card hd-sortable hd-span2' }),
    };
    const shown = {
      calendar: !!(per || mig || vis || this.ov.illness),
      cycle: !!(host.settings.showCycleLink && per && mig),
      notes: true,
    };
    for (const k of host.settings.overviewOrder) if ((MODULE_KEYS.includes(k) ? onOv(k) : shown[k]) && blocks[k]) blocks[k]();
    if (host.settings.overviewLayoutMode === 'grid') {
      makeSortable(board, { itemClass: 'hd-sortable', onSort: (keys) => host.setVisibleOrder('overviewOrder', keys) });
      return;
    }
    // Free layout: every block has its own pixel position and size
    const fb = freeBoard(board, {
      itemClass: 'hd-sortable',
      load: () => host.settings.overviewLayout,
      save: (layout, order) => {
        host.settings.overviewLayout = layout;
        if (order) host.setVisibleOrder('overviewOrder', order, false); // quick-log buttons and narrow screens follow the reading order
        else host.saveHub();
      },
    });
    // Narrow screens stack the blocks; there they can still be dragged into a new order
    makeSortable(board, { itemClass: 'hd-sortable', enabled: () => board.classList.contains('is-stacked'), onSort: (keys) => host.setVisibleOrder('overviewOrder', keys) });
    tools.createDiv({ cls: 'hd-board-hint', text: 'Drag blocks anywhere \u00b7 drag a corner to resize' });
    hubButton(tools, 'layout-grid', 'Tidy up', () => fb.tidy()).addClass('hd-small-btn');
    hubButton(tools, 'rotate-ccw', 'Reset layout', () => fb.reset()).addClass('hd-small-btn');
  }

  summaryCard(parent, cls, icon, title, tab) {
    const card = parent.createDiv({ cls: 'hd-card hd-sum hd-sortable ' + cls, attr: { 'data-key': tab } });
    const head = card.createDiv({ cls: 'hd-sum-head' });
    setIcon(head.createSpan({ cls: 'hd-grip', attr: { title: 'Drag to reorder', 'aria-hidden': 'true' } }), 'grip-vertical');
    setIcon(head.createSpan({ cls: 'hd-sum-icon' }), icon);
    head.createEl('h3', { text: title });
    head.createDiv({ cls: 'hd-spacer' });
    const open = head.createEl('button', { cls: 'hd-link', text: 'Open dashboard →' });
    open.onclick = () => this.setTab(tab);
    const stats = card.createDiv({ cls: 'hd-stats' });
    const stat = (label, value, sub, mod) => {
      const s = stats.createDiv({ cls: 'hd-stat' + (mod ? ' ' + mod : '') });
      s.createDiv({ cls: 'hd-stat-label', text: label });
      s.createDiv({ cls: 'hd-stat-value', text: value });
      if (sub) s.createDiv({ cls: 'hd-stat-sub', text: sub });
    };
    return { card, stat };
  }

  periodSummary(parent, a) {
    const per = this.ov.period;
    const { card, stat } = this.summaryCard(parent, 'is-period', 'droplet', 'Period', 'period');
    if (!per) { card.createEl('p', { cls: 'hd-muted', text: host_conflictText('Period tracking', 'period-tracker') }); return; }
    if (!a.last) { stat('Today', '–', 'Log a period to begin'); return; }
    if (a.ongoing) stat('Today', 'Period day ' + (a.today - a.last.start + 1), 'Started ' + P.fmtShort(a.last.start), 'is-accent');
    else stat('Today', a.cycleDay ? 'Cycle day ' + a.cycleDay : '–', 'Last period ' + P.fmtShort(a.last.start));
    if (per.settings.showPredictions) {
      const next = a.ongoing ? a.futureStarts[0] : a.nextStart;
      const du = next - a.today;
      const est = a.cycleEstimated ? ' · 28-day default' : '';
      if (du > 0) stat('Next period', 'in ' + P.plural(du, 'day'), P.fmtDate(next) + est);
      else if (du === 0) stat('Next period', 'Expected today', P.fmtDate(next) + est);
      else stat('Next period', P.plural(-du, 'day') + ' late', 'Expected ' + P.fmtDate(next) + est, 'is-warn');
    }
    stat('Average cycle', a.avgCycle ? (Math.round(a.avgCycle * 10) / 10) + ' days' : '–', a.recent.length ? 'Last ' + P.plural(a.recent.length, 'cycle') : 'Needs 2 periods');
  }

  migraineSummary(parent, eps, now) {
    const mig = this.ov.migraine;
    const { card, stat } = this.summaryCard(parent, 'is-migraine', 'brain', 'Migraine', 'migraine');
    if (!mig) { card.createEl('p', { cls: 'hd-muted', text: host_conflictText('Migraine tracking', 'migraine-tracker') }); return; }
    if (!eps.length) { stat('Last 30 days', '–', 'No migraines logged yet'); return; }
    const st = M.computeStats(eps, '30', now, mig.settings);
    stat('Last 30 days', P.plural(st.migraineDays, 'migraine day'), P.plural(st.count, 'episode'));
    if (st.ongoing.length) {
      const ep = st.ongoing.slice().sort((x, y) => y.start - x.start)[0];
      stat('Current', 'Ongoing', 'Day ' + M.spanDays(ep.start, now), 'is-accent');
    } else stat('Since last migraine', st.daysSince == null ? '–' : P.plural(st.daysSince, 'day'), '');
    stat('Acute-medication days', String(st.medDays30), 'Last 30 days · alert at ' + mig.settings.overuseThreshold, st.overuse ? 'is-warn' : '');
  }

  visitsSummary(parent, visits) {
    const vis = this.ov.visits;
    const { card, stat } = this.summaryCard(parent, 'is-visits', 'stethoscope', 'Doctor visits', 'visits');
    if (!vis) { card.createEl('p', { cls: 'hd-muted', text: 'Doctor visits are not available.' }); return; }
    if (!visits.length) { stat('Next visit', 'None booked', 'Log a visit to begin'); return; }
    const tk = V.todayKey();
    const sorted = visits.slice().sort(V.sortAsc);
    const next = sorted.find((v) => V.isUpcoming(v, tk));
    const last = sorted.filter((v) => !V.isUpcoming(v, tk)).pop();
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    stat('Next visit', next ? cap(V.relDays(next.date, tk)) : 'None booked', next ? V.fmtKey(next.date) + ' · ' + V.who(next) : '', next ? 'is-accent' : '');
    stat('Last visit', last ? cap(V.relDays(last.date, tk)) : '–', last ? V.fmtKey(last.date) + ' · ' + V.who(last) : '');
    const due = V.followUpsDue(visits, tk);
    const overdue = due.filter((v) => v.followUp < tk).length;
    stat('Follow-ups to book', String(due.length), overdue ? overdue + ' overdue' : due.length ? 'By ' + V.fmtKey(due[0].followUp) : 'Nothing pending', overdue ? 'is-warn' : '');
  }

  bpSummary(parent) {
    const bp = this.ov.bp;
    const { card, stat } = this.summaryCard(parent, 'is-bp', 'activity', 'Blood pressure', 'bp');
    if (!bp) { card.createEl('p', { cls: 'hd-muted', text: host_conflictText('Blood pressure', 'blood-pressure') }); return; }
    const all = bp.getRecords().slice().sort(B.sortAsc);
    if (!all.length) { stat('Latest', '–', 'Log a reading to begin'); return; }
    const tk = V.todayKey(), last = all[all.length - 1], c = bp.classify(last);
    stat('Latest', B.fmtBP(last), c.label + ' · ' + V.relDays(last.date, tk), c.level >= 3 ? 'is-warn' : 'is-accent');
    const st7 = bp.stats(KitModule.addDaysKey(tk, -6), tk);
    stat('7-day average', st7.avg ? B.fmtBP(st7.avg) : '–', st7.avg ? P.plural(st7.n, 'reading') + ' · ' + bp.classify(st7.avg).label : 'No readings this week');
    const st30 = bp.stats(KitModule.addDaysKey(tk, -29), tk);
    stat('Last 30 days', P.plural(st30.n, 'reading'), st30.n ? Math.round((100 * st30.atTarget) / st30.n) + '% below ' + st30.target.join('/') : '');
  }

  illnessSummary(parent) {
    const il = this.ov.illness;
    const { card, stat } = this.summaryCard(parent, 'is-illness', 'thermometer', 'Sickness', 'illness');
    if (!il) { card.createEl('p', { cls: 'hd-muted', text: host_conflictText('Sickness tracking', 'sickness-tracker') }); return; }
    const tk = V.todayKey();
    const recs = il.getRecords();
    const on = il.ongoing()[0];
    if (on) stat('Right now', 'Sick · day ' + I.lengthDays(on, tk), on.type || '', 'is-warn');
    else {
      const last = recs.filter((r) => r.kind === 'illness' && r.end).sort((a, b) => a.end.localeCompare(b.end)).pop();
      stat('Right now', 'Well', last ? P.plural(KitModule.daysBetween(last.end, tk), 'day') + ' since last sickness' : 'No sickness logged');
    }
    const st = il.stats(KitModule.addDaysKey(tk, -364), tk);
    stat('Sick days · 12 months', String(st.sickDays), P.plural(st.count, 'time') + ' sick');
    stat('Most common · 12 months', st.types.length ? st.types[0][0] : '–', st.types.length ? P.plural(st.types[0][1], 'time') : 'Nothing logged');
  }

  medsSummary(parent) {
    const md = this.ov.meds;
    const { card, stat } = this.summaryCard(parent, 'is-meds', 'pill', 'Medications', 'meds');
    if (!md) { card.createEl('p', { cls: 'hd-muted', text: host_conflictText('Medications', 'medication-list') }); return; }
    const cur = md.current();
    if (!md.getRecords().length) { stat('Taking now', '–', 'Add your medications'); return; }
    const prn = cur.filter((m) => m.schedule === 'As needed').length;
    stat('Taking now', String(cur.length), (cur.length - prn) + ' scheduled · ' + prn + ' as needed');
    const due = md.refillsDue();
    const tk = V.todayKey();
    stat('Refills due', String(due.length), due.length ? D.title(due[0]) + ' ' + V.relDays(due[0].refill, tk) : 'Nothing due soon', due.some((m) => m.refill < tk) ? 'is-warn' : '');
    const ch = md.changesBetween(KitModule.addDaysKey(tk, -90), tk);
    stat('Changes · 90 days', String(ch.started.length + ch.stopped.length), ch.started.length + ' started · ' + ch.stopped.length + ' stopped');
  }

  a1cSummary(parent) {
    const a1 = this.ov.a1c;
    const { card, stat } = this.summaryCard(parent, 'is-a1c', 'test-tube', 'A1C', 'a1c');
    if (!a1) { card.createEl('p', { cls: 'hd-muted', text: host_conflictText('A1C', 'a1c-tracker') }); return; }
    const st = a1.stats();
    if (!st.latest) { stat('Latest', '–', 'Log a result to begin'); return; }
    const tk = V.todayKey(), c = A.classify(st.latest.pct);
    stat('Latest', a1.fmt(st.latest.pct), c.label + ' · ' + V.fmtKey(st.latest.date), c.level >= 3 ? 'is-warn' : 'is-accent');
    stat('Change', st.change == null ? '–' : (st.change > 0 ? '+' : '') + st.change.toFixed(1), st.prev ? 'since ' + V.fmtKey(st.prev.date) : 'Needs two results', st.change > 0 ? 'is-warn' : '');
    stat('Next test', !st.nextDue ? '–' : st.nextDue < tk ? 'Overdue' : V.relDays(st.nextDue, tk).replace(/^./, (x) => x.toUpperCase()), st.nextDue ? (st.nextDue < tk ? 'Was due ' : '') + V.fmtKey(st.nextDue) : '', st.nextDue && st.nextDue <= tk ? 'is-warn' : '');
  }

  /* Calendar with periods, migraines and doctor visits */
  renderCalendar(grid, a, eps, now, today, visits) {
    const host = this.host, per = this.ov.period, mig = this.ov.migraine, app = host.app;
    const box = grid.createDiv({ cls: 'hd-card hd-calendar hd-sortable hd-span2' + (host.settings.calendarWide ? ' is-wide' : ''), attr: { 'data-key': 'calendar' } });
    const base = new Date(Date.UTC(new Date(today * 86400000).getUTCFullYear(), new Date(today * 86400000).getUTCMonth() + this.monthOffset, 1));
    const y = base.getUTCFullYear(), m = base.getUTCMonth();

    const nav = box.createDiv({ cls: 'hd-cal-nav' });
    setIcon(nav.createSpan({ cls: 'hd-grip', attr: { title: 'Drag to move the calendar', 'aria-hidden': 'true' } }), 'grip-vertical');
    const prev = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Previous month' } });
    setIcon(prev, 'chevron-left');
    prev.onclick = () => { this.monthOffset--; this.render(); };
    nav.createDiv({ cls: 'hd-cal-title', text: base.toLocaleString('en', { month: 'long', timeZone: 'UTC' }) + ' ' + y });
    const todayBtn = nav.createEl('button', { cls: 'hd-small-btn', text: 'Today' });
    todayBtn.onclick = () => { this.monthOffset = 0; this.render(); };
    const next = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Next month' } });
    setIcon(next, 'chevron-right');
    next.onclick = () => { this.monthOffset++; this.render(); };
    const wide = nav.createEl('button', { cls: 'clickable-icon hd-cal-wide', attr: { 'aria-label': host.settings.calendarWide ? 'Half width' : 'Full width' } });
    setIcon(wide, host.settings.calendarWide ? 'minimize-2' : 'maximize-2');
    wide.onclick = async () => { host.setCalendarWide(!host.settings.calendarWide); await host.saveHub(); this.render(); };

    // day number -> migraine episodes touching it
    const migDays = new Map();
    for (const ep of eps) for (const k of M.episodeDayKeys(ep, now)) {
      const d = P.toDayNum(k);
      if (!migDays.has(d)) migDays.set(d, []);
      migDays.get(d).push(ep);
    }
    const painMax = M.getPainMax();
    const sickDays = new Map();
    if (this.ov.illness) {
      for (const x of this.ov.illness.getRecords().filter((r) => r.kind === 'illness')) {
        for (const k of I.episodeDays(x, V.todayKey())) { const dn = P.toDayNum(k); if (!sickDays.has(dn)) sickDays.set(dn, []); sickDays.get(dn).push(x); }
      }
    }
    const visDays = new Map();
    for (const v of visits || []) {
      const d = P.toDayNum(v.date);
      if (!visDays.has(d)) visDays.set(d, []);
      visDays.get(d).push(v);
    }
    const monday = per ? per.settings.weekStartsMonday : (mig && mig.settings.weekStart === 'monday');

    const cal = box.createDiv({ cls: 'hd-cal-grid' });
    const names = monday ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    for (const nm of names) cal.createDiv({ cls: 'hd-cal-head', text: nm });
    const first = Math.floor(Date.UTC(y, m, 1) / 86400000);
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const dow = new Date(first * 86400000).getUTCDay();
    const lead = monday ? (dow + 6) % 7 : dow;
    for (let i = 0; i < lead; i++) cal.createDiv({ cls: 'hd-cal-day is-blank' });

    let nPeriod = 0, nMig = 0, nVis = 0, nSick = 0;
    for (let i = 0; i < dim; i++) {
      const d = first + i;
      const cell = cal.createEl('button', { cls: 'hd-cal-day' });
      cell.createSpan({ cls: 'hd-cal-num', text: String(i + 1) });
      const tip = [P.fmtDate(d)];
      const e = a && a.byDay.get(d);
      if (e && e.flow !== 'none') {
        cell.addClass('hd-flow-' + e.flow);
        tip.push('Flow: ' + P.FLOW_LABEL[e.flow]);
        if (e.flow !== 'spotting') nPeriod++;
      } else if (a && per.settings.showPredictions && a.predicted.has(d)) {
        cell.addClass('is-predicted');
        tip.push('Predicted period');
      }
      const dayEps = migDays.get(d) || [];
      if (dayEps.length) {
        nMig++;
        const peak = Math.max(...dayEps.map((x) => x.painMax || 0));
        const mark = cell.createSpan({ cls: 'hd-mig-mark' });
        const t = peak ? peak / painMax : 0.5;
        mark.style.opacity = String(0.35 + 0.65 * t);
        for (const x of dayEps) tip.push((x.type || 'Migraine') + ' · peak ' + (x.painMax == null ? '?' : x.painMax) + '/' + painMax);
      }
      const daySick = sickDays.get(d) || [];
      if (daySick.length) {
        nSick++;
        cell.createSpan({ cls: 'hd-sick-mark' });
        for (const x of daySick) tip.push('Sick: ' + (x.type || 'unwell') + (x.severity ? ' (' + x.severity.toLowerCase() + ')' : ''));
      }
      const dayVisits = visDays.get(d) || [];
      if (dayVisits.length) {
        nVis++;
        cell.createSpan({ cls: 'hd-visit-dot' });
        for (const v of dayVisits) tip.push('Doctor visit: ' + V.who(v) + (v.time ? ' at ' + v.time : '') + (v.reason ? ' · ' + v.reason : ''));
      }
      if (d === today) cell.addClass('is-today');
      if (d > today) cell.addClass('is-future');
      cell.setAttr('aria-label', tip.join('\n'));
      cell.onclick = (evt) => this.dayMenu(evt, d, e, dayEps, dayVisits, daySick);
    }

    const legend = box.createDiv({ cls: 'hd-legend' });
    const li = (cls, label) => { const x = legend.createSpan({ cls: 'hd-legend-item' }); x.createSpan({ cls: 'hd-swatch ' + cls }); x.createSpan({ text: label }); };
    if (per) { li('hd-flow-light', 'Light'); li('hd-flow-medium', 'Medium'); li('hd-flow-heavy', 'Heavy'); li('hd-flow-spotting', 'Spotting'); }
    if (per && per.settings.showPredictions) li('is-predicted', 'Predicted');
    if (mig) li('hd-swatch-mig', 'Migraine (darker = more pain)');
    if (this.ov.visits) li('hd-swatch-visit', 'Doctor visit');
    if (this.ov.illness) li('hd-swatch-sick', 'Sick');
    const counts = [];
    if (per) counts.push(P.plural(nPeriod, 'period day'));
    if (mig) counts.push(P.plural(nMig, 'migraine day'));
    if (this.ov.visits) counts.push(P.plural(nVis, 'visit'));
    if (this.ov.illness) counts.push(P.plural(nSick, 'sick day'));
    box.createDiv({ cls: 'hd-muted hd-small', text: counts.join(' · ') + ' this month. Click a day to log or edit.' });
  }

  dayMenu(evt, d, entry, dayEps, dayVisits, daySick) {
    const host = this.host, per = this.ov.period, mig = this.ov.migraine;
    const menu = new Menu();
    const label = P.fmtDate(d);
    if (per) {
      menu.addItem((it) => it.setTitle((entry ? 'Edit period log · ' : 'Log period day · ') + label).setIcon('droplet')
        .onClick(() => new P.LogModal(host.app, per, d).open()));
    }
    if (mig) {
      for (const ep of dayEps) {
        menu.addItem((it) => it.setTitle('Edit migraine · ' + M.fmtDate(ep.start) + (ep.type ? ' · ' + ep.type : '')).setIcon('pencil')
          .onClick(() => new M.EpisodeModal(mig, ep).open()));
      }
      menu.addItem((it) => it.setTitle('Log migraine · ' + label).setIcon('brain').onClick(() => {
        const [yy, mm, dd] = P.fromDayNum(d).split('-').map(Number);
        const nowD = new Date();
        const isToday = d === P.todayNum();
        new M.EpisodeModal(mig, null, { date: new Date(yy, mm - 1, dd, isToday ? nowD.getHours() : 9, isToday ? nowD.getMinutes() : 0) }).open();
      }));
    }
    const vis = this.ov.visits;
    if (vis) {
      for (const v of dayVisits || []) {
        menu.addItem((it) => it.setTitle('Edit visit · ' + V.who(v)).setIcon('stethoscope').onClick(() => new V.VisitModal(vis, v).open()));
      }
      menu.addItem((it) => it.setTitle('Log doctor visit · ' + label).setIcon('stethoscope').onClick(() => new V.VisitModal(vis, null, { date: P.fromDayNum(d) }).open()));
    }
    const il = this.ov.illness;
    if (il) {
      for (const x of daySick || []) menu.addItem((it) => it.setTitle('Edit sickness · ' + (x.type || 'from ' + V.fmtKey(x.start))).setIcon('thermometer').onClick(() => new I.IllnessModal(il, x).open()));
      if (!(daySick || []).length) menu.addItem((it) => it.setTitle('Log sickness · ' + label).setIcon('thermometer').onClick(() => new I.IllnessModal(il, null, { date: P.fromDayNum(d) }).open()));
    }
    menu.showAtMouseEvent(evt);
  }

  /* Migraine starts relative to the first day of a period */
  renderCycleLink(grid, a, eps) {
    const box = grid.createDiv({ cls: 'hd-card hd-link-card hd-sortable hd-span2', attr: { 'data-key': 'cycle' } });
    const h4 = box.createEl('h4', { cls: 'hd-block-head' });
    setIcon(h4.createSpan({ cls: 'hd-grip', attr: { title: 'Drag to move this chart', 'aria-hidden': 'true' } }), 'grip-vertical');
    h4.createSpan({ text: 'Migraines and your cycle' });
    if (!this.ov.period || !this.ov.migraine) { box.createEl('p', { cls: 'hd-muted', text: 'Needs both period and migraine tracking.' }); return; }
    const starts = a.periods.map((p) => p.start);
    if (!starts.length || !eps.length) {
      box.createEl('p', { cls: 'hd-muted', text: 'Once you have logged periods and migraines, this shows when migraines tend to start relative to the first day of your period.' });
      return;
    }
    const cd = cycleLinkData(a, eps);
    if (!cd.eligible) {
      box.createEl('p', { cls: 'hd-muted', text: 'None of your migraines fall in the dates covered by your period logs yet.' });
      return;
    }
    const { R, counts, eligible, inWin, outside, covered, hit, cyc } = cd;

    const stats = box.createDiv({ cls: 'hd-stats hd-stats-tight' });
    const pct = cd.pct, chance = cd.chance;
    const s1 = stats.createDiv({ cls: 'hd-stat' });
    s1.createDiv({ cls: 'hd-stat-label', text: 'Started around period day 1' });
    s1.createDiv({ cls: 'hd-stat-value', text: inWin + ' of ' + eligible + ' (' + pct + '%)' });
    s1.createDiv({ cls: 'hd-stat-sub', text: 'About ' + chance + '% expected by chance' });
    if (covered.length) {
      const s2 = stats.createDiv({ cls: 'hd-stat' });
      s2.createDiv({ cls: 'hd-stat-label', text: 'Periods with a migraine nearby' });
      s2.createDiv({ cls: 'hd-stat-value', text: hit + ' of ' + covered.length });
      s2.createDiv({ cls: 'hd-stat-sub', text: '2 days before to 3rd day of bleeding' });
    }

    // Chart: offsets -R..+R, window shaded
    const VW = 600, VH = 210, L = 28, Rt = 8, T = 14, B = 44, cw = VW - L - Rt, ch = VH - T - B;
    const chart = svg('svg', { viewBox: '0 0 ' + VW + ' ' + VH, class: 'hd-chart', role: 'img', 'aria-label': 'Migraine starts by day relative to period start' }, box);
    const maxV = Math.max(2, ...counts);
    const slot = cw / counts.length, bw = Math.max(4, slot * 0.66);
    const X = (i) => L + slot * i;
    const Y = (v) => T + ch - (v / maxV) * ch;
    svg('rect', { x: X(WIN_LO + R), y: T, width: slot * WIN_DAYS, height: ch, class: 'hd-band' }, chart);
    for (let v = 0; v <= maxV; v += Math.max(1, Math.ceil(maxV / 4))) {
      svg('line', { x1: L, x2: L + cw, y1: Y(v), y2: Y(v), class: 'hd-gridline' }, chart);
      svg('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'hd-axis' }, chart).textContent = v;
    }
    counts.forEach((c, i) => {
      const off = i - R;
      const x = X(i) + (slot - bw) / 2;
      if (c) {
        const r = svg('rect', { x, y: Y(c), width: bw, height: T + ch - Y(c), rx: 2, class: 'hd-bar' + (off >= WIN_LO && off <= WIN_HI ? ' is-in' : '') }, chart);
        svg('title', {}, r).textContent = c + ' migraine' + (c === 1 ? '' : 's') + ' starting ' + offLabel(off);
      }
      if (off % 5 === 0 || off === 0) {
        svg('text', { x: X(i) + slot / 2, y: T + ch + 16, 'text-anchor': 'middle', class: 'hd-axis' }, chart).textContent = off === 0 ? 'Day 1' : (off > 0 ? 'Day ' + (off + 1) : off + 'd');
      }
    });
    svg('text', { x: L, y: VH - 4, class: 'hd-axis hd-axis-dir' }, chart).textContent = '← days before period';
    svg('text', { x: L + cw, y: VH - 4, 'text-anchor': 'end', class: 'hd-axis hd-axis-dir' }, chart).textContent = 'period days →';

    const notes = box.createDiv({ cls: 'hd-muted hd-small' });
    notes.createSpan({ text: 'Shaded: 2 days before to the 3rd day of bleeding. ' + (outside ? P.plural(outside, 'migraine') + ' started more than ' + R + ' days from a period start. ' : '') });
    if (cd.pattern) {
      box.createDiv({ cls: 'hd-note', text: 'Migraines started in this window in at least 2 of every 3 cycles. Doctors look for this pattern when considering menstrually related migraine. It is worth mentioning at your next appointment. This is not a diagnosis.' });
    } else {
      notes.createSpan({ text: 'This is a pattern view, not a diagnosis.' });
    }
  }
}

/** Migraine starts relative to period day 1 (ICHD-3 window: day -2 to day +3; day 1 = first day of bleeding, no day 0) */
function cycleLinkData(a, eps) {
  const starts = a && a.periods ? a.periods.map((p) => p.start) : [];
  const R = 10, counts = new Array(2 * R + 1).fill(0);
  const out = { R, counts, eligible: 0, inWin: 0, outside: 0, covered: [], hit: 0, cyc: (a && a.usedCycle) || 28, pct: 0, chance: 0, pattern: false, hasData: !!(starts.length && eps.length) };
  if (!out.hasData) return out;
  const lastStart = starts[starts.length - 1];
  for (const ep of eps) {
    const d = epDay(ep.start);
    if (d < starts[0] - R || d > lastStart + Math.max(out.cyc, 35)) continue; // not covered by period data
    out.eligible++;
    let off = null;
    for (const s of starts) { const o = d - s; if (off == null || Math.abs(o) < Math.abs(off)) off = o; }
    if (off >= WIN_LO && off <= WIN_HI) out.inWin++;
    if (Math.abs(off) <= R) counts[off + R]++; else out.outside++;
  }
  // Periods whose window had a migraine start (only periods since migraine tracking began)
  const firstEp = Math.min(...eps.map((e) => epDay(e.start)));
  const epStarts = eps.map((e) => epDay(e.start));
  out.covered = starts.filter((s) => s + WIN_LO >= firstEp - 30 && s + WIN_HI <= P.todayNum());
  out.hit = out.covered.filter((s) => epStarts.some((d) => d - s >= WIN_LO && d - s <= WIN_HI)).length;
  out.pct = out.eligible ? Math.round((100 * out.inWin) / out.eligible) : 0;
  out.chance = Math.round((100 * WIN_DAYS) / out.cyc);
  out.pattern = out.covered.length >= 3 && out.hit / out.covered.length >= 2 / 3;
  return out;
}

function offLabel(off) {
  if (off === 0) return 'on period day 1';
  if (off > 0) return 'on period day ' + (off + 1);
  return P.plural(-off, 'day') + ' before a period';
}
function host_conflictText(name, pluginId) {
  return name + ' is disabled because the separate "' + pluginId + '" plugin is still turned on. Turn it off in Settings → Community plugins, then turn Health Dashboard off and on again.';
}

/* ------------------------------------------------------------------ */
/* View, code block, settings                                          */
/* ------------------------------------------------------------------ */
class HubView extends ItemView {
  constructor(leaf, host) { super(leaf); this.host = host; }
  getViewType() { return HUB_VIEW; }
  getDisplayText() { return 'Health dashboard'; }
  getIcon() { return 'heart-pulse'; }
  async onOpen() {
    this.renderer = new HubRenderer(this.host, this.contentEl, { scrollEl: this.contentEl });
    this.host.renderers.add(this.renderer);
    this.renderer.render();
  }
  async onClose() { this.host.renderers.delete(this.renderer); }
}

class HubBlock extends MarkdownRenderChild {
  constructor(el, host, tab) { super(el); this.host = host; this.renderer = new HubRenderer(host, el, { tab }); }
  onload() { this.host.renderers.add(this.renderer); this.renderer.render(); }
  onunload() { this.host.renderers.delete(this.renderer); }
}

/* ------------------------------------------------------------------ */
/* Selector (choice list) definitions                                  */
/* ------------------------------------------------------------------ */
// kind: 'list' = frontmatter array, 'single' = frontmatter string, 'med' = migraine medication strings
const SELECTORS = [
  { group: 'period', key: 'symptoms', label: 'Symptoms', fm: 'symptoms', kind: 'list', get: (e) => e.symptoms, ci: true },
  { group: 'period', key: 'medications', label: 'Medications', fm: 'medications', kind: 'list', get: (e) => e.medications, ci: true },
  { group: 'migraine', key: 'types', label: 'Migraine types', fm: 'type', kind: 'single', get: (e) => [e.type] },
  { group: 'migraine', key: 'medications', label: 'Medications', fm: 'medications', kind: 'med', get: (e) => e.medications.map((m) => m.name) },
  { group: 'migraine', key: 'symptoms', label: 'Symptoms', fm: 'symptoms', kind: 'list', get: (e) => e.symptoms },
  { group: 'migraine', key: 'triggers', label: 'Possible causes / triggers', fm: 'triggers', kind: 'list', get: (e) => e.triggers },
  { group: 'migraine', key: 'reliefs', label: 'Relief methods', fm: 'relief', kind: 'list', get: (e) => e.relief },
  { group: 'migraine', key: 'headLocations', label: 'Headache locations', fm: 'head_location', kind: 'list', get: (e) => e.headLocation },
  { group: 'migraine', key: 'attackLocations', label: 'Where attacks happen', fm: 'attack_location', kind: 'single', get: (e) => [e.attackLocation] },
  { group: 'migraine', key: 'timeOfDay', label: 'Time of day it started', fm: 'time_of_day', kind: 'single', get: (e) => [e.timeOfDay] },
  { group: 'migraine', key: 'timeOfDayEnd', label: 'Time of day it ended', fm: 'time_of_day_end', kind: 'single', get: (e) => [e.timeOfDayEnd] },
];
SELECTORS.push(
  { group: 'visits', key: 'doctors', label: 'Doctors and clinicians', fm: 'doctor', kind: 'single', get: (e) => [e.doctor] },
  { group: 'visits', key: 'clinics', label: 'Clinics and practices', fm: 'clinic', kind: 'single', get: (e) => [e.clinic] },
  { group: 'visits', key: 'specialties', label: 'Specialties', fm: 'specialty', kind: 'single', get: (e) => [e.specialty] },
  { group: 'visits', key: 'reasons', label: 'Reasons for visit', fm: 'reason', kind: 'single', get: (e) => [e.reason] },
  { group: 'visits', key: 'visitTypes', label: 'Visit types', fm: 'visit_type', kind: 'single', get: (e) => [e.type] },
  { group: 'visits', key: 'topics', label: 'Related to (topics)', fm: 'related', kind: 'list', get: (e) => e.related },
  { group: 'visits', key: 'tests', label: 'Tests and referrals', fm: 'tests', kind: 'list', get: (e) => e.tests },
);
SELECTORS.push(
  { group: 'bp', key: 'arms', label: 'Arms', fm: 'arm', kind: 'single', get: (e) => [e.arm] },
  { group: 'bp', key: 'positions', label: 'Positions', fm: 'position', kind: 'single', get: (e) => [e.position] },
  { group: 'bp', key: 'contexts', label: 'Circumstances', fm: 'context', kind: 'list', get: (e) => e.context },
  { group: 'bp', key: 'medications', label: 'Blood pressure medications', fm: 'medications', kind: 'list', get: (e) => e.medications },
  { group: 'illness', key: 'types', label: 'Types of sickness', fm: 'type', kind: 'single', get: (e) => [e.type] },
  { group: 'illness', key: 'symptoms', label: 'Symptoms', fm: 'symptoms', kind: 'list', get: (e) => e.symptoms },
  { group: 'illness', key: 'medications', label: 'Medications', fm: ['medications', 'helped'], kind: 'list', get: (e) => e.medications },
  { group: 'illness', key: 'remedies', label: 'Remedies', fm: ['remedies', 'helped'], kind: 'list', get: (e) => e.remedies },
  { group: 'meds', key: 'forms', label: 'Forms', fm: 'form', kind: 'single', get: (e) => [e.form] },
  { group: 'meds', key: 'kinds', label: 'Types', fm: 'kind', kind: 'single', get: (e) => [e.kind] },
  { group: 'meds', key: 'schedules', label: 'How often', fm: 'schedule', kind: 'single', get: (e) => [e.schedule] },
  { group: 'meds', key: 'times', label: 'Times of day', fm: 'times', kind: 'list', get: (e) => e.times },
  { group: 'meds', key: 'purposes', label: 'What it\u2019s for', fm: 'purpose', kind: 'list', get: (e) => e.purposes },
  { group: 'meds', key: 'prescribers', label: 'Prescribers', fm: 'prescriber', kind: 'single', get: (e) => [e.prescriber] },
  { group: 'meds', key: 'pharmacies', label: 'Pharmacies', fm: 'pharmacy', kind: 'single', get: (e) => [e.pharmacy] },
  { group: 'meds', key: 'stopReasons', label: 'Reasons for stopping', fm: 'stop_reason', kind: 'single', get: (e) => [e.stopReason] },
  { group: 'a1c', key: 'testTypes', label: 'Types of test', fm: 'test_type', kind: 'single', get: (e) => [e.testType] },
  { group: 'a1c', key: 'labs', label: 'Labs and clinics', fm: 'lab', kind: 'single', get: (e) => [e.lab] },
);
// Display names with a fixed set of levels (stored values never change, only what you see)
const FLOW_KEYS = ['none', 'spotting', 'light', 'medium', 'heavy'];
const DEFAULT_FLOW_LABELS = Object.assign({}, P.FLOW_LABEL);
const DEFAULT_PAIN_LABELS = P.PAIN_LABELS.slice();
const sameText = (a, b, ci) => (ci ? String(a).toLowerCase() === String(b).toLowerCase() : String(a) === String(b));

function applyPeriodLabels(s) {
  const fl = s.flowLabels || {};
  for (const k of FLOW_KEYS) P.FLOW_LABEL[k] = (fl[k] && String(fl[k]).trim()) || DEFAULT_FLOW_LABELS[k];
  const pl = Array.isArray(s.painLabels) ? s.painLabels : [];
  for (let i = 0; i < DEFAULT_PAIN_LABELS.length; i++) P.PAIN_LABELS[i] = (pl[i] && String(pl[i]).trim()) || DEFAULT_PAIN_LABELS[i];
}

class ConfirmModal extends Modal {
  constructor(app, title, message, yes, no, onChoose) {
    super(app);
    this.t = title; this.m = message; this.yes = yes; this.no = no; this.onChoose = onChoose; this.chosen = false;
  }
  onOpen() {
    this.titleEl.setText(this.t);
    this.contentEl.createEl('p', { text: this.m });
    const row = this.contentEl.createDiv({ cls: 'hd-modal-buttons' });
    const pick = (v) => { this.chosen = true; this.close(); this.onChoose(v); };
    row.createEl('button', { text: this.no }).onclick = () => pick(false);
    row.createEl('button', { text: this.yes, cls: 'mod-cta' }).onclick = () => pick(true);
  }
  onClose() { this.contentEl.empty(); if (!this.chosen) this.onChoose(null); }
}

class HubSettingTab extends PluginSettingTab {
  constructor(app, host) { super(app, host); this.host = host; this.open = new Set(); }
  display() {
    const el = this.containerEl, h = this.host;
    el.empty();
    el.addClass('hd-settings');

    new Setting(el).setName('You').setHeading();
    new Setting(el).setName('Your name').setDesc('Printed on every PDF report for your doctor: period, migraine, blood pressure and A1C reports and the medication list.')
      .addText((t) => {
        t.setPlaceholder('e.g. Anna Jónsdóttir').setValue(h.settings.userName || '').onChange(async (v) => { await h.setUserName(v); });
        t.inputEl.addClass('hd-name-input');
      });

    new Setting(el).setName('Notes and reports folder').setDesc('General notes, records without an exact date and the combined health report are saved here.')
      .addText((t) => t.setPlaceholder('Health Notes').setValue(h.settings.notesFolder || 'Health Notes').onChange(async (v) => { h.settings.notesFolder = v.trim() || 'Health Notes'; await h.saveHub(); }));

    new Setting(el).setName('Dashboards').setHeading();
    el.createEl('p', { cls: 'setting-item-description hd-set-intro', text: 'Turn each tracker on or off. When a tracker is off, its tab, dashboard, commands, ribbon icon, status bar item and settings are hidden. Your notes stay in your vault, and everything comes back when you turn it on again.' });
    const byOrder = (order) => order.map((k) => MODULES.find((d) => d.key === k)).filter(Boolean);
    for (const def of byOrder(h.settings.tabOrder)) {
      const st = new Setting(el).setName(def.label).setDesc(def.desc);
      if (h.isActive(def.key) && !h[def.key]) st.setDesc(def.desc + ' Paused: the separate ' + def.name + ' plugin is still turned on.');
      st.addToggle((t) => t.setValue(h.isActive(def.key)).onChange(async (v) => {
        h.settings.active[def.key] = v;
        await h.saveHub();
        if (v) await h.enableModule(def); else h.disableModule(def);
        this.display();
      }));
    }

    if (h.settings.tabOrder.filter((k) => h.isActive(k)).length > 1) {
      new Setting(el).setName('Tab order').setDesc('Drag the tabs on the Health dashboard to reorder them. Overview is always first.')
        .addButton((b) => b.setButtonText('Reset to default order').onClick(async () => { h.settings.tabOrder = MODULE_KEYS.slice(); await h.saveHub(); h.refreshHub(); }));
    }

    new Setting(el).setName('Overview').setHeading();
    el.createEl('p', { cls: 'setting-item-description hd-set-intro', text: 'Choose which trackers appear on the Overview. To change the order, drag the cards, the calendar and the cycle chart on the Overview itself; the quick log buttons follow the card order.' });
    new Setting(el).setName('Show the disclaimer').setDesc('A short note at the top of the Overview: Health Dashboard is for your own records, not medical advice. PDF reports always include it.')
      .addToggle((t) => t.setValue(h.settings.showDisclaimer !== false).onChange(async (v) => { h.settings.showDisclaimer = v; await h.saveHub(); h.refreshHub(); }));
    const activeOv = h.settings.overviewOrder.filter((k) => h.isActive(k));
    if (!activeOv.length) el.createEl('p', { cls: 'setting-item-description', text: 'Turn on at least one tracker above.' });
    for (const def of byOrder(activeOv)) {
      const st = new Setting(el).setName('Show ' + (/^[A-Z0-9]+$/.test(def.label) ? def.label : def.label.toLowerCase())).setDesc('Summary card, quick log buttons and calendar markings on the Overview.');
      st.addToggle((t) => t.setValue(!!h.settings.overview[def.key]).onChange(async (v) => {
        h.settings.overview[def.key] = v;
        await h.saveHub();
        h.refreshHub();
        this.display();
      }));
    }
    if (activeOv.length > 1) {
      new Setting(el).setName('Overview order').setDesc('Start again from the tab order, or from the default order. The calendar and cycle chart go after the cards.')
        .addButton((b) => b.setButtonText('Use the tab order').onClick(async () => { h.settings.overviewOrder = h.settings.tabOrder.slice(); h.normalizeSettings(); await h.saveHub(); h.refreshHub(); }))
        .addButton((b) => b.setButtonText('Reset to default order').onClick(async () => { h.settings.overviewOrder = OVERVIEW_KEYS.slice(); await h.saveHub(); h.refreshHub(); }));
    }
    if (h.isActive('period') && h.isActive('migraine')) {
      const both = h.settings.overview.period && h.settings.overview.migraine;
      new Setting(el).setName('Show "Migraines and your cycle"')
        .setDesc(both ? 'Chart when migraines start relative to the first day of your period.' : 'Needs both period and migraine tracking shown on the Overview.')
        .addToggle((t) => t.setValue(h.settings.showCycleLink).setDisabled(!both).onChange(async (v) => { h.settings.showCycleLink = v; await h.saveHub(); h.refreshHub(); }));
    }
    new Setting(el).setName('Calendar takes the full width').setDesc('Show the Overview calendar across the whole row, with bigger days. You can also switch this with the button in the calendar\u2019s corner.')
      .addToggle((t) => t.setValue(!!h.settings.calendarWide).onChange(async (v) => { h.setCalendarWide(v); await h.saveHub(); h.refreshHub(); }));
    new Setting(el).setName('Overview layout')
      .setDesc('Free: place and size each block anywhere by dragging it or its corner. Grid: blocks snap into columns and you drag them into an order.')
      .addDropdown((d) => d.addOptions({ free: 'Free (place anywhere)', grid: 'Grid (columns)' }).setValue(h.settings.overviewLayoutMode === 'grid' ? 'grid' : 'free')
        .onChange(async (v) => { h.settings.overviewLayoutMode = v; await h.saveHub(); h.refreshHub(); this.display(); }));
    if (h.settings.overviewLayoutMode !== 'grid') {
      new Setting(el).setName('Reset the Overview layout').setDesc('Forget where you placed and how you sized the blocks, and lay them out in columns again.')
        .addButton((b) => b.setButtonText('Reset layout').onClick(async () => { h.settings.overviewLayout = {}; await h.saveHub(); h.refreshHub(); }));
    }
    const tabOpts = { last: 'Last tab used', overview: 'Overview' };
    for (const t of h.orderedTabs()) if (t.id !== 'overview') tabOpts[t.id] = t.label;
    new Setting(el).setName('Open the dashboard on').setDesc('Which tab the Health dashboard shows when it opens.')
      .addDropdown((d) => d.addOptions(tabOpts)
        .setValue(tabOpts[h.settings.defaultTab] ? h.settings.defaultTab : 'last').onChange(async (v) => { h.settings.defaultTab = v; await h.saveHub(); }));

    this.displayLinkSettings(el);

    new Setting(el).setName('Selectors').setHeading();
    el.createEl('p', { cls: 'setting-item-description hd-set-intro', text: 'The options you pick from when logging. Rename, reorder, add or remove options. The number beside each option is how many notes use it. Removing an option only takes it out of the picker; notes that already use it keep it.' });
    this.usage = this.computeUsage();

    if (h.period) {
      el.createEl('h4', { cls: 'hd-set-group', text: 'Period' });
      for (const sel of SELECTORS.filter((x) => x.group === 'period')) this.listBlock(el, sel);
      this.labelBlock(el, 'period:flowLabels', 'Flow level names', 'Five fixed levels. Renaming changes what you see in the log window, dashboard and reports; notes keep storing the level (for example "medium").',
        FLOW_KEYS.map((k) => ({ id: k, def: DEFAULT_FLOW_LABELS[k], cur: P.FLOW_LABEL[k] })),
        (vals) => { h.period.settings.flowLabels = Object.fromEntries(FLOW_KEYS.map((k, i) => [k, vals[i]])); });
      this.labelBlock(el, 'period:painLabels', 'Pain level names', 'The words shown for pain 0 to 5.',
        DEFAULT_PAIN_LABELS.map((d, i) => ({ id: String(i), def: d, cur: P.PAIN_LABELS[i] })),
        (vals) => { h.period.settings.painLabels = vals; });
    }
    if (h.migraine) {
      el.createEl('h4', { cls: 'hd-set-group', text: 'Migraine' });
      for (const sel of SELECTORS.filter((x) => x.group === 'migraine')) this.listBlock(el, sel);
    }
    for (const [g, label] of [['visits', 'Doctor visits'], ['bp', 'Blood pressure'], ['illness', 'Sickness and general health'], ['meds', 'Medications'], ['a1c', 'A1C']]) {
      if (!h[g]) continue;
      el.createEl('h4', { cls: 'hd-set-group', text: label });
      for (const sel of SELECTORS.filter((x) => x.group === g)) this.listBlock(el, sel);
    }
    el.createEl('p', { cls: 'setting-item-description', text: 'Folders, units, reports and other options are in each tracker\u2019s own settings tab.' });
  }

  module(sel) { return this.host[sel.group]; }
  defaults(sel) { return ({ period: P, migraine: M, visits: V, bp: B, illness: I, meds: D, a1c: A })[sel.group].DEFAULT_SETTINGS[sel.key] || []; }
  records(group) {
    const h = this.host;
    if (group === 'period') return h.period ? h.period.getEntries() : [];
    if (group === 'visits') return h.visits ? h.visits.getVisits() : [];
    if (GENERIC_TABS[group]) return h[group] ? h[group].getRecords().filter((r) => !r.kind || r.kind === 'illness') : [];
    return h.migraine ? h.migraine.getEpisodes() : [];
  }
  computeUsage() {
    const out = new Map();
    for (const sel of SELECTORS) {
      const m = new Map();
      if (this.module(sel)) {
        for (const r of this.records(sel.group)) {
          for (const v of new Set(sel.get(r).filter(Boolean).map((x) => (sel.ci ? String(x).toLowerCase() : String(x))))) m.set(v, (m.get(v) || 0) + 1);
        }
      }
      out.set(sel.group + ':' + sel.key, m);
    }
    return out;
  }
  usesOf(sel, value) {
    const m = this.usage.get(sel.group + ':' + sel.key);
    return (m && m.get(sel.ci ? String(value).toLowerCase() : String(value))) || 0;
  }

  async saveList(sel, list) {
    const mod = this.module(sel);
    mod.settings[sel.key] = list;
    await mod.saveSettings();
    if (mod.requestRefresh) mod.requestRefresh();
    this.host.refreshHub();
  }

  /* Collapsible editor for one list */
  listBlock(parent, sel) {
    const id = sel.group + ':' + sel.key;
    const det = parent.createEl('details', { cls: 'hd-sel' });
    if (this.open.has(id)) det.setAttr('open', '');
    det.addEventListener('toggle', () => { if (det.open) this.open.add(id); else this.open.delete(id); });
    const sum = det.createEl('summary', { cls: 'hd-sel-summary' });
    const body = det.createDiv({ cls: 'hd-sel-body' });
    const draw = () => {
      const list = this.module(sel).settings[sel.key].slice();
      sum.empty();
      sum.createSpan({ cls: 'hd-sel-name', text: sel.label });
      sum.createSpan({ cls: 'hd-sel-count', text: P.plural(list.length, 'option') });
      body.empty();
      const rows = body.createDiv({ cls: 'hd-sel-rows' });
      if (!list.length) rows.createDiv({ cls: 'hd-muted hd-small', text: 'No options. Add one below.' });
      list.forEach((value, i) => {
        const row = rows.createDiv({ cls: 'hd-sel-row' });
        const input = row.createEl('input', { type: 'text', cls: 'hd-sel-input', attr: { 'aria-label': 'Rename ' + value } });
        input.value = value;
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); if (ev.key === 'Escape') { input.value = value; input.blur(); } });
        input.addEventListener('change', () => this.rename(sel, value, input.value, draw));
        const n = this.usesOf(sel, value);
        row.createSpan({ cls: 'hd-sel-uses' + (n ? '' : ' is-zero'), text: n ? 'in ' + P.plural(n, 'note') : 'unused', attr: { title: n ? 'Used in ' + P.plural(n, 'note') : 'Not used in any note yet' } });
        const btn = (icon, label, fn, disabled) => {
          const b = row.createEl('button', { cls: 'clickable-icon hd-sel-btn', attr: { 'aria-label': label } });
          setIcon(b, icon);
          if (disabled) b.setAttr('disabled', ''); else b.onclick = fn;
        };
        btn('arrow-up', 'Move up', () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; this.saveList(sel, list).then(draw); }, i === 0);
        btn('arrow-down', 'Move down', () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; this.saveList(sel, list).then(draw); }, i === list.length - 1);
        btn('trash-2', 'Remove ' + value, async () => {
          list.splice(i, 1);
          await this.saveList(sel, list);
          if (n) new Notice('"' + value + '" removed from the list. ' + P.plural(n, 'note') + ' still use it and keep it.');
          draw();
        });
      });

      const add = body.createDiv({ cls: 'hd-sel-add' });
      const inp = add.createEl('input', { type: 'text', attr: { placeholder: 'Add an option…', 'aria-label': 'New ' + sel.label.toLowerCase() + ' option' } });
      const doAdd = async () => {
        const v = inp.value.trim();
        if (!v) return;
        if (list.some((x) => sameText(x, v, true))) { new Notice('"' + v + '" is already in the list.'); return; }
        list.push(v);
        await this.saveList(sel, list);
        draw();
        const again = body.querySelector('.hd-sel-add input');
        if (again) again.focus();
      };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doAdd(); } });
      add.createEl('button', { text: 'Add' }).onclick = doAdd;
      const tools = add.createDiv({ cls: 'hd-sel-tools' });
      tools.createEl('button', { text: 'Sort A–Z', cls: 'hd-sel-tool' }).onclick = async () => { list.sort((a, b) => a.localeCompare(b)); await this.saveList(sel, list); draw(); };
      tools.createEl('button', { text: 'Restore defaults', cls: 'hd-sel-tool' }).onclick = () => {
        new ConfirmModal(this.app, 'Restore default ' + sel.label.toLowerCase() + '?', 'The list goes back to the original options. Your notes are not changed.', 'Restore', 'Cancel', async (ok) => {
          if (!ok) return;
          await this.saveList(sel, this.defaults(sel).slice());
          draw();
        }).open();
      };
    };
    draw();
  }

  async rename(sel, oldV, rawNew, redraw) {
    const newV = String(rawNew || '').trim();
    const mod = this.module(sel);
    const list = mod.settings[sel.key].slice();
    const i = list.indexOf(oldV);
    if (!newV || newV === oldV || i < 0) { redraw(); return; }
    const other = list.findIndex((x, j) => j !== i && sameText(x, newV, true));
    if (other >= 0) list.splice(i, 1); // merging into an existing option
    else list[i] = newV;
    await this.saveList(sel, list);
    const n = this.usesOf(sel, oldV);
    if (!n) { redraw(); return; }
    new ConfirmModal(this.app, 'Update existing notes?',
      P.plural(n, 'note') + ' use "' + oldV + '". Change ' + (n === 1 ? 'it' : 'them') + ' to "' + (other >= 0 ? list[other] : newV) + '" as well? If not, those notes keep the old name.',
      'Update ' + P.plural(n, 'note'), 'Only the list', async (ok) => {
        if (ok) {
          const done = await this.renameInNotes(sel, oldV, other >= 0 ? list[other] : newV);
          new Notice('Updated ' + P.plural(done, 'note') + '.');
          this.usage = this.computeUsage();
        }
        redraw();
      }).open();
  }

  async renameInNotes(sel, oldV, newV) {
    const fmApi = this.app.fileManager;
    let done = 0;
    for (const r of this.records(sel.group)) {
      if (!sel.get(r).some((x) => x && sameText(x, oldV, sel.ci))) continue;
      await fmApi.processFrontMatter(r.file, (fm) => {
        for (const field of [].concat(sel.fm)) {
          const cur = fm[field];
          if (cur === undefined) continue;
          if (sel.kind === 'single') {
            if (sameText(cur, oldV, sel.ci)) fm[field] = newV;
          } else if (sel.kind === 'med') {
            fm[field] = M.asArray(cur).map((s) => {
              const m = M.parseMed(s);
              if (!sameText(m.name, oldV, false)) return s;
              m.name = newV;
              return M.medToString(m);
            });
          } else {
            const arr = (sel.group === 'period' ? P.toList(cur) : M.asArray(cur)).map((x) => (sameText(x, oldV, sel.ci) ? newV : x));
            fm[field] = arr.filter((x, k) => arr.findIndex((y) => sameText(x, y, sel.ci)) === k);
          }
        }
      });
      done++;
    }
    return done;
  }

  /* Fixed-length display names (flow levels, pain words) */
  labelBlock(parent, id, title, desc, items, store) {
    const det = parent.createEl('details', { cls: 'hd-sel' });
    if (this.open.has(id)) det.setAttr('open', '');
    det.addEventListener('toggle', () => { if (det.open) this.open.add(id); else this.open.delete(id); });
    const sum = det.createEl('summary', { cls: 'hd-sel-summary' });
    sum.createSpan({ cls: 'hd-sel-name', text: title });
    sum.createSpan({ cls: 'hd-sel-count', text: P.plural(items.length, 'level') });
    const body = det.createDiv({ cls: 'hd-sel-body' });
    body.createDiv({ cls: 'hd-muted hd-small hd-sel-desc', text: desc });
    const inputs = [];
    const save = async () => {
      const per = this.host.period;
      store(inputs.map((x, i) => x.value.trim() || items[i].def));
      applyPeriodLabels(per.settings);
      await per.saveSettings();
      per.requestRefresh();
      this.host.refreshHub();
    };
    const rows = body.createDiv({ cls: 'hd-sel-rows' });
    for (const it of items) {
      const row = rows.createDiv({ cls: 'hd-sel-row' });
      row.createSpan({ cls: 'hd-sel-key', text: it.id });
      const input = row.createEl('input', { type: 'text', cls: 'hd-sel-input', attr: { placeholder: it.def } });
      input.value = it.cur === it.def ? '' : it.cur;
      if (!input.value) input.value = it.def;
      input.addEventListener('change', save);
      inputs.push(input);
    }
    const tools = body.createDiv({ cls: 'hd-sel-add' });
    tools.createEl('button', { text: 'Restore defaults', cls: 'hd-sel-tool' }).onclick = async () => {
      inputs.forEach((x, i) => { x.value = items[i].def; });
      await save();
    };
  }
}

class HealthDashboardPlugin extends Plugin {
  async onload() {
    this.data = (await this.loadData()) || {};
    this.settings = Object.assign({}, HUB_DEFAULTS, this.data.hub || {});
    this.renderers = new Set();
    await this.importOldSettings();

    this.normalizeSettings();
    if (!this.settings.userName) { // carry over a name set earlier in any tracker
      const found = MODULE_KEYS.map((k) => this.data[k] && this.data[k].reportName).find((n) => n && String(n).trim());
      if (found) { this.settings.userName = String(found).trim(); await this.saveHub(); }
    }
    for (const k of MODULE_KEYS) this[k] = null;
    for (const def of MODULES) if (this.settings.active[def.key]) await this.enableModule(def, true);

    this.registerView(HUB_VIEW, (leaf) => new HubView(leaf, this));
    this.addRibbonIcon('heart-pulse', 'Open health dashboard', () => this.activateView());
    this.addCommand({ id: 'open-dashboard', name: 'Open dashboard', callback: () => this.activateView() });
    for (const t of TABS) {
      this.addCommand({
        id: 'open-' + t.id, name: 'Open ' + t.label.toLowerCase() + ' tab',
        checkCallback: (checking) => { if (!this.tabVisible(t.id)) return false; if (!checking) this.activateView(t.id); return true; },
      });
    }
    this.addCommand({ id: 'health-report', name: 'Create health report (PDF, all dashboards)', callback: () => this.openHealthReport() });
    this.addCommand({ id: 'layout-diagnostics', name: 'Copy layout diagnostics (for troubleshooting)', callback: () => this.copyLayoutDiagnostics() });
    this.addCommand({ id: 'add-note', name: 'Add a general note', callback: () => new module.exports._extras.NoteModal(this, 'general').open() });
    for (const [k, word] of [['migraine', 'migraine'], ['period', 'period']]) {
      this.addCommand({
        id: 'missed-' + k, name: 'Log a missed ' + word + ' (no exact date)',
        checkCallback: (checking) => { if (!this[k]) return false; if (!checking) new module.exports._extras.MissedModal(this, k).open(); return true; },
      });
    }
    // Re-draw a tracker's dashboard when one of its notes changes
    this.registerEvent(this.app.metadataCache.on('changed', (file, data, cache) => {
      const fm = cache && cache.frontmatter;
      const e = fm && String(fm.entry || '').toLowerCase();
      if (e === 'health-note' || e === 'missed-event') this.refreshModule(fm.tracker || 'general');
    }));
    this.registerMarkdownCodeBlockProcessor('health-dashboard', (src, el, ctx) => {
      const want = String(src || '').trim().toLowerCase();
      ctx.addChild(new HubBlock(el, this, TABS.some((t) => t.id === want) ? want : undefined));
    });
    APPENDIX.host = this; // PDF reports add their appendix and disclaimer
    this.registerLinks(); // ```health-link, inline `health-link`, obsidian://health-dashboard
    this.addSettingTab(new HubSettingTab(this.app, this));
  }

  onunload() { if (this._hubTimer) window.clearTimeout(this._hubTimer); }

  normalizeSettings() {
    const s = this.settings;
    s.active = Object.assign(Object.fromEntries(MODULE_KEYS.map((k) => [k, true])), s.active || {});
    s.overview = Object.assign(Object.fromEntries(MODULE_KEYS.map((k) => [k, true])), s.overview || {});
    if (!s.overviewLayout || typeof s.overviewLayout !== 'object' || Array.isArray(s.overviewLayout)) s.overviewLayout = {};
    if (s.overviewLayoutMode !== 'grid') s.overviewLayoutMode = 'free';
    if (this.linkSettings) this.linkSettings();
    for (const [name, keys] of [['tabOrder', MODULE_KEYS], ['overviewOrder', OVERVIEW_KEYS]]) { // keep known items, add new ones at the end
      const cur = Array.isArray(s[name]) ? s[name].filter((k, i, a) => keys.includes(k) && a.indexOf(k) === i) : [];
      for (const k of keys) if (!cur.includes(k)) cur.push(k);
      s[name] = cur;
    }
  }
  isActive(key) { return !!this.settings.active[key]; }
  /** Collects where the open dashboard's parts sit and which style rules position them, and copies it to the clipboard */
  async copyLayoutDiagnostics() {
    const leaf = this.app.workspace.getLeavesOfType(HUB_VIEW)[0];
    const root = leaf && leaf.view && leaf.view.contentEl;
    if (!root) { new Notice('Open the Health dashboard on the tab that looks wrong, then run this again.'); return; }
    const win = root.ownerDocument.defaultView;
    const PROPS = ['position', 'top', 'left', 'right', 'bottom', 'inset', 'width', 'max-width', 'margin', 'transform', 'z-index', 'display', 'float', 'translate', 'contain'];
    const desc = (el) => {
      if (!el || !el.getBoundingClientRect) return String(el);
      const r = el.getBoundingClientRect(), cs = win.getComputedStyle(el);
      return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') +
        ' | box ' + [r.left, r.top, r.width, r.height].map(Math.round).join(',') + ' | ' + ['position', 'top', 'left', 'width', 'margin', 'transform', 'z-index', 'display'].map((k) => k + ':' + cs.getPropertyValue(k)).join('; ');
    };
    const out = ['Health Dashboard ' + this.manifest.version + ' · ' + (win.navigator ? win.navigator.userAgent.replace(/.*?(obsidian\/[\d.]+).*/i, '$1') : ''),
      'Theme: ' + (this.app.customCss && this.app.customCss.theme || 'default') + ' · snippets: ' + ((this.app.customCss && this.app.customCss.enabledSnippets && [...this.app.customCss.enabledSnippets].join(', ')) || 'none'),
      'Tab: ' + (leaf.view.renderer && leaf.view.renderer.tab), '', 'Parts:'];
    const panel = root.querySelector('.hd-panel');
    for (const el of [root, root.querySelector('.hd-topbar'), panel].concat(panel ? Array.from(panel.children).slice(0, 4) : [])) out.push('  ' + desc(el));
    out.push('', 'Ancestors:');
    for (let n = root.parentElement, i = 0; n && i < 6; n = n.parentElement, i++) out.push('  ' + desc(n));
    out.push('', 'Style rules that position these parts:');
    const targets = [root, panel].concat(panel ? Array.from(panel.querySelectorAll(':scope > *, :scope > * > *')).slice(0, 30) : []).filter(Boolean);
    const seen = new Set();
    const walk = (rules, src) => {
      for (const rule of Array.from(rules || [])) {
        if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules, src); continue; }
        if (!rule.selectorText || !rule.style) continue;
        if (!PROPS.some((k) => rule.style.getPropertyValue(k))) continue;
        let hit = null;
        try { hit = targets.find((t) => t.matches(rule.selectorText)); } catch (e) { continue; }
        if (!hit) continue;
        const line = '  [' + src + '] ' + rule.selectorText + ' { ' + PROPS.filter((k) => rule.style.getPropertyValue(k)).map((k) => k + ': ' + rule.style.getPropertyValue(k) + (rule.style.getPropertyPriority(k) ? ' !important' : '')).join('; ') + ' }';
        if (!seen.has(line)) { seen.add(line); out.push(line); }
      }
    };
    for (const sh of Array.from(root.ownerDocument.styleSheets)) {
      const node = sh.ownerNode, src = sh.href ? sh.href.split('/').pop() : node && (node.id || node.getAttribute && (node.getAttribute('data-plugin') || node.getAttribute('class'))) || 'style';
      let rules = null; try { rules = sh.cssRules; } catch (e) { continue; }
      walk(rules, src);
    }
    const text = out.join('\n');
    try { await navigator.clipboard.writeText(text); new Notice('Layout diagnostics copied. Paste them into the chat.'); }
    catch (e) {
      const f = 'Health Dashboard diagnostics.md';
      const ex = this.app.vault.getAbstractFileByPath(f);
      if (ex) await this.app.vault.modify(ex, '```\n' + text + '\n```\n'); else await this.app.vault.create(f, '```\n' + text + '\n```\n');
      new Notice('Saved to "' + f + '" in your vault.');
    }
  }
  /** Full-width calendar on or off; in the free layout its stored width is dropped so the new size applies */
  setCalendarWide(v) {
    this.settings.calendarWide = !!v;
    const l = this.settings.overviewLayout && this.settings.overviewLayout.calendar;
    if (l) { delete l.w; if (v) l.x = 0; }
  }
  /** Overview first, then the trackers in the chosen tab order */
  orderedTabs() {
    return [TABS[0]].concat(this.settings.tabOrder.map((k) => TABS.find((t) => t.id === k)).filter(Boolean)).filter((t) => this.tabVisible(t.id));
  }
  /** Apply a new order for the visible trackers (from dragging), keeping hidden ones in their slots */
  async setVisibleOrder(name, visibleKeys, refresh = true) {
    const allowed = name === 'overviewOrder' ? OVERVIEW_KEYS : MODULE_KEYS;
    const set = new Set(visibleKeys.filter((k) => allowed.includes(k)));
    const queue = visibleKeys.filter((k) => set.has(k));
    this.settings[name] = this.settings[name].map((k) => (set.has(k) ? queue.shift() : k));
    await this.saveHub();
    if (refresh) this.refreshHub();
  }


  /* One name for all reports: copied into each tracker's report setting */
  async setUserName(v) {
    this.settings.userName = String(v || '').trim();
    await this.saveHub();
    for (const k of MODULE_KEYS) if (this[k]) await this.applyUserName(this[k]);
  }
  async applyUserName(mod) {
    if (!mod.settings || (mod.settings.reportName || '') === (this.settings.userName || '')) return;
    mod.settings.reportName = this.settings.userName || '';
    await mod.saveData(mod.settings);
  }
  tabVisible(id) { return id === 'overview' || this.isActive(id); }

  /* Start one tracker inside Health Dashboard */
  async enableModule(def, quiet) {
    if (this[def.key]) return;
    const enabled = (this.app.plugins && this.app.plugins.enabledPlugins) || new Set();
    if (enabled.has(def.id)) {
      new Notice('Health Dashboard: the separate ' + def.name + ' plugin is still on, so its part of Health Dashboard is paused. Turn ' + def.name + ' off, then turn Health Dashboard off and on.', 12000);
      this[def.key] = null;
      return;
    }
    const Hosted = makeModule(def.Base, this, def.key);
    const mod = new Hosted(this.app, Object.assign({}, this.manifest, { id: def.id, name: def.name }));
    this[def.key] = mod;
    this.addChild(mod); // loads it now and unloads it with Health Dashboard
    await mod.ready;
    // Re-render combined views when the tracker's data changes
    if (def.key === 'period') {
      applyPeriodLabels(mod.settings);
      mod.renderers.add({ render: () => this.refreshHub() });
    } else {
      mod.onRefresh = () => this.refreshHub();
      if (def.key === 'visits') mod.sinceSummary = (fromKey, toKey) => this.sinceSummary(fromKey, toKey);
      // Cross-tracker helpers: current medications appear as choices; doctors from visits as prescribers
      if (def.key === 'bp' || def.key === 'a1c') mod.currentMeds = () => (this.meds ? this.meds.currentRows() : []);
      if (def.key === 'meds' || def.key === 'a1c') mod.prescriberOptions = () => (this.visits ? [...new Set(this.visits.getVisits().map((v) => v.doctor).filter(Boolean).concat(this.visits.settings.doctors))] : []);
    }
    // Notes and records without an exact date at the end of each dashboard, and in its PDF report
    mod.renderExtras = (el) => this.renderExtras(def.key, el);
    mod.reportExtras = (o) => this.reportExtras(def.key, o);
    if (def.key === 'visits') mod.openReport = () => this.openVisitsReport();
    // Medications from the Medications tracker are offered in every other tracker's medication fields
    if (def.key !== 'meds') {
      mod.medOptions = () => (this.meds ? this.meds.currentNames() : []);
      mod.medInfo = (name) => (this.meds ? this.meds.info(name) : null);
    }
    await this.applyUserName(mod);
    if (!quiet) { this.refreshHub(); new Notice(def.label + ' turned on.'); }
  }

  /* Stop one tracker: its dashboard, commands, ribbon icon, status bar and settings tab go away. Notes are untouched. */
  disableModule(def) {
    const mod = this[def.key];
    if (!mod) return;
    for (const leaf of this.app.workspace.getLeavesOfType(def.view)) leaf.detach();
    this[def.key] = null;
    this.removeChild(mod);
    this.refreshHub();
    new Notice(def.label + ' turned off. Your notes are kept.');
  }

  async importOldSettings() {
    // One-time copy of settings from the standalone plugins, if they were used before
    let changed = false;
    for (const [key, id] of [['period', 'period-tracker'], ['migraine', 'migraine-tracker']]) {
      if (this.data[key] !== undefined) continue;
      try {
        const path = normalizePath(this.app.vault.configDir + '/plugins/' + id + '/data.json');
        if (await this.app.vault.adapter.exists(path)) {
          this.data[key] = JSON.parse(await this.app.vault.adapter.read(path));
          changed = true;
        }
      } catch (e) { console.warn('Health Dashboard: could not import ' + id + ' settings', e); }
    }
    if (changed) await this.saveData(this.data);
  }

  /* Health snapshot between two days, shown on upcoming doctor visits */
  sinceSummary(fromKey, toKey) {
    const lines = [];
    if (this.migraine) {
      const all = this.migraine.getEpisodes();
      const [y, m, d] = fromKey.split('-').map(Number);
      const st = M.computeStats(all, 'custom', new Date(), this.migraine.settings, new Date(y, m - 1, d + 1));
      if (!st.count) lines.push('No migraines logged');
      else {
        let t = P.plural(st.count, 'migraine') + ' over ' + P.plural(st.migraineDays, 'day');
        if (st.avgPainMax != null) t += ', average peak pain ' + (Math.round(st.avgPainMax * 10) / 10) + '/' + M.getPainMax();
        lines.push(t);
        if (st.medDaysRange) lines.push('Acute medication on ' + P.plural(st.medDaysRange, 'day'));
        if (st.triggers.length) lines.push('Most common trigger: ' + st.triggers[0][0]);
      }
    }
    if (this.period) {
      const a = this.period.getAnalysis();
      const from = P.toDayNum(fromKey), to = P.toDayNum(toKey);
      const ps = a.periods.filter((p) => p.start > from && p.start <= to);
      if (ps.length) {
        const avgLen = ps.reduce((s, p) => s + p.length, 0) / ps.length;
        let t = P.plural(ps.length, 'period') + ', average ' + (Math.round(avgLen * 10) / 10) + ' days long';
        const cyc = ps.filter((p) => p.cycleLength != null).map((p) => p.cycleLength);
        if (cyc.length) t += Math.min(...cyc) === Math.max(...cyc) ? '; cycle ' + cyc[0] + ' days' : '; cycles ' + Math.min(...cyc) + '–' + Math.max(...cyc) + ' days';
        lines.push(t);
      } else if (a.entries.length) lines.push('No periods logged');
    }
    if (this.bp) {
      const st = this.bp.stats(KitModule.addDaysKey(fromKey, 1), toKey);
      if (st.n) {
        let t = 'Blood pressure averaged ' + B.fmtBP(st.avg) + ' (' + P.plural(st.n, 'reading') + ')';
        if (st.parts.Morning && st.parts.Evening) t += '; morning ' + B.fmtBP(st.parts.Morning) + ', evening ' + B.fmtBP(st.parts.Evening);
        lines.push(t);
      }
    }
    if (this.illness) {
      const st = this.illness.stats(KitModule.addDaysKey(fromKey, 1), toKey);
      if (st.count) lines.push('Sick ' + P.plural(st.count, 'time') + ' (' + P.plural(st.sickDays, 'day') + ')' + (st.types.length ? ': ' + st.types.map((x) => x[0]).join(', ') : ''));
    }
    if (this.a1c) {
      const rs = this.a1c.getRecords().slice().sort(A.sortAsc);
      const inRange = rs.filter((r) => r.date > fromKey && r.date <= toKey);
      if (inRange.length) {
        const L = inRange[inRange.length - 1], i = rs.indexOf(L), prev = i > 0 ? rs[i - 1] : null;
        lines.push('A1C ' + this.a1c.fmt(L.pct) + ' on ' + V.fmtKey(L.date) + (prev ? ' (previous ' + this.a1c.fmt(prev.pct) + ')' : ''));
      }
    }
    if (this.meds) {
      const ch = this.meds.changesBetween(fromKey, toKey);
      if (ch.started.length) lines.push('Started: ' + ch.started.join(', '));
      if (ch.stopped.length) lines.push('Stopped: ' + ch.stopped.join(', '));
    }
    return lines;
  }

  getModuleData(key) { return this.data[key] === undefined ? null : JSON.parse(JSON.stringify(this.data[key])); }
  async setModuleData(key, d) { this.data[key] = d; await this.saveData(this.data); }
  async saveHub() { this.data.hub = this.settings; await this.saveData(this.data); }

  initialTab() {
    const t = this.settings.defaultTab === 'last' ? (this.settings.lastTab || 'overview') : this.settings.defaultTab;
    return this.tabVisible(t) ? t : 'overview';
  }
  rememberTab(id) {
    if (this.settings.lastTab === id) return;
    this.settings.lastTab = id;
    this.saveHub();
  }

  refreshHub() {
    if (this._hubTimer) window.clearTimeout(this._hubTimer);
    this._hubTimer = window.setTimeout(() => {
      for (const r of this.renderers) { try { r.render(); } catch (e) { console.error('Health dashboard render failed', e); } }
      if (this.refreshLinks) this.refreshLinks(); // a link to a tracker that was turned off falls back to the Overview
    }, 80);
  }

  async activateView(tab, opts = {}) {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(HUB_VIEW)[0];
    // Links in notes switch to an open dashboard, unless "Always open a new tab" is on
    if (opts.fromLink && this.settings.link && this.settings.link.reuseTab === false) leaf = null;
    if (!leaf) {
      leaf = ws.getLeaf('tab');
      await leaf.setViewState({ type: HUB_VIEW, active: true });
    }
    ws.revealLeaf(leaf);
    if (tab && this.tabVisible(tab) && leaf.view && leaf.view.renderer) leaf.view.renderer.setTab(tab);
  }
}

module.exports = HealthDashboardPlugin;
module.exports.default = HealthDashboardPlugin;
// Exposed for testing
module.exports._bp = B;
module.exports._illness = I;
module.exports._meds = D;
module.exports._a1c = A;
