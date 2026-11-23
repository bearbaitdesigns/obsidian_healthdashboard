/* Glucose: finger-prick meter readings and continuous glucose monitor (CGM) data, with time in range, daily pattern and a PDF report. */
const K = KitModule;
const { Notice, PluginSettingTab, Setting, setIcon, Menu } = require('obsidian');

const VIEW_TYPE = 'glucose-dashboard';
const ENTRY = 'glucose-reading'; // one meter reading per note
const DAY_ENTRY = 'glucose-cgm-day'; // one day of imported CGM readings per note
const MG_PER_MMOL = 18.016;
const DEFAULT_SETTINGS = {
  folder: 'Glucose',
  unit: 'mmol/L', // mmol/L | mg/dL
  rangePreset: 'standard', // standard | tight | pregnancy | custom
  customLow: 70, customHigh: 180, // mg/dL
  defaultRange: '14',
  dateOrder: 'auto', // for CGM files with dates like 03-11-2026: auto | mdy | dmy
  reportName: '',
  contexts: ['Fasting', 'Before meal', 'After meal', 'Bedtime', 'Overnight', 'Before exercise', 'After exercise', 'Feeling low', 'Random'],
  devices: ['Finger-prick meter'],
  medications: [],
};
const LIST_KEYS = ['contexts', 'devices', 'medications'];

/* Target ranges (mg/dL). Standard: International Consensus on Time in Range (Battelino et al., Diabetes Care 2019). */
const PRESETS = {
  standard: { id: 'standard', name: 'Standard (70–180 mg/dL, 3.9–10.0 mmol/L)', short: 'standard target range', low: 70, high: 180 },
  tight: { id: 'tight', name: 'Tight (70–140 mg/dL, 3.9–7.8 mmol/L)', short: 'tight range', low: 70, high: 140 },
  pregnancy: { id: 'pregnancy', name: 'Pregnancy with type 1 diabetes (63–140 mg/dL, 3.5–7.8 mmol/L)', short: 'pregnancy range', low: 63, high: 140 },
  custom: { id: 'custom', name: 'My doctor’s range', short: 'your doctor’s range' },
};
const VERY_LOW = 54, VERY_HIGH = 250;
function targetOf(s) {
  const p = PRESETS[s.rangePreset] || PRESETS.standard;
  if (p.id !== 'custom') return { low: p.low, high: p.high, name: p.short, id: p.id };
  const low = K.num(s.customLow) || 70, high = K.num(s.customHigh) || 180;
  return { low: Math.min(low, high - 10), high: Math.max(high, low + 10), name: p.short, id: 'custom' };
}
/* Five bands, the colours used on AGP reports */
const BANDS = [
  { id: 'vlow', label: 'Very low', hex: '#8b1a1a', test: (v) => v < VERY_LOW },
  { id: 'low', label: 'Low', hex: '#d1495b', test: (v, t) => v < t.low },
  { id: 'in', label: 'In range', hex: '#2f9e6b', test: (v, t) => v <= t.high },
  { id: 'high', label: 'High', hex: '#e6a817', test: (v) => v <= VERY_HIGH },
  { id: 'vhigh', label: 'Very high', hex: '#dd7a35', test: () => true },
];
const bandOf = (v, t) => BANDS.find((b) => b.test(v, t));
const GL_HEX = '#a16207';
/* Consensus targets for most adults with type 1 or type 2 diabetes */
const GOALS = { in: 70, low: 4, vlow: 1, high: 25, vhigh: 5, cv: 36 };

const toUnit = (s, mg) => (s.unit === 'mg/dL' ? Math.round(mg) : Math.round((mg / MG_PER_MMOL) * 10) / 10);
const fmtG = (s, mg, noUnit) => (mg == null ? '–' : (s.unit === 'mg/dL' ? String(Math.round(mg)) : (mg / MG_PER_MMOL).toFixed(1)) + (noUnit ? '' : ' ' + s.unit));
const fmtBoth = (mg) => Math.round(mg) + ' mg/dL (' + (mg / MG_PER_MMOL).toFixed(1) + ' mmol/L)';
const fmtRange = (s, t) => fmtG(s, t.low, true) + '–' + fmtG(s, t.high);
const gmiOf = (meanMg) => Math.round((3.31 + 0.02392 * meanMg) * 10) / 10; // Bergenstal et al., Diabetes Care 2018
const minsOf = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hhmm = (mins) => K.pad(Math.floor(mins / 60)) + ':' + K.pad(mins % 60);

/* ---------------- Notes ---------------- */
function parseDayReadings(v) {
  const out = [];
  for (const part of String(v || '').split(/[;,\n]/)) {
    const m = /^\s*(\d{1,2}):(\d{2})\s+(\d+(?:\.\d+)?)\s*$/.exec(part);
    if (m) { const mg = Number(m[3]); if (mg >= 20 && mg <= 600) out.push({ min: Number(m[1]) * 60 + Number(m[2]), mg }); }
  }
  return out.sort((a, b) => a.min - b.min);
}
function parse(file, fm) {
  if (!fm) return null;
  const e = String(fm.entry || '').toLowerCase();
  if (e === ENTRY) {
    const date = K.normDate(fm.date);
    let mg = K.num(fm.glucose_mg_dl);
    if (mg == null && K.num(fm.glucose_mmol_l) != null) mg = K.num(fm.glucose_mmol_l) * MG_PER_MMOL;
    if (!date || mg == null || mg < 20 || mg > 600) return null;
    return {
      kind: 'meter', file, path: file ? file.path : '', date, time: K.normTime(fm.time) || '', mg,
      context: K.str(fm.context), device: K.str(fm.device), medications: K.asArray(fm.medications), notes: K.str(fm.notes),
    };
  }
  if (e === DAY_ENTRY) {
    const date = K.normDate(fm.date);
    const points = parseDayReadings(fm.readings_mg_dl);
    if (!date || !points.length) return null;
    return { kind: 'cgm', file, path: file ? file.path : '', date, points, device: K.str(fm.device), source: K.str(fm.source_file), notes: K.str(fm.notes) };
  }
  return null;
}
const sortAsc = (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));

/* ---------------- Statistics ---------------- */
function pct(xs, p) {
  if (!xs.length) return null;
  const a = xs.slice().sort((x, y) => x - y), i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
/** Every reading as { date, min, mg, src, rec }; CGM days expand to their points */
function flatten(recs) {
  const out = [];
  for (const r of recs) {
    if (r.kind === 'meter') out.push({ date: r.date, min: minsOf(r.time), mg: r.mg, src: 'meter', rec: r });
    else for (const p of r.points) out.push({ date: r.date, min: p.min, mg: p.mg, src: 'cgm', rec: r });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.min || 0) - (b.min || 0));
}
/** Low events: CGM runs below the target low for 15 minutes or more; each low meter reading (within 30 minutes merged) */
function lowEvents(rs, t) {
  const ev = [];
  let run = null;
  const abs = (r) => K.daysBetween('2000-01-01', r.date) * 1440 + (r.min || 0);
  const close = () => { if (run && (run.src === 'meter' || run.end - run.start + 5 >= 15)) ev.push(run); run = null; };
  for (const r of rs) {
    const at = abs(r);
    if (r.mg < t.low) {
      const gap = run ? at - run.end : Infinity;
      if (run && run.src === r.src && gap <= (r.src === 'cgm' ? 20 : 30)) { run.end = at; run.nadir = Math.min(run.nadir, r.mg); }
      else { close(); run = { src: r.src, date: r.date, startMin: r.min, start: at, end: at, nadir: r.mg }; }
    } else if (run && run.src === r.src) close();
  }
  close();
  return ev;
}
function computeStats(all, s, fromKey, toKey) {
  const t = targetOf(s);
  const recs = all.filter((r) => (!fromKey || r.date >= fromKey) && r.date <= toKey);
  const flat = flatten(recs);
  const cgm = flat.filter((r) => r.src === 'cgm'), meter = flat.filter((r) => r.src === 'meter');
  // Time in range and variability come from CGM data when there is any (readings every few minutes), else from meter readings
  const src = cgm.length ? 'cgm' : 'meter';
  const base = src === 'cgm' ? cgm : meter;
  const vals = base.map((r) => r.mg);
  const mean = vals.length ? K.mean(vals) : null;
  const sd = vals.length > 1 ? Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length - 1)) : null;
  const bands = Object.fromEntries(BANDS.map((b) => [b.id, 0]));
  for (const v of vals) bands[bandOf(v, t).id]++;
  const share = Object.fromEntries(BANDS.map((b) => [b.id, vals.length ? (100 * bands[b.id]) / vals.length : 0]));
  // CGM wear: readings x typical interval / minutes in the days covered
  const cgmDays = [...new Set(cgm.map((r) => r.date))];
  let interval = 5;
  if (cgm.length > 2) {
    const gaps = [];
    for (let i = 1; i < cgm.length; i++) if (cgm[i].date === cgm[i - 1].date) gaps.push(cgm[i].min - cgm[i - 1].min);
    interval = Math.max(1, Math.round(pct(gaps.filter((g) => g > 0), 0.5) || 5));
  }
  const spanDays = fromKey ? K.daysBetween(fromKey, toKey) + 1 : cgmDays.length;
  const active = cgm.length ? Math.min(100, (100 * cgm.length * interval) / (Math.max(1, cgm.length && fromKey ? spanDays : cgmDays.length) * 1440)) : null;
  // Daily summaries
  const byDay = new Map();
  for (const r of flat) { if (!byDay.has(r.date)) byDay.set(r.date, []); byDay.get(r.date).push(r); }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, rs]) => {
    const use = rs.some((r) => r.src === 'cgm') ? rs.filter((r) => r.src === 'cgm') : rs;
    const v = use.map((r) => r.mg);
    const inR = v.filter((x) => x >= t.low && x <= t.high).length;
    return { date, n: rs.length, src: use[0].src, mean: K.mean(v), min: Math.min(...v), max: Math.max(...v), tir: (100 * inR) / v.length,
      below: (100 * v.filter((x) => x < t.low).length) / v.length, above: (100 * v.filter((x) => x > t.high).length) / v.length, meter: rs.filter((r) => r.src === 'meter').length };
  });
  // Daily pattern (by hour of day) from the readings used above
  const hours = Array.from({ length: 24 }, (_, h) => base.filter((r) => r.min != null && Math.floor(r.min / 60) === h).map((r) => r.mg));
  const agp = hours.map((v, h) => (v.length >= 3 ? { h, n: v.length, p5: pct(v, 0.05), p25: pct(v, 0.25), p50: pct(v, 0.5), p75: pct(v, 0.75), p95: pct(v, 0.95) } : { h, n: v.length }));
  // Meter readings by context
  const ctx = new Map();
  for (const r of meter) { const c = r.rec.context || 'No context'; if (!ctx.has(c)) ctx.set(c, []); ctx.get(c).push(r.mg); }
  const lows = lowEvents(base, t);
  const sorted = all.slice().sort(sortAsc);
  const latestMeter = sorted.filter((r) => r.kind === 'meter').pop() || null;
  const lastCgm = sorted.filter((r) => r.kind === 'cgm').pop() || null;
  const latestPoint = lastCgm ? { date: lastCgm.date, min: lastCgm.points[lastCgm.points.length - 1].min, mg: lastCgm.points[lastCgm.points.length - 1].mg, src: 'cgm' } : null;
  const latestM = latestMeter ? { date: latestMeter.date, min: minsOf(latestMeter.time), mg: latestMeter.mg, src: 'meter', rec: latestMeter } : null;
  const later = (a, b) => (!a ? b : !b ? a : (a.date + hhmm(a.min || 0)) >= (b.date + hhmm(b.min || 0)) ? a : b);
  return {
    target: t, recs, flat, cgm, meter, src, n: vals.length, mean, sd, cv: mean && sd != null ? (100 * sd) / mean : null,
    gmi: src === 'cgm' && mean ? gmiOf(mean) : null, bands, share, cgmDays: cgmDays.length, interval, active,
    days, agp, agpHours: agp.filter((x) => x.p50 != null).length, lows, contexts: [...ctx.entries()].map(([c, v]) => ({ context: c, n: v.length, mean: K.mean(v) })).sort((a, b) => b.n - a.n),
    min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null,
    latest: later(latestPoint, latestM),
  };
}
const fixed = (x) => (x == null ? '–' : x < 1 && x > 0 ? '<1%' : Math.round(x) + '%');
const minsText = (pctOfDay) => { const m = Math.round((pctOfDay / 100) * 1440); return m < 60 ? m + ' min a day' : (m / 60).toFixed(1).replace('.0', '') + ' h a day'; };
const rangeFrom = (range, all) => (range === 'all' ? (all.length ? all.slice().sort(sortAsc)[0].date : K.todayKey()) : K.addDaysKey(K.todayKey(), -(Number(range) - 1)));

/* ---------------- CGM file import ---------------- */
function csvRows(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
/** Reads Dexcom Clarity, FreeStyle Libre (LibreView) and simple date/time/glucose CSV exports */
function parseCgmCsv(text, order) {
  const rows = csvRows(text);
  const hi = rows.findIndex((r) => r.some((c) => /glucose|sgv|\bbg\b/i.test(c)) && r.some((c) => /time|date/i.test(c)));
  if (hi < 0) return { error: 'No glucose column found. Export the file as CSV from your CGM app (for example Dexcom Clarity or LibreView).' };
  const head = rows[hi].map((h) => h.trim());
  const find = (re) => head.findIndex((h) => re.test(h));
  const tsCol = [find(/^timestamp/i), find(/device timestamp/i), find(/date.?time/i), find(/time/i), find(/date/i)].find((i) => i >= 0);
  const timeCol = find(/^time$/i), dateCol = find(/^date$/i);
  const gCols = [find(/historic glucose/i), find(/glucose value/i), find(/scan glucose/i), find(/^sgv$/i), find(/glucose/i), find(/\bbg\b/i)].filter((i, k, a) => i >= 0 && a.indexOf(i) === k);
  const evCol = find(/event type/i), typeCol = find(/record type/i);
  const unitHint = head.filter((h, i) => gCols.includes(i)).join(' ');
  let unit = /mmol/i.test(unitHint) ? 'mmol' : /mg/i.test(unitHint) ? 'mg' : null;
  const raw = [];
  for (const r of rows.slice(hi + 1)) {
    if (evCol >= 0 && r[evCol] && !/egv|^$/i.test(r[evCol].trim())) continue; // Dexcom: glucose rows only
    if (typeCol >= 0 && r[typeCol] && !/^[01]$/.test(r[typeCol].trim())) continue; // Libre: historic (0) and scans (1)
    let ts = tsCol != null && tsCol >= 0 ? r[tsCol] : '';
    if (dateCol >= 0 && timeCol >= 0) ts = r[dateCol] + ' ' + r[timeCol];
    let v = null;
    for (const c of gCols) { const x = String(r[c] || '').trim(); if (!x) continue; if (/^low$/i.test(x)) { v = 'LOW'; break; } if (/^high$/i.test(x)) { v = 'HIGH'; break; } const n = Number(x.replace(',', '.')); if (Number.isFinite(n)) { v = n; break; } }
    if (v == null || !ts) continue;
    raw.push({ ts: String(ts).trim(), v });
  }
  if (!raw.length) return { error: 'The file has a glucose column, but no readings could be read from it.' };
  const nums = raw.map((x) => x.v).filter((x) => typeof x === 'number');
  if (!unit) unit = (pct(nums, 0.5) || 0) < 35 ? 'mmol' : 'mg';
  // Dates like 03-11-2026: month first or day first?
  let ord = order && order !== 'auto' ? order : null, ambiguous = false;
  if (!ord) {
    let dmy = false, mdy = false;
    for (const x of raw) { const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(x.ts); if (m) { if (Number(m[1]) > 12) dmy = true; if (Number(m[2]) > 12) mdy = true; } }
    ord = dmy ? 'dmy' : 'mdy';
    ambiguous = !dmy && !mdy && raw.some((x) => /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(x.ts));
  }
  const byDay = new Map();
  let skipped = 0;
  for (const x of raw) {
    let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(x.ts), y, mo, d, h, mi;
    if (m) [y, mo, d, h, mi] = m.slice(1).map(Number);
    else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})[ T]+(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/.exec(x.ts))) {
      const a = Number(m[1]), b = Number(m[2]);
      [mo, d] = ord === 'dmy' ? [b, a] : [a, b];
      y = Number(m[3]); h = Number(m[4]); mi = Number(m[5]);
      if (m[6]) { if (/p/i.test(m[6]) && h < 12) h += 12; if (/a/i.test(m[6]) && h === 12) h = 0; }
    } else { skipped++; continue; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) { skipped++; continue; }
    let mg = x.v === 'LOW' ? 39 : x.v === 'HIGH' ? 401 : unit === 'mmol' ? x.v * MG_PER_MMOL : x.v;
    mg = Math.round(mg);
    if (mg < 20 || mg > 600) { skipped++; continue; }
    const key = y + '-' + K.pad(mo) + '-' + K.pad(d);
    if (!byDay.has(key)) byDay.set(key, new Map());
    byDay.get(key).set(h * 60 + mi, mg);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, m]) => ({ date, points: [...m.entries()].sort((a, b) => a[0] - b[0]).map(([min, mg]) => ({ min, mg })) }));
  const count = days.reduce((a, d) => a + d.points.length, 0);
  const format = head.some((h) => /historic glucose/i.test(h)) ? 'FreeStyle Libre' : head.some((h) => /glucose value/i.test(h)) ? 'Dexcom' : 'CSV';
  return { days, count, unit, format, ambiguous, order: ord, skipped };
}
const encodePoints = (pts) => pts.map((p) => hhmm(p.min) + ' ' + Math.round(p.mg)).join('; ');

class ImportModal extends K.FormModal {
  onOpen() {
    const p = this.plugin, s = p.settings;
    this.begin('Import CGM data');
    const sec = this.section('File', 'upload');
    sec.createEl('p', { cls: 'hk-muted', text: 'Export your readings as a CSV file from your CGM app or website (for example Dexcom Clarity or LibreView), then choose it here. Each day is saved as one note in ' + s.folder + '/CGM. Importing the same days again adds new readings without making copies.' });
    const input = sec.createEl('input', { type: 'file', attr: { accept: '.csv,.txt,text/csv' } });
    this.devC = this.chips(sec, 'Device', s.devices.filter((d) => !/finger/i.test(d)).concat(['Dexcom', 'FreeStyle Libre', 'Medtronic Guardian', 'Eversense']).filter((d, i, a) => a.indexOf(d) === i), '', true);
    this.ordRow = sec.createDiv({ cls: 'hk-hidden' });
    this.label(this.ordRow, 'Dates in this file are written');
    this.ordSel = this.ordRow.createEl('select', { cls: 'dropdown' });
    for (const [v, t] of [['mdy', 'Month first (11-03-2026 = Nov 3)'], ['dmy', 'Day first (03-11-2026 = Nov 3)']]) this.ordSel.createEl('option', { text: t, attr: { value: v } });
    this.out = sec.createDiv({ cls: 'gl-import-result' });
    this.text = null; this.name = '';
    input.onchange = async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      this.name = f.name; this.text = await f.text();
      this.preview(s.dateOrder);
    };
    this.ordSel.onchange = () => this.preview(this.ordSel.value);
    this.footer({ saveText: 'Import', onSave: () => this.run() });
  }
  preview(order) {
    this.out.empty();
    if (this.text == null) return;
    this.res = parseCgmCsv(this.text, order);
    if (this.res.error) { this.out.createDiv({ cls: 'gl-import-error', text: this.res.error }); return; }
    const r = this.res;
    this.ordRow.toggleClass('hk-hidden', !r.ambiguous && order !== 'mdy' && order !== 'dmy');
    this.ordSel.value = r.order;
    if (!this.devC.value() && r.format !== 'CSV') this.devC.set ? this.devC.set([r.format]) : null;
    this.out.createDiv({ text: r.format + ' file · ' + K.plural(r.count, 'reading') + ' over ' + K.plural(r.days.length, 'day') + (r.days.length ? ' (' + K.fmtKey(r.days[0].date) + ' – ' + K.fmtKey(r.days[r.days.length - 1].date) + ')' : '') + ' · values in ' + (r.unit === 'mmol' ? 'mmol/L' : 'mg/dL') + '.' });
    if (r.skipped) this.out.createDiv({ cls: 'hk-muted', text: K.plural(r.skipped, 'row') + ' could not be read and will be skipped.' });
    if (r.ambiguous) this.out.createDiv({ cls: 'hk-muted', text: 'Check how the dates are written in this file (above).' });
  }
  async run() {
    if (!this.res || this.res.error || !this.res.days.length) { new Notice('Choose a CGM export file first.'); return; }
    const n = await this.plugin.importDays(this.res.days, this.devC.value() || this.res.format, this.name);
    if (this.ordSel.value && this.res.ambiguous) { this.plugin.settings.dateOrder = this.ordSel.value; await this.plugin.saveSettings(); }
    new Notice('Imported ' + K.plural(n.added, 'reading') + ' into ' + K.plural(n.days, 'day') + '.');
    this.close();
  }
}

/* ---------------- Log modal ---------------- */
class ReadingModal extends K.FormModal {
  constructor(plugin, r, opts = {}) {
    super(plugin);
    this.existing = r || null;
    this.r = r ? Object.assign({}, r) : Object.assign({ date: K.todayKey(), time: K.nowTime(), mg: null, context: '', device: plugin.settings.devices[0] || '', medications: [], notes: '' }, opts.prefill || {});
  }
  onOpen() {
    const p = this.plugin, s = p.settings, r = this.r;
    this.begin(this.existing ? 'Edit glucose reading' : 'Log glucose reading');
    const main = this.section('Reading', 'droplets');
    this.unit = s.unit;
    const big = this.row(main);
    big.addClass('a1c-big');
    this.valIn = this.field(big, 'Glucose (' + this.unit + ')', 'number', r.mg == null ? '' : toUnit({ unit: this.unit }, r.mg), this.unit === 'mg/dL' ? { min: '20', max: '600', step: '1', placeholder: '110', inputmode: 'decimal' } : { min: '1', max: '33', step: '0.1', placeholder: '6.1', inputmode: 'decimal' });
    const sw = big.createDiv({ cls: 'hk-quick' });
    const swb = sw.createEl('button', { cls: 'mt-chip', text: this.unit === 'mg/dL' ? 'Enter as mmol/L' : 'Enter as mg/dL', attr: { type: 'button' } });
    swb.onclick = () => {
      const v = this.readMg();
      this.unit = this.unit === 'mg/dL' ? 'mmol/L' : 'mg/dL';
      this.valIn.hkLabel.setText('Glucose (' + this.unit + ')');
      this.valIn.step = this.unit === 'mg/dL' ? '1' : '0.1';
      this.valIn.value = v == null ? '' : String(toUnit({ unit: this.unit }, v));
      swb.setText(this.unit === 'mg/dL' ? 'Enter as mmol/L' : 'Enter as mg/dL');
      upd();
    };
    this.live = main.createDiv({ cls: 'a1c-live' });
    const upd = () => {
      this.live.empty();
      const v = this.readMg();
      if (v == null) return;
      const b = bandOf(v, targetOf(s));
      this.live.createSpan({ cls: 'gl-pill gl-' + b.id, text: b.label });
      this.live.createSpan({ cls: 'hk-muted', text: '  ' + fmtBoth(v) + ' · target ' + fmtRange(s, targetOf(s)) });
      if (v < VERY_LOW) this.live.createSpan({ cls: 'bp-live-warn', text: ' Very low. Treat it now (for example 15 g of fast-acting sugar), check again in 15 minutes, and get help if you can’t treat it yourself.' });
    };
    this.valIn.addEventListener('input', upd); upd();
    const when = this.row(main);
    this.dateIn = this.field(when, 'Date', 'date', r.date);
    this.timeIn = this.field(when, 'Time', 'time', r.time);
    const det = this.section('Details', 'clipboard-list');
    this.ctxC = this.chips(det, 'When', s.contexts, r.context, true);
    this.devC = this.chips(det, 'Device', s.devices, r.device, true);
    const medOpts = (p.medOptions ? p.medOptions() : []).slice();
    for (const m of s.medications) if (!medOpts.includes(m)) medOpts.push(m);
    this.medC = this.chips(det, 'Medication or insulin around this time', medOpts, r.medications);
    this.notesIn = this.area(det, 'Notes', r.notes, 'For example what you ate, exercise, illness or how you felt.', 2);
    this.footer({
      file: this.existing && this.existing.file,
      onDelete: this.existing ? async () => { await p.trash(this.existing.file); new Notice('Reading moved to trash.'); } : null,
      deleteTitle: 'Delete this reading?',
      extra: this.existing ? [] : [{ text: 'Save and add another', onClick: () => this.save(true) }],
      saveText: this.existing ? 'Save changes' : 'Save reading',
      onSave: () => this.save(false),
    });
    window.setTimeout(() => { if (!this.existing && this.valIn.focus) this.valIn.focus(); }, 30);
  }
  readMg() {
    const n = K.num(String(this.valIn.value).replace(',', '.'));
    if (n == null) return null;
    return this.unit === 'mg/dL' ? n : n * MG_PER_MMOL;
  }
  async save(again) {
    const p = this.plugin, s = p.settings;
    const mg = this.readMg(), date = K.normDate(this.dateIn.value), time = K.normTime(this.timeIn.value);
    if (mg == null || mg < 20 || mg > 600) { new Notice(this.unit === 'mg/dL' ? 'Enter a glucose value between 20 and 600 mg/dL.' : 'Enter a glucose value between 1.1 and 33.3 mmol/L.'); return; }
    if (!date) { new Notice('Choose a date.'); return; }
    const v = {
      entry: ENTRY, date, time, glucose_mg_dl: Math.round(mg), glucose_mmol_l: Math.round((mg / MG_PER_MMOL) * 10) / 10, context: this.ctxC.value(), device: this.devC.value(),
      medications: this.medC.values(), notes: this.notesIn.value.trim(), tags: ['glucose'],
    };
    p.remember('contexts', [v.context]); p.remember('devices', [v.device]); p.remember('medications', v.medications.filter((m) => !(p.medOptions && p.medOptions().includes(m))));
    await p.saveSettings();
    if (this.existing) await p.updateNote(this.existing.file, v);
    else await p.createNote(s.folder + '/Readings', date + ' ' + (time || '').replace(':', '') + ' Glucose', v, '');
    new Notice('Saved ' + fmtG(s, mg) + ' · ' + bandOf(mg, targetOf(s)).label + '.');
    this.close();
    if (again) new ReadingModal(p, null, { prefill: { date, device: v.device } }).open();
  }
}

/* ---------------- Charts ---------------- */
/** Daily pattern (ambulatory glucose profile): median line, 25–75% and 5–95% bands by hour of day */
function agpChart(parent, st, s) {
  const VW = 640, VH = 250, L = 34, R = 10, T = 12, B = 28, cw = VW - L - R, ch = VH - T - B;
  const t = st.target;
  const svg = K.svg('svg', { viewBox: '0 0 ' + VW + ' ' + VH, class: 'hk-chart gl-agp', role: 'img', 'aria-label': 'Glucose by time of day' }, parent);
  const top = Math.max(300, Math.ceil(Math.max(...st.agp.filter((a) => a.p95 != null).map((a) => a.p95), t.high + 40) / 50) * 50);
  const X = (h) => L + (h / 24) * cw;
  const Y = (mg) => T + ch - (Math.min(top, Math.max(40, mg)) - 40) / (top - 40) * ch;
  K.svg('rect', { x: L, y: Y(t.high), width: cw, height: Y(t.low) - Y(t.high), class: 'gl-band-target' }, svg);
  const ticks = s.unit === 'mg/dL' ? [54, 70, 180, 250].concat([t.low, t.high]) : [3, 3.9, 10, 13.9].map((x) => x * MG_PER_MMOL).concat([t.low, t.high]);
  for (const mg of [...new Set(ticks.map((x) => Math.round(x)))].filter((x) => x <= top && !(x < t.low && t.low - x < 25))) {
    K.svg('line', { x1: L, x2: L + cw, y1: Y(mg), y2: Y(mg), class: 'hk-gridline' }, svg);
    K.svg('text', { x: L - 5, y: Y(mg) + 4, 'text-anchor': 'end', class: 'hk-axis' }, svg).textContent = fmtG(s, mg, true);
  }
  for (let h = 0; h <= 24; h += 3) K.svg('text', { x: X(h), y: VH - 8, 'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle', class: 'hk-axis' }, svg).textContent = h === 24 ? '24:00' : K.pad(h) + ':00';
  const pts = st.agp.filter((a) => a.p50 != null).map((a) => Object.assign({ x: X(a.h + 0.5) }, a));
  const area = (lo, hi, cls) => { if (pts.length > 1) K.svg('polygon', { points: pts.map((p) => p.x + ',' + Y(p[hi])).concat(pts.slice().reverse().map((p) => p.x + ',' + Y(p[lo]))).join(' '), class: cls }, svg); };
  area('p5', 'p95', 'gl-agp-outer'); area('p25', 'p75', 'gl-agp-inner');
  if (pts.length > 1) K.svg('polyline', { points: pts.map((p) => p.x + ',' + Y(p.p50)).join(' '), class: 'gl-agp-median' }, svg);
  for (const p of pts) {
    const c = K.svg('circle', { cx: p.x, cy: Y(p.p50), r: 2.5, class: 'gl-agp-dot' }, svg);
    K.svg('title', {}, c).textContent = K.pad(p.h) + ':00–' + K.pad(p.h + 1) + ':00: median ' + fmtG(s, p.p50) + '\nMiddle half ' + fmtG(s, p.p25, true) + '–' + fmtG(s, p.p75) + '\n90% of readings ' + fmtG(s, p.p5, true) + '–' + fmtG(s, p.p95) + ' (' + K.plural(p.n, 'reading') + ')';
  }
  const lg = parent.createDiv({ cls: 'hk-legend' });
  for (const [cls, text] of [['gl-sw-median', 'Median'], ['gl-sw-inner', 'Middle 50% of readings'], ['gl-sw-outer', '90% of readings'], ['gl-sw-target', 'Target ' + fmtRange(s, t)]]) { const it = lg.createSpan({ cls: 'hk-legend-item' }); it.createSpan({ cls: 'hk-swatch ' + cls }); it.createSpan({ text }); }
}
/** One stacked bar of the five ranges, with the share and goal for each */
function tirBar(parent, st, s) {
  const wrap = parent.createDiv({ cls: 'gl-tir' });
  const bar = wrap.createDiv({ cls: 'gl-tir-bar' });
  const t = st.target;
  const label = { vhigh: 'Above ' + fmtG(s, VERY_HIGH), high: fmtG(s, t.high + 1, true) + '–' + fmtG(s, VERY_HIGH), in: fmtRange(s, t), low: fmtG(s, VERY_LOW, true) + '–' + fmtG(s, t.low - 1), vlow: 'Below ' + fmtG(s, VERY_LOW) };
  const goal = { vhigh: 'goal under 5%', high: 'goal under 25% with very high', in: 'goal over 70%', low: 'goal under 4% with very low', vlow: 'goal under 1%' };
  for (const b of BANDS.slice().reverse()) {
    const seg = bar.createDiv({ cls: 'gl-tir-seg gl-' + b.id });
    seg.style.flexGrow = String(Math.max(st.share[b.id], 0.0001));
    seg.setAttr('title', b.label + ' (' + label[b.id] + '): ' + fixed(st.share[b.id]) + ' · ' + goal[b.id]);
  }
  const list = wrap.createDiv({ cls: 'gl-tir-list' });
  for (const b of BANDS.slice().reverse()) {
    const row = list.createDiv({ cls: 'gl-tir-row' });
    row.createSpan({ cls: 'gl-dot gl-' + b.id });
    const nm = row.createDiv({ cls: 'gl-tir-name' });
    nm.createDiv({ text: b.label });
    nm.createDiv({ cls: 'hk-muted', text: label[b.id] });
    const v = row.createDiv({ cls: 'gl-tir-val' });
    v.createDiv({ cls: 'gl-tir-pct', text: fixed(st.share[b.id]) });
    v.createDiv({ cls: 'hk-muted', text: st.src === 'cgm' ? minsText(st.share[b.id]) : st.bands[b.id] + ' of ' + st.n });
  }
}

/* ---------------- Dashboard ---------------- */
class GlucoseRenderer {
  constructor(plugin, el) { this.plugin = plugin; this.el = el; this.range = plugin.settings.defaultRange || '14'; this.cal = { monthOffset: 0 }; this.showAll = false; }
  render() {
    const p = this.plugin, s = p.settings, el = this.el;
    el.empty(); el.addClass('hk-dashboard', 'gl-dashboard');
    const all = p.getRecords().slice().sort(sortAsc);
    const today = K.todayKey();
    const t = targetOf(s);
    const nMeter = all.filter((r) => r.kind === 'meter').length, nCgm = all.filter((r) => r.kind === 'cgm').length;
    K.header(el, 'Glucose', [nMeter ? K.plural(nMeter, 'meter reading') : '', nCgm ? K.plural(nCgm, 'day') + ' of CGM data' : '', 'target ' + fmtRange(s, t)].filter(Boolean).join(' · '), [
      { select: [['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time']], value: this.range, label: 'Period', onChange: (v) => { this.range = v; this.render(); } },
      { icon: 'download', text: 'CSV', onClick: () => p.exportCsv() },
      { icon: 'file-text', text: 'Doctor report', onClick: () => p.openReport() },
      { icon: 'upload', text: 'Import CGM', onClick: () => new ImportModal(p).open() },
      { icon: 'plus', text: 'Log reading', cta: true, onClick: () => new ReadingModal(p).open() },
    ]);
    if (!all.length) {
      K.emptyState(el, 'droplets', 'No glucose readings yet', 'Log finger-prick readings, or import the CSV export from your continuous glucose monitor (Dexcom, FreeStyle Libre and others). You will see your time in range, average glucose, lows and highs, your daily pattern and a report you can print for your doctor.', 'Log a reading', () => new ReadingModal(p).open());
      return;
    }
    const from = rangeFrom(this.range, all);
    const st = computeStats(all, s, from, today);
    if (st.latest && st.latest.mg < VERY_LOW && K.daysBetween(st.latest.date, today) <= 0) {
      const b = el.createDiv({ cls: 'hk-banner is-danger' });
      setIcon(b.createSpan({ cls: 'hk-btn-icon' }), 'alert-triangle');
      b.createSpan({ text: 'Your latest reading is very low (' + fmtG(s, st.latest.mg) + '). Treat it now, check again in 15 minutes, and get help if you can’t treat it yourself.' });
    }
    const tile = K.tiles(el);
    const L = st.latest;
    if (L) { const b = bandOf(L.mg, t); tile('Latest', fmtG(s, L.mg), b.label + ' · ' + (L.date === today ? 'today' : K.fmtKey(L.date)) + (L.min != null ? ' ' + hhmm(L.min) : '') + (L.src === 'cgm' ? ' · CGM' : ''), b.id === 'in' ? 'bp-tile-l0' : b.id === 'vlow' || b.id === 'low' ? 'bp-tile-l3' : 'bp-tile-l2'); }
    if (!st.n) {
      tile('Readings in period', '0', 'Choose a longer period');
    } else {
      tile('Time in range', fixed(st.share.in), fmtRange(s, t) + ' · goal over ' + GOALS.in + '%', st.share.in >= GOALS.in ? 'bp-tile-l0' : 'is-warn');
      tile('Average glucose', fmtG(s, st.mean), st.gmi != null ? 'GMI ' + st.gmi.toFixed(1) + '%' + (st.cgmDays < 14 ? ' (needs 14 days)' : '') : K.plural(st.n, 'reading'));
      const below = st.share.low + st.share.vlow;
      tile('Time below range', fixed(below), K.plural(st.lows.length, 'low') + ' · goal under ' + GOALS.low + '%', below >= GOALS.low || st.share.vlow >= GOALS.vlow ? 'bp-tile-l3' : '');
      const above = st.share.high + st.share.vhigh;
      tile('Time above range', fixed(above), 'Very high ' + fixed(st.share.vhigh) + ' · goal under ' + GOALS.high + '%', above >= GOALS.high ? 'bp-tile-l2' : '');
      tile('Variability (CV)', st.cv == null ? '–' : st.cv.toFixed(0) + '%', st.cv == null ? 'Needs more readings' : st.cv <= GOALS.cv ? 'Stable · goal 36% or less' : 'Unstable · goal 36% or less', st.cv != null && st.cv > GOALS.cv ? 'is-warn' : '');
    }
    const sub = st.src === 'cgm' ? 'From CGM data (' + K.plural(st.cgmDays, 'day') + ', worn ' + fixed(st.active) + ' of the time)' : 'From ' + K.plural(st.n, 'meter reading');
    const subLow = st.src === 'cgm' ? 'from CGM data' : 'from ' + K.plural(st.n, 'meter reading');
    const grid = el.createDiv({ cls: 'hk-grid gl-grid' });
    // Calendar on the left: each day coloured by its time in range (or average)
    const calCard = K.card(grid, null, null, 'hk-calendar gl-calendar');
    const allSt = computeStats(all, s, '', K.addDaysKey(today, 400));
    const dayMap = new Map(allSt.days.map((d) => [d.date, d]));
    K.monthCalendar(calCard, this.cal, () => this.render(), (k) => {
      const d = dayMap.get(k);
      if (!d) return null;
      const band = d.src === 'cgm' ? (d.tir >= GOALS.in ? 'in' : d.below >= GOALS.low ? 'low' : 'high') : bandOf(d.mean, t).id;
      const marks = d.below > 0 ? [{ cls: 'gl-low-mark' }] : [];
      return { cls: ['gl-day', 'gl-day-' + band], marks, tip: [d.src === 'cgm' ? 'In range ' + fixed(d.tir) + ' · average ' + fmtG(s, d.mean) : K.plural(d.n, 'reading') + ' · average ' + fmtG(s, d.mean), 'Lowest ' + fmtG(s, d.min) + ' · highest ' + fmtG(s, d.max)] };
    }, (evt, k) => this.dayMenu(evt, k, all), true);
    const lg = calCard.createDiv({ cls: 'hk-legend' });
    for (const [c, tx] of [['gl-in', 'In range (CGM: 70%+ of the day)'], ['gl-high', 'Mostly high'], ['gl-low', 'Lows'], ['gl-mark', 'A low that day']]) { const it = lg.createSpan({ cls: 'hk-legend-item' }); it.createSpan({ cls: 'hk-swatch ' + c }); it.createSpan({ text: tx }); }

    const tc = K.card(grid, 'Time in ranges', sub + ' · ' + (this.range === 'all' ? 'all time' : 'last ' + this.range + ' days'), 'gl-c-tir');
    if (st.n) tirBar(tc, st, s); else tc.createDiv({ cls: 'hk-muted', text: 'No readings in this period.' });

    const ac = K.card(grid, 'Daily pattern', 'Glucose by time of day, ' + subLow, 'gl-c-agp');
    if (st.agpHours >= 6) agpChart(ac, st, s);
    else ac.createDiv({ cls: 'hk-muted', text: 'Needs readings spread over the day (at least 3 readings in 6 or more different hours). Import CGM data or log readings at different times to see your daily pattern.' });

    const dc = K.card(grid, 'Daily average', 'Each day’s average, with the target range shaded', 'gl-c-avg');
    const dPts = st.days.map((d) => ({ key: d.date, y: toUnit(s, d.mean), title: K.fmtKey(d.date) + ': average ' + fmtG(s, d.mean) + (d.src === 'cgm' ? ' · in range ' + fixed(d.tir) : ' · ' + K.plural(d.n, 'reading')) + ' · ' + fmtG(s, d.min, true) + '–' + fmtG(s, d.max) }));
    if (dPts.length) {
      const mmol = s.unit !== 'mg/dL';
      const yMax = mmol ? Math.max(14, Math.ceil(Math.max(...dPts.map((x) => x.y)) + 1)) : Math.max(250, Math.ceil((Math.max(...dPts.map((x) => x.y)) + 20) / 50) * 50);
      K.lineChart(dc, { fromKey: from, toKey: today, yMin: mmol ? 2 : 40, yMax, yStep: mmol ? 2 : 50, label: 'Daily average glucose',
        bands: [{ from: toUnit(s, t.low), to: toUnit(s, t.high), cls: 'gl-band-target' }],
        refs: [{ y: toUnit(s, t.low), label: fmtG(s, t.low), cls: 'gl-ref' }, { y: toUnit(s, t.high), label: fmtG(s, t.high), cls: 'gl-ref' }],
        series: [{ name: 'Daily average', cls: 'gl-line', points: dPts }] });
    } else dc.createDiv({ cls: 'hk-muted', text: 'No readings in this period.' });

    const cc = K.card(grid, 'Meter readings by time', st.meter.length ? 'Average for each “when” you chose' : 'Choose “when” as you log meter readings to compare fasting, before and after meals', 'gl-c-ctx');
    if (st.contexts.length) K.hbars(cc, st.contexts.map((c) => [c.context, c.n, 'avg ' + fmtG(s, c.mean) + ' · ' + K.plural(c.n, 'reading')]), 0, { cls: 'gl-fill', limit: 9 });
    const lc = K.card(grid, 'Lows', st.lows.length ? K.plural(st.lows.length, 'low') + ' in this period' : 'No lows in this period', 'gl-c-lows');
    if (st.lows.length) {
      for (const ev of st.lows.slice(-6).reverse()) {
        const row = lc.createDiv({ cls: 'gl-low-row' });
        row.createSpan({ cls: 'gl-pill gl-' + (ev.nadir < VERY_LOW ? 'vlow' : 'low'), text: fmtG(s, ev.nadir) });
        row.createSpan({ text: ' ' + K.fmtKey(ev.date) + (ev.startMin != null ? ' ' + hhmm(ev.startMin) : '') + (ev.src === 'cgm' ? ' · ' + (ev.end - ev.start + 5) + ' min' : ' · meter') });
      }
    }

    // Tables
    const meterRs = st.recs.filter((r) => r.kind === 'meter').sort(sortAsc).reverse();
    if (meterRs.length) {
      el.createDiv({ cls: 'hk-section-heading', text: 'Meter readings in this period' });
      const box = el.createDiv({ cls: 'hk-card hk-table-card' });
      const tb = box.createEl('table', { cls: 'hk-table' });
      const hr = tb.createEl('thead').createEl('tr');
      for (const h of ['Date', 'Time', 'Glucose', 'When', 'Medication', 'Notes', '']) hr.createEl('th', { text: h });
      const body = tb.createEl('tbody');
      for (const r of (this.showAll ? meterRs : meterRs.slice(0, 25))) {
        const tr = body.createEl('tr');
        tr.createEl('td', { text: K.fmtKey(r.date) });
        tr.createEl('td', { text: r.time || '' });
        const b = bandOf(r.mg, t);
        tr.createEl('td').createSpan({ cls: 'gl-pill gl-' + b.id, text: fmtG(s, r.mg), attr: { title: b.label } });
        tr.createEl('td', { text: r.context || '' });
        tr.createEl('td', { text: r.medications.join(', ') });
        tr.createEl('td', { cls: 'hk-td-notes', text: r.notes || '' });
        const ed = tr.createEl('td').createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit reading' } });
        setIcon(ed, 'pencil');
        ed.onclick = () => new ReadingModal(p, r).open();
      }
      if (meterRs.length > 25) box.createEl('button', { cls: 'hk-small-btn', text: this.showAll ? 'Show fewer' : 'Show all ' + meterRs.length }).onclick = () => { this.showAll = !this.showAll; this.render(); };
    }
    const cgmDays = st.days.filter((d) => d.src === 'cgm').reverse();
    if (cgmDays.length) {
      el.createDiv({ cls: 'hk-section-heading', text: 'CGM days in this period' });
      const box = el.createDiv({ cls: 'hk-card hk-table-card' });
      const tb = box.createEl('table', { cls: 'hk-table' });
      const hr = tb.createEl('thead').createEl('tr');
      for (const h of ['Date', 'Readings', 'Average', 'Lowest', 'Highest', 'In range', 'Below', 'Above', '']) hr.createEl('th', { text: h });
      const body = tb.createEl('tbody');
      const recOf = new Map(st.recs.filter((r) => r.kind === 'cgm').map((r) => [r.date, r]));
      for (const d of cgmDays) {
        const tr = body.createEl('tr');
        tr.createEl('td', { text: K.fmtKey(d.date) });
        tr.createEl('td', { text: String(d.n - d.meter) });
        tr.createEl('td', { text: fmtG(s, d.mean) });
        tr.createEl('td', { text: fmtG(s, d.min, true) });
        tr.createEl('td', { text: fmtG(s, d.max, true) });
        tr.createEl('td').createSpan({ cls: 'gl-pill gl-' + (d.tir >= GOALS.in ? 'in' : 'high'), text: fixed(d.tir) });
        tr.createEl('td', { cls: d.below >= GOALS.low ? 'gl-text-low' : '', text: fixed(d.below) });
        tr.createEl('td', { text: fixed(d.above) });
        const op = tr.createEl('td').createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Open this day’s note' } });
        setIcon(op, 'file-text');
        const rec = recOf.get(d.date);
        op.onclick = () => { if (rec) this.plugin.app.workspace.getLeaf('tab').openFile(rec.file); };
      }
    }
  }
  dayMenu(evt, k, all) {
    const p = this.plugin, s = p.settings;
    const menu = new Menu();
    for (const r of all.filter((x) => x.date === k && x.kind === 'meter')) menu.addItem((it) => it.setTitle('Edit ' + (r.time || '') + ' · ' + fmtG(s, r.mg)).setIcon('pencil').onClick(() => new ReadingModal(p, r).open()));
    const day = all.find((x) => x.date === k && x.kind === 'cgm');
    if (day) menu.addItem((it) => it.setTitle('Open CGM data for ' + K.fmtShort(k)).setIcon('file-text').onClick(() => p.app.workspace.getLeaf('tab').openFile(day.file)));
    menu.addItem((it) => it.setTitle('Log reading · ' + K.fmtShort(k)).setIcon('plus').onClick(() => new ReadingModal(p, null, { prefill: { date: k, time: k === K.todayKey() ? K.nowTime() : '08:00' } }).open()));
    menu.showAtMouseEvent(evt);
  }
}

/* ---------------- PDF report ---------------- */
function buildReport(plugin, o) {
  const s = plugin.settings;
  const all = plugin.getRecords().slice().sort(sortAsc);
  const to = o.to || K.todayKey();
  const from = o.from || (all.length ? all[0].date : to);
  const st = computeStats(all, s, from, to);
  const t = st.target;
  const range = K.fmtKey(from) + ' – ' + K.fmtKey(to);
  const rgb = (h) => K.MI.hexRgb(h);
  const R = new K.Report('Glucose report', range, GL_HEX);
  R.cover([o.name ? 'Name: ' + o.name : '', 'Period: ' + range, 'Created ' + K.fmtKey(K.todayKey()), 'Target range: ' + fmtRange(s, t) + ' (' + fmtRange({ unit: s.unit === 'mg/dL' ? 'mmol/L' : 'mg/dL' }, t) + ', ' + t.name + ')']);
  if (!st.n) { R.para('No glucose readings were recorded in this period.'); R.footerAll('Glucose report · for discussion with a clinician, not a diagnosis'); return R.output(); }
  const both = (mg) => (s.unit === 'mg/dL' ? Math.round(mg) + ' mg/dL' : (mg / MG_PER_MMOL).toFixed(1) + ' mmol/L');
  const other = (mg) => (s.unit === 'mg/dL' ? (mg / MG_PER_MMOL).toFixed(1) + ' mmol/L' : Math.round(mg) + ' mg/dL');
  R.heading('Summary', st.src === 'cgm' ? 'From continuous glucose monitor (CGM) data' : 'From ' + K.plural(st.n, 'finger-prick meter reading'));
  const below = st.share.low + st.share.vlow, above = st.share.high + st.share.vhigh;
  const items = [
    ['Time in range', fixed(st.share.in), fmtRange(s, t) + ' · goal over 70%', { accent: rgb(BANDS[2].hex), valueColor: rgb(st.share.in >= GOALS.in ? BANDS[2].hex : BANDS[4].hex) }],
    ['Average glucose', both(st.mean), other(st.mean)],
    st.src === 'cgm' ? ['Glucose management indicator', st.gmi.toFixed(1) + '%', st.cgmDays >= 14 ? 'estimated A1C from ' + st.cgmDays + ' days' : 'only ' + st.cgmDays + ' days (14 recommended)'] : ['Readings', String(st.n), K.plural(st.days.length, 'day') + ' with readings'],
    ['Time below range', fixed(below), 'very low ' + fixed(st.share.vlow) + ' · goal under 4%', { valueColor: rgb(below >= GOALS.low ? BANDS[1].hex : '#2f9e6b') }],
    ['Time above range', fixed(above), 'very high ' + fixed(st.share.vhigh) + ' · goal under 25%', { valueColor: rgb(above >= GOALS.high ? BANDS[4].hex : '#2f9e6b') }],
    ['Variability (CV)', st.cv == null ? '–' : st.cv.toFixed(0) + '%', 'goal 36% or less' + (st.sd != null ? ' · SD ' + both(st.sd) : '')],
    ['Lows', String(st.lows.length), st.lows.length ? 'lowest ' + both(Math.min(...st.lows.map((e) => e.nadir))) : 'none in period'],
    ['Lowest · highest', both(st.min).replace(/ .*/, '') + ' · ' + both(st.max), ''],
    st.src === 'cgm' ? ['CGM wear', fixed(st.active), K.plural(st.cgmDays, 'day') + ' · ' + st.cgm.length.toLocaleString('en') + ' readings'] : ['Days with readings', String(st.days.length), ''],
  ];
  R.stats(items);
  R.note('Targets from the International Consensus on Time in Range (Battelino et al., Diabetes Care 2019) for most adults with type 1 or type 2 diabetes: over 70% in range, under 4% below 70 mg/dL (3.9 mmol/L), under 1% below 54 mg/dL (3.0 mmol/L), under 25% above 180 mg/dL (10.0 mmol/L), under 5% above 250 mg/dL (13.9 mmol/L). Goals differ for older adults, pregnancy and children.' + (st.src === 'meter' ? ' With finger-prick readings these shares are of readings, not of time.' : ''));

  // Time in ranges: one stacked bar with labels
  R.heading('Time in ranges', null, 110);
  R.ensure(110);
  const d = R.doc, x0 = R.M, bw = 46, top = R.y + 4, h = 92;
  let y = top + h;
  const segs = BANDS.map((b) => ({ b, v: st.share[b.id] }));
  for (const sg of segs) { const sh = (sg.v / 100) * h; if (sh > 0) d.rect(x0, y - sh, bw, sh, { fill: rgb(sg.b.hex) }); y -= sh; }
  const lbl = { vhigh: 'Above ' + both(VERY_HIGH), high: both(t.high + 1).replace(/ .*/, '') + '–' + both(VERY_HIGH), in: both(t.low).replace(/ .*/, '') + '–' + both(t.high), low: both(VERY_LOW).replace(/ .*/, '') + '–' + both(t.low - 1), vlow: 'Below ' + both(VERY_LOW) };
  const goal = { vhigh: 'goal <5%', high: 'goal <25% with very high', in: 'goal >70%', low: 'goal <4% with very low', vlow: 'goal <1%' };
  BANDS.slice().reverse().forEach((b, i) => {
    const ly = top + 10 + i * 18;
    d.rect(x0 + bw + 16, ly - 7, 8, 8, { fill: rgb(b.hex) });
    d.text(x0 + bw + 30, ly, b.label, { size: 8.5, bold: true });
    d.text(x0 + bw + 100, ly, lbl[b.id], { size: 8, color: K.RC.muted });
    d.text(x0 + bw + 260, ly, fixed(st.share[b.id]), { size: 9, bold: true, color: rgb(b.hex), align: 'right' });
    d.text(x0 + bw + 270, ly, st.src === 'cgm' ? minsText(st.share[b.id]) : st.bands[b.id] + ' of ' + st.n + ' readings', { size: 7.5, color: K.RC.muted });
    d.text(x0 + bw + 380, ly, goal[b.id], { size: 7.5, color: K.RC.muted });
  });
  R.y = top + h + 14;

  // Daily pattern
  if (st.agpHours >= 6) {
    R.heading('Daily pattern', 'Glucose by time of day: median, middle 50% and 90% of readings', 200);
    const ch = 170;
    R.ensure(ch + 30);
    const L = R.M + 34, Rx = R.M + R.W - 4, T = R.y + 4, B = R.y + ch - 18, cw = Rx - L, chh = B - T;
    const topMg = Math.max(300, Math.ceil(Math.max(...st.agp.filter((a) => a.p95 != null).map((a) => a.p95), t.high + 40) / 50) * 50);
    const X = (hh) => L + (hh / 24) * cw;
    const Y = (mg) => B - (Math.min(topMg, Math.max(40, mg)) - 40) / (topMg - 40) * chh;
    d.rect(L, Y(t.high), cw, Y(t.low) - Y(t.high), { fill: [0.9, 0.96, 0.92] });
    for (const mg of [VERY_LOW, t.low, t.high, VERY_HIGH].filter((m, i, a) => a.indexOf(m) === i)) { d.line(L, Y(mg), Rx, Y(mg), { color: K.RC.rule, width: 0.4 }); if (mg !== VERY_LOW || t.low - VERY_LOW > 25) d.text(L - 4, Y(mg) + 3, fmtG(s, mg, true), { size: 7, color: K.RC.muted, align: 'right' }); }
    for (let hh = 0; hh <= 24; hh += 3) d.text(X(hh), B + 12, K.pad(hh % 24) + ':00', { size: 7, color: K.RC.muted, align: hh === 0 ? undefined : hh === 24 ? 'right' : 'center' });
    // bands as thin slices (the PDF writer draws rectangles and lines)
    const pts = st.agp.filter((a) => a.p50 != null);
    for (const a of pts) {
      const xa = X(a.h), xb = X(a.h + 1);
      d.rect(xa, Y(a.p95), xb - xa, Y(a.p5) - Y(a.p95), { fill: [0.86, 0.9, 0.97] });
      d.rect(xa, Y(a.p75), xb - xa, Y(a.p25) - Y(a.p75), { fill: [0.6, 0.72, 0.92] });
    }
    for (let i = 1; i < pts.length; i++) if (pts[i].h === pts[i - 1].h + 1) d.line(X(pts[i - 1].h + 0.5), Y(pts[i - 1].p50), X(pts[i].h + 0.5), Y(pts[i].p50), { color: rgb('#1d3f8f'), width: 1.6 });
    R.y += ch + 6;
    let lx = R.M + 34;
    for (const [label, color] of [['Median', rgb('#1d3f8f')], ['Middle 50%', [0.6, 0.72, 0.92]], ['90% of readings', [0.86, 0.9, 0.97]], ['Target range', [0.9, 0.96, 0.92]]]) { d.rect(lx, R.y - 6, 8, 8, { fill: color }); d.text(lx + 12, R.y + 1, label, { size: 7.5, color: K.RC.muted }); lx += d.width(label, 7.5) + 30; }
    R.y += 18;
  }

  // Daily averages over the period
  if (st.days.length > 1) {
    R.heading('Daily average', null, 190);
    const mmol = s.unit !== 'mg/dL';
    const vals = st.days.map((x) => toUnit(s, x.mean));
    const yMax = mmol ? Math.max(14, Math.ceil(Math.max(...vals) + 1)) : Math.max(250, Math.ceil((Math.max(...vals) + 20) / 50) * 50);
    R.chart({ fromKey: from, toKey: to, yMin: mmol ? 2 : 40, yMax, yStep: mmol ? 2 : 50,
      bands: [{ from: toUnit(s, t.low), to: toUnit(s, t.high), color: [0.9, 0.96, 0.92] }],
      refs: [{ y: toUnit(s, t.low), label: fmtG(s, t.low), color: rgb(BANDS[1].hex) }, { y: toUnit(s, t.high), label: fmtG(s, t.high), color: rgb(BANDS[3].hex) }],
      series: [{ color: rgb(GL_HEX), points: st.days.map((x) => ({ key: x.date, y: toUnit(s, x.mean) })) }], legend: [['Daily average (' + s.unit + ')', rgb(GL_HEX)]] });
  }

  // Daily summary
  R.heading('Day by day');
  const days = st.days.slice().reverse();
  R.table([{ label: 'Date', w: 0.17 }, { label: 'Readings', w: 0.1, align: 'right' }, { label: 'Average', w: 0.14, align: 'right' }, { label: 'Lowest', w: 0.12, align: 'right' }, { label: 'Highest', w: 0.12, align: 'right' }, { label: 'In range', w: 0.12, align: 'right' }, { label: 'Below', w: 0.11, align: 'right' }, { label: 'Above', w: 0.12, align: 'right' }],
    days.map((x) => [K.fmtKey(x.date), String(x.n), fmtG(s, x.mean), fmtG(s, x.min, true), fmtG(s, x.max, true), fixed(x.tir), fixed(x.below), fixed(x.above)]), {
      boldColored: true,
      cellColor: (ri, ci) => { const x = days[ri]; if (ci === 6 && x.below > 0) return rgb(BANDS[1].hex); if (ci === 7 && x.above >= GOALS.high) return rgb(BANDS[4].hex); return null; },
      drawCell: (ri, ci, c) => {
        if (ci !== 5) return false;
        const x = days[ri];
        R.pill(c.x + c.w - c.pad, c.y + 1, fixed(x.tir), { fill: rgb(x.tir >= GOALS.in ? BANDS[2].hex : BANDS[3].hex), size: c.size, align: 'right', h: c.lh + 1 });
        return true;
      },
    });

  const meterRs = st.recs.filter((r) => r.kind === 'meter').sort(sortAsc).reverse();
  if (meterRs.length && o.includeReadings !== false) {
    R.heading('Meter readings');
    R.table([{ label: 'Date', w: 0.16 }, { label: 'Time', w: 0.08 }, { label: 'Glucose', w: 0.13, align: 'right' }, { label: 'Range', w: 0.12 }, { label: 'When', w: 0.15 }, { label: 'Medication, notes', w: 0.36, wrap: true }],
      meterRs.map((r) => [K.fmtKey(r.date), r.time || '', fmtG(s, r.mg), bandOf(r.mg, t).label, r.context || '', [r.medications.join(', '), r.notes].filter(Boolean).join('. ')]), {
        boldColored: true,
        cellColor: (ri, ci) => (ci === 3 ? rgb(bandOf(meterRs[ri].mg, t).hex) : null),
        drawCell: (ri, ci, c) => {
          if (ci !== 2) return false;
          const r = meterRs[ri];
          R.pill(c.x + c.w - c.pad, c.y + 1, fmtG(s, r.mg, true), { fill: rgb(bandOf(r.mg, t).hex), size: c.size, align: 'right', h: c.lh + 1 });
          return true;
        },
      });
  }
  if (st.contexts.length > 1) {
    R.heading('Meter readings by time');
    R.table([{ label: 'When', w: 0.4 }, { label: 'Readings', w: 0.2, align: 'right' }, { label: 'Average', w: 0.4, align: 'right' }], st.contexts.map((c) => [c.context, String(c.n), both(c.mean) + ' (' + other(c.mean) + ')']));
  }
  const cur = plugin.currentMeds ? plugin.currentMeds() : [];
  if (o.includeMeds && cur.length) {
    R.heading('Current medications');
    R.table([{ label: 'Medication', w: 0.32 }, { label: 'Dose and schedule', w: 0.36, wrap: true }, { label: 'For', w: 0.32, wrap: true }], cur.map((x) => [x.name, x.schedule, x.purpose]));
  }
  if (o.notes) { R.heading('Questions and notes'); R.para(o.notes); }
  if (plugin.reportExtras) R.extraSections(plugin.reportExtras({ from, to, includeNotes: o.includeGenNotes !== false, includeMissed: false }));
  R.footerAll('Glucose report · time in range targets from the International Consensus (2019) · for discussion with a clinician, not a diagnosis');
  return R.output();
}

/* ---------------- Settings ---------------- */
class GlucoseSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const c = this.containerEl, p = this.plugin, s = p.settings;
    c.empty();
    new Setting(c).setName('Folder').setDesc('Meter readings go in "<folder>/Readings", imported CGM days in "<folder>/CGM", reports in "<folder>/Reports".')
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.folder).setValue(s.folder).onChange(async (v) => { s.folder = v.trim() || DEFAULT_SETTINGS.folder; await p.saveSettings(); }));
    new Setting(c).setName('Unit').setDesc('mmol/L is used in most of Europe (including Iceland), Canada and Australia; mg/dL in the US. Reports show both.')
      .addDropdown((d) => d.addOptions({ 'mmol/L': 'mmol/L', 'mg/dL': 'mg/dL' }).setValue(s.unit).onChange(async (v) => { s.unit = v; await p.saveSettings(); }));
    new Setting(c).setName('Target range').setHeading();
    new Setting(c).setName('Range').setDesc('The standard range for most adults with diabetes is 70–180 mg/dL (3.9–10.0 mmol/L). Your doctor may give you a different one, for example in pregnancy.')
      .addDropdown((d) => d.addOptions(Object.fromEntries(Object.values(PRESETS).map((x) => [x.id, x.name]))).setValue(s.rangePreset || 'standard').onChange(async (v) => { s.rangePreset = v; await p.saveSettings(); this.display(); }));
    if (s.rangePreset === 'custom') {
      const unitIn = (key, label) => new Setting(c).setName(label + ' (' + s.unit + ')').addText((t) => {
        t.setValue(String(toUnit(s, s[key]))).onChange(async (v) => { const n = K.num(String(v).replace(',', '.')); if (n == null) return; const mg = s.unit === 'mg/dL' ? n : n * MG_PER_MMOL; if (mg >= 50 && mg <= 300) { s[key] = Math.round(mg); await p.saveSettings(); } });
        t.inputEl.type = 'number';
      });
      unitIn('customLow', 'Lower limit'); unitIn('customHigh', 'Upper limit');
    }
    new Setting(c).setName('Dashboard').setHeading();
    new Setting(c).setName('Default period').setDesc('Fourteen days is the usual period for a CGM report.')
      .addDropdown((d) => d.addOptions({ 7: 'Last 7 days', 14: 'Last 14 days', 30: 'Last 30 days', 90: 'Last 90 days', all: 'All time' }).setValue(String(s.defaultRange || '14')).onChange(async (v) => { s.defaultRange = v; await p.saveSettings(); }));
    new Setting(c).setName('Dates in CGM files').setDesc('How dates like 03-11-2026 are read when importing. Automatic works it out from the file when it can.')
      .addDropdown((d) => d.addOptions({ auto: 'Automatic', mdy: 'Month first', dmy: 'Day first' }).setValue(s.dateOrder || 'auto').onChange(async (v) => { s.dateOrder = v; await p.saveSettings(); }));
    new Setting(c).setName('Choice lists').setHeading();
    c.createEl('p', { cls: 'setting-item-description', text: 'Times (fasting, after meal…) and devices are edited under Settings → Health Dashboard → Selectors.' });
  }
}

/* ---------------- Plugin ---------------- */
class GlucosePlugin extends K.TrackerPlugin {
  async onload() {
    this.cfg = { viewType: VIEW_TYPE, title: 'Glucose', icon: 'droplets', defaults: DEFAULT_SETTINGS, listKeys: LIST_KEYS, Renderer: GlucoseRenderer, parse };
    await this.setup();
    this.addCommand({ id: 'log-reading', name: 'Log glucose reading', callback: () => new ReadingModal(this).open() });
    this.addCommand({ id: 'import-cgm', name: 'Import CGM data (CSV)', callback: () => new ImportModal(this).open() });
    this.addCommand({ id: 'pdf-report', name: 'Create PDF report for doctor', callback: () => this.openReport() });
    this.addCommand({
      id: 'edit-current', name: 'Edit this reading',
      checkCallback: (checking) => { const f = this.app.workspace.getActiveFile(); const r = f && this.recordFromFile(f); if (!r || r.kind !== 'meter') return false; if (!checking) new ReadingModal(this, r).open(); return true; },
    });
    this.addSettingTab(new GlucoseSettingTab(this.app, this));
  }
  stats(range) { const all = this.getRecords(); return computeStats(all, this.settings, rangeFrom(range || '14', all), K.todayKey()); }
  fmt(mg) { return fmtG(this.settings, mg); }
  /** Merge imported days into one note per day; returns { added, days } */
  async importDays(days, device, sourceName) {
    const folder = this.settings.folder + '/CGM';
    const existing = new Map(this.getRecords().filter((r) => r.kind === 'cgm').map((r) => [r.date, r]));
    let added = 0;
    for (const d of days) {
      const ex = existing.get(d.date);
      const map = new Map((ex ? ex.points : []).map((pt) => [pt.min, pt.mg]));
      const before = map.size;
      for (const pt of d.points) map.set(pt.min, pt.mg);
      const pts = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([min, mg]) => ({ min, mg }));
      added += map.size - before;
      const mean = K.mean(pts.map((x) => x.mg));
      const fm = { entry: DAY_ENTRY, date: d.date, device: device || '', source_file: sourceName || '', readings: pts.length, average_mg_dl: Math.round(mean), readings_mg_dl: encodePoints(pts), tags: ['glucose', 'cgm'] };
      if (ex) await this.updateNote(ex.file, fm);
      else await this.createNote(folder, d.date + ' CGM', fm, '# CGM readings · ' + K.fmtKey(d.date) + '\n\nImported from ' + (sourceName || 'a CGM export') + '. Times and values (mg/dL) are in the readings_mg_dl property.\n');
    }
    this.requestRefresh();
    return { added, days: days.length };
  }
  openReport() {
    new K.ReportOptionsModal(this, {
      title: 'Glucose report for your doctor', defaultRange: '30',
      toggles: [['includeReadings', 'Include each meter reading', true], ['includeMeds', 'Include current medications', true]],
      build: async (o) => {
        const { file, path } = await this.writeFile(this.settings.folder + '/Reports', 'Glucose report ' + (o.from || 'all') + ' to ' + o.to + '.pdf', buildReport(this, o), true);
        new Notice('Report saved to ' + path);
        return file;
      },
    }).open();
  }
  async exportCsv() {
    const rows = [['date', 'time', 'glucose_mg_dl', 'glucose_mmol_l', 'source', 'context', 'device', 'medications', 'notes']];
    for (const r of flatten(this.getRecords())) rows.push([r.date, r.min == null ? '' : hhmm(r.min), Math.round(r.mg), (r.mg / MG_PER_MMOL).toFixed(1), r.src === 'cgm' ? 'CGM' : 'meter', r.src === 'meter' ? r.rec.context : '', r.rec.device || '', r.src === 'meter' ? r.rec.medications.join('; ') : '', r.src === 'meter' ? r.rec.notes : '']);
    await this.exportRows(this.settings.folder, 'Glucose export', rows);
  }
}

module.exports = GlucosePlugin;
module.exports._internals = { VIEW_TYPE, DEFAULT_SETTINGS, ReadingModal, ImportModal, GlucoseRenderer, Renderer: GlucoseRenderer, parse, computeStats, parseCgmCsv, flatten, lowEvents, targetOf, bandOf, BANDS, PRESETS, GOALS, VERY_LOW, VERY_HIGH, MG_PER_MMOL, fmtG, fmtRange, fmtBoth, gmiOf, buildReport, sortAsc, rangeFrom, fixed, hhmm, GL_HEX, encodePoints };
