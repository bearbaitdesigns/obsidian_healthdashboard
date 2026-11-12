'use strict';
/*
 * Period Tracker for Obsidian
 * Log menstrual cycles as Markdown notes (YAML frontmatter), view a dashboard
 * with predictions and charts, and export a PDF report for your clinician.
 * Plain JavaScript, no build step and no dependencies beyond the Obsidian API.
 */
const obsidian = require('obsidian');
const {
  Plugin, ItemView, Modal, Notice, PluginSettingTab, Setting,
  TFile, normalizePath, setIcon, MarkdownRenderChild,
} = obsidian;

const VIEW_TYPE = 'period-tracker-dashboard';
const FLOWS = ['none', 'spotting', 'light', 'medium', 'heavy'];
const FLOW_LABEL = { none: 'None', spotting: 'Spotting', light: 'Light', medium: 'Medium', heavy: 'Heavy' };
const FLOW_SCORE = { none: 0, spotting: 1, light: 2, medium: 3, heavy: 4 };

const DEFAULT_SETTINGS = {
  logFolder: 'Period Tracker/Logs',
  reportFolder: 'Period Tracker/Reports',
  reportName: '',
  symptoms: ['Cramps', 'Bloating', 'Headache', 'Back pain', 'Breast tenderness', 'Fatigue', 'Acne',
    'Nausea', 'Diarrhea', 'Constipation', 'Clots', 'Cravings', 'Insomnia', 'Dizziness'],
  medications: ['Ibuprofen', 'Paracetamol', 'Naproxen', 'Hormonal contraceptive'],
  countSpotting: false,
  cyclesToAverage: 6,
  lutealPhase: 14,
  showPredictions: true,
  showFertile: true,
  weekStartsMonday: true,
  showStatusBar: true,
};

/* ------------------------------------------------------------------ */
/* Date helpers: days are integers (days since 1970-01-01, UTC based)  */
/* ------------------------------------------------------------------ */
const DAY_MS = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const pad2 = (n) => String(n).padStart(2, '0');

function toDayNum(s) {
  if (s instanceof Date) s = s.toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
}
function fromDayNum(n) {
  const d = new Date(n * DAY_MS);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}
function todayNum() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}
function fmtDate(n) {
  const d = new Date(n * DAY_MS);
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}
function fmtShort(n) {
  const d = new Date(n * DAY_MS);
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
}
function addMonths(day, months) {
  const d = new Date(day * DAY_MS);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()) / DAY_MS);
}

/* ------------------------------------------------------------------ */
/* Small numeric helpers                                               */
/* ------------------------------------------------------------------ */
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function stdev(a) {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}
const round1 = (x) => Math.round(x * 10) / 10;
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const PAIN_MAX = 5;
const PAIN_SEVERE = 4;
const PAIN_LABELS = ['No pain', 'Very mild', 'Mild', 'Moderate', 'Severe', 'Very severe'];
function painWord(p) {
  if (p == null) return 'not recorded';
  return PAIN_LABELS[Math.max(0, Math.min(PAIN_MAX, Math.round(p)))].toLowerCase();
}
function toList(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v).split(',').map((x) => x.trim()).filter(Boolean);
}
const hasItem = (list, item) => list.some((x) => x.toLowerCase() === item.toLowerCase());

/* ------------------------------------------------------------------ */
/* Cycle analysis                                                      */
/* ------------------------------------------------------------------ */
function analyze(entriesIn, s, today) {
  const entries = entriesIn.slice().sort((a, b) => a.day - b.day);
  const byDay = new Map();
  for (const e of entries) byDay.set(e.day, e);
  const isBleeding = (e) => !!e && (FLOW_SCORE[e.flow] >= 2 || (s.countSpotting && e.flow === 'spotting'));

  // Group bleeding days into periods (a single missing day does not split a period)
  const periods = [];
  let cur = null;
  for (const e of entries) {
    if (!isBleeding(e)) continue;
    if (cur && e.day - cur.end <= 2) cur.end = e.day;
    else { cur = { start: e.day, end: e.day }; periods.push(cur); }
  }
  periods.forEach((p, i) => {
    p.length = p.end - p.start + 1;
    p.cycleLength = i < periods.length - 1 ? periods[i + 1].start - p.start : null;
    let peak = 0, painSum = 0, painN = 0;
    const sym = {};
    for (let d = p.start; d <= p.end; d++) {
      const e = byDay.get(d);
      if (!e) continue;
      peak = Math.max(peak, FLOW_SCORE[e.flow]);
      if (e.pain != null) { painSum += e.pain; painN++; }
      for (const x of e.symptoms) sym[x] = (sym[x] || 0) + 1;
    }
    p.peakFlow = FLOWS[peak];
    p.avgPain = painN ? painSum / painN : null;
    p.topSymptoms = Object.entries(sym).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
  });

  const n = Math.max(1, s.cyclesToAverage | 0);
  const complete = periods.filter((p) => p.cycleLength != null);
  const recent = complete.slice(-n);
  const avgCycle = recent.length ? mean(recent.map((p) => p.cycleLength)) : null;
  const avgPeriod = periods.length ? mean(periods.slice(-n).map((p) => p.length)) : null;
  const last = periods.length ? periods[periods.length - 1] : null;

  const res = {
    entries, byDay, periods, complete, recent, avgCycle, avgPeriod, last, today, isBleeding,
    predicted: new Set(), fertile: new Set(), ovulation: new Set(), futureStarts: [],
  };
  if (last) {
    const cyc = Math.max(15, Math.round(avgCycle || 28));
    const plen = Math.max(1, Math.round(avgPeriod || 5));
    res.usedCycle = cyc;
    res.cycleEstimated = !avgCycle;
    res.ongoing = last.end >= today - 1 && last.start <= today;
    res.cycleDay = today >= last.start ? today - last.start + 1 : null;
    res.nextStart = last.start + cyc;
    res.daysUntil = res.nextStart - today;
    for (let k = 1; k <= 6; k++) {
      // If the period is late, project from today rather than into the past
      let st = last.start + cyc * k;
      if (k === 1 && st < today && !res.ongoing) st = today;
      else if (k > 1 && res.futureStarts.length) st = res.futureStarts[res.futureStarts.length - 1] + cyc;
      res.futureStarts.push(st);
      for (let d = st; d < st + plen; d++) if (d > last.end && d >= today) res.predicted.add(d);
      const ov = st - s.lutealPhase;
      if (ov > last.end) res.ovulation.add(ov);
      for (let d = ov - 5; d <= ov + 1; d++) if (d > last.end) res.fertile.add(d);
    }
  }
  return res;
}

/* Statistics for a date range, used by the report and dashboard insights */
function summarize(a, from, to) {
  const entries = a.entries.filter((e) => e.day >= from && e.day <= to);
  const periods = a.periods.filter((p) => p.start >= from && p.start <= to);
  const cycles = periods.filter((p) => p.cycleLength != null).map((p) => ({ start: p.start, len: p.cycleLength }));
  const lens = cycles.map((c) => c.len);
  const bleed = entries.filter(a.isBleeding);
  const pains = bleed.filter((e) => e.pain != null).map((e) => e.pain);
  const allPains = entries.filter((e) => e.pain != null).map((e) => e.pain);
  const count = (key) => {
    const m = {};
    for (const e of entries) for (const x of e[key]) m[x] = (m[x] || 0) + 1;
    return Object.entries(m).sort((x, y) => y[1] - x[1]);
  };
  const st = {
    from, to, entries, periods, cycles,
    nCycles: lens.length,
    avgCycle: lens.length ? mean(lens) : null,
    minCycle: lens.length ? Math.min(...lens) : null,
    maxCycle: lens.length ? Math.max(...lens) : null,
    sdCycle: stdev(lens),
    avgPeriod: periods.length ? mean(periods.map((p) => p.length)) : null,
    maxPeriod: periods.length ? Math.max(...periods.map((p) => p.length)) : null,
    avgPain: pains.length ? mean(pains) : null,
    maxPain: allPains.length ? Math.max(...allPains) : null,
    bleedDays: bleed.length,
    heavyDays: entries.filter((e) => e.flow === 'heavy').length,
    spottingDays: entries.filter((e) => e.flow === 'spotting').length,
    severePainDays: entries.filter((e) => e.pain != null && e.pain >= PAIN_SEVERE).length,
    symptoms: count('symptoms'), meds: count('medications'),
  };
  const flags = [];
  const short = cycles.filter((c) => c.len < 21);
  const long = cycles.filter((c) => c.len > 35);
  const longP = periods.filter((p) => p.length > 7);
  if (short.length) flags.push(plural(short.length, 'cycle') + ' shorter than 21 days (' + short.map((c) => c.len + ' d from ' + fmtShort(c.start)).join(', ') + ').');
  if (long.length) flags.push(plural(long.length, 'cycle') + ' longer than 35 days (' + long.map((c) => c.len + ' d from ' + fmtShort(c.start)).join(', ') + ').');
  if (longP.length) flags.push(plural(longP.length, 'period') + ' lasting more than 7 days (' + longP.map((p) => p.length + ' d from ' + fmtShort(p.start)).join(', ') + ').');
  if (lens.length >= 3 && st.maxCycle - st.minCycle > 7) flags.push('Cycle length varied by ' + (st.maxCycle - st.minCycle) + ' days (' + st.minCycle + ' to ' + st.maxCycle + ' days).');
  if (st.severePainDays) flags.push('Severe pain (' + PAIN_SEVERE + '/' + PAIN_MAX + ' or higher) recorded on ' + plural(st.severePainDays, 'day') + '.');
  if (st.heavyDays >= 3 * Math.max(1, periods.length) && periods.length) flags.push('Heavy flow on ' + plural(st.heavyDays, 'day') + ' across ' + plural(periods.length, 'period') + '.');
  st.flags = flags;
  return st;
}

/* ------------------------------------------------------------------ */
/* Minimal PDF writer (Helvetica, text, rectangles, lines)             */
/* ------------------------------------------------------------------ */
function pdfSanitize(str) {
  const s = String(str == null ? '' : str)
    .replace(/[–—−]/g, '-').replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"').replace(/…/g, '...').replace(/•/g, '-')
    .replace(/[\r\n\t]+/g, ' ');
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += (c >= 32 && c <= 126) || (c >= 160 && c <= 255) ? ch : '?';
  }
  return out;
}
function charWidth(ch) {
  if (ch === ' ') return 278;
  if ("il.,:;!|'`".includes(ch)) return 240;
  if ('fjtrI()[]-/'.includes(ch)) return 333;
  if ('mwMW%@'.includes(ch)) return 860;
  if (ch >= 'A' && ch <= 'Z') return 690;
  if (ch >= '0' && ch <= '9') return 556;
  return 540;
}
function textWidth(str, size, bold) {
  let w = 0;
  for (const ch of pdfSanitize(str)) w += charWidth(ch);
  return (w * size / 1000) * (bold ? 1.06 : 1);
}
function wrapText(str, maxW, size, bold) {
  const words = pdfSanitize(str).split(' ').filter((w) => w.length);
  const lines = [];
  let line = '';
  for (let w of words) {
    while (textWidth(w, size, bold) > maxW && w.length > 1) {
      // hard-break very long words
      let i = w.length - 1;
      while (i > 1 && textWidth(w.slice(0, i), size, bold) > maxW) i--;
      if (line) { lines.push(line); line = ''; }
      lines.push(w.slice(0, i));
      w = w.slice(i);
    }
    const t = line ? line + ' ' + w : w;
    if (textWidth(t, size, bold) <= maxW) line = t;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

class PDFWriter {
  constructor() {
    this.W = 595.28; this.H = 841.89; // A4 in points
    this.pages = [];
    this.addPage();
  }
  addPage() { this.ops = []; this.pages.push(this.ops); }
  static num(n) { return String(Math.round(n * 100) / 100); }
  static rgb(c) { return c.map((v) => PDFWriter.num(v)).join(' '); }
  text(x, y, str, o) {
    o = o || {};
    const size = o.size || 10;
    const s = pdfSanitize(str);
    const w = textWidth(s, size, o.bold);
    if (o.align === 'right') x -= w;
    else if (o.align === 'center') x -= w / 2;
    const esc = s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    this.ops.push('BT /' + (o.bold ? 'F2' : 'F1') + ' ' + PDFWriter.num(size) + ' Tf ' +
      PDFWriter.rgb(o.color || [0.13, 0.13, 0.15]) + ' rg ' + PDFWriter.num(x) + ' ' +
      PDFWriter.num(this.H - y) + ' Td (' + esc + ') Tj ET');
  }
  rect(x, y, w, h, fill, stroke, lw) {
    const r = PDFWriter.num(x) + ' ' + PDFWriter.num(this.H - y - h) + ' ' + PDFWriter.num(w) + ' ' + PDFWriter.num(h) + ' re';
    if (fill) this.ops.push(PDFWriter.rgb(fill) + ' rg ' + r + ' f');
    if (stroke) this.ops.push(PDFWriter.num(lw || 0.5) + ' w ' + PDFWriter.rgb(stroke) + ' RG ' + r + ' S');
  }
  line(x1, y1, x2, y2, color, lw, dash) {
    this.ops.push('q ' + (dash ? '[3 2] 0 d ' : '') + PDFWriter.num(lw || 0.5) + ' w ' +
      PDFWriter.rgb(color || [0, 0, 0]) + ' RG ' + PDFWriter.num(x1) + ' ' + PDFWriter.num(this.H - y1) +
      ' m ' + PDFWriter.num(x2) + ' ' + PDFWriter.num(this.H - y2) + ' l S Q');
  }
  toBytes(title) {
    const objs = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    let id = 5;
    const kids = [];
    for (const ops of this.pages) {
      const pid = id++, cid = id++;
      const content = ops.join('\n');
      objs[cid] = '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream';
      objs[pid] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + this.W + ' ' + this.H +
        '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cid + ' 0 R >>';
      kids.push(pid + ' 0 R');
    }
    objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
    const infoId = id++;
    const t = pdfSanitize(title || 'Report').replace(/[()\\]/g, '');
    objs[infoId] = '<< /Title (' + t + ') /Producer (Period Tracker for Obsidian) >>';
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    for (let i = 1; i < id; i++) {
      offsets[i] = out.length;
      out += i + ' 0 obj\n' + objs[i] + '\nendobj\n';
    }
    const xref = out.length;
    out += 'xref\n0 ' + id + '\n0000000000 65535 f \n';
    for (let i = 1; i < id; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    out += 'trailer\n<< /Size ' + id + ' /Root 1 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

/* ------------------------------------------------------------------ */
/* PDF report                                                          */
/* ------------------------------------------------------------------ */
function buildReport(a, opts) {
  const { from, to } = opts;
  const sum = summarize(a, from, to);
  const pdf = new PDFWriter();
  const W = pdf.W, H = pdf.H, M = 48, CW = W - 2 * M, BOTTOM = H - 60;
  const ACC = [0.62, 0.16, 0.30], ACC_L = [0.98, 0.92, 0.94], GREY = [0.42, 0.42, 0.46];
  const LINE = [0.85, 0.85, 0.87], ZEBRA = [0.97, 0.97, 0.98], OK = [0.88, 0.95, 0.90];
  const FLOWC = { spotting: [0.96, 0.75, 0.80], light: [0.92, 0.56, 0.64], medium: [0.85, 0.33, 0.44], heavy: [0.64, 0.13, 0.25] };
  const rangeLabel = fmtDate(from) + ' - ' + fmtDate(to);
  let y = 0;

  const header = (first) => {
    if (first) {
      pdf.rect(0, 0, W, 100, ACC);
      pdf.text(M, 46, 'Menstrual Cycle Report', { size: 22, bold: true, color: [1, 1, 1] });
      pdf.text(M, 70, (opts.name ? opts.name + '  ·  ' : '') + rangeLabel, { size: 11, color: [1, 1, 1] });
      pdf.text(W - M, 70, 'Generated ' + fmtDate(todayNum()), { size: 9, color: [1, 1, 1], align: 'right' });
      y = 126;
    } else {
      pdf.text(M, 34, 'Menstrual Cycle Report' + (opts.name ? '  ·  ' + opts.name : ''), { size: 9, bold: true, color: GREY });
      pdf.text(W - M, 34, rangeLabel, { size: 9, color: GREY, align: 'right' });
      pdf.line(M, 42, W - M, 42, LINE, 0.6);
      y = 62;
    }
  };
  const ensure = (h) => { if (y + h > BOTTOM) { pdf.addPage(); header(false); } };
  const section = (t, minBody) => {
    ensure(44 + (minBody || 40));
    y += 6;
    pdf.text(M, y + 12, t, { size: 13, bold: true, color: ACC });
    y += 19;
    pdf.line(M, y, W - M, y, ACC, 0.9);
    y += 12;
  };
  const para = (t, o) => {
    o = o || {};
    const size = o.size || 9.5, lh = size * 1.4;
    for (const ln of wrapText(t, CW - (o.indent || 0), size, o.bold)) {
      ensure(lh);
      pdf.text(M + (o.indent || 0), y + size, ln, { size, color: o.color, bold: o.bold });
      y += lh;
    }
  };
  const table = (cols, rows) => {
    const pad = 4, fs = 8.5, lh = 11;
    const fixed = cols.reduce((s, c) => s + (c.w || 0), 0);
    cols.forEach((c) => { if (!c.w) c.w = CW - fixed; });
    const head = () => {
      pdf.rect(M, y, CW, 18, ACC_L);
      let x = M;
      for (const c of cols) {
        pdf.text(c.align === 'right' ? x + c.w - pad : x + pad, y + 12, c.t, { size: 8.5, bold: true, align: c.align, color: ACC });
        x += c.w;
      }
      y += 18;
    };
    ensure(40);
    head();
    rows.forEach((r, i) => {
      const cells = r.map((v, j) => wrapText(v == null ? '' : String(v), cols[j].w - 2 * pad, fs, false));
      const n = Math.max(1, ...cells.map((l) => l.length));
      const h = n * lh + 7;
      if (y + h > BOTTOM) { pdf.addPage(); header(false); head(); }
      if (i % 2) pdf.rect(M, y, CW, h, ZEBRA);
      let x = M;
      cells.forEach((lines, j) => {
        const c = cols[j];
        if (c.swatch && FLOWC[String(r[j]).toLowerCase()]) {
          pdf.rect(x + pad, y + 5, 7, 7, FLOWC[String(r[j]).toLowerCase()]);
          lines.forEach((ln, k) => pdf.text(x + pad + 11, y + 3 + lh * (k + 1) - 1, ln, { size: fs }));
        } else {
          lines.forEach((ln, k) => pdf.text(c.align === 'right' ? x + c.w - pad : x + pad, y + 3 + lh * (k + 1) - 1, ln, { size: fs, align: c.align }));
        }
        x += c.w;
      });
      y += h;
    });
    pdf.line(M, y, W - M, y, LINE, 0.6);
    y += 12;
  };
  const freqBars = (items, total, max) => {
    const top = items.slice(0, max || 12);
    const labelW = 150, barMax = CW - labelW - 90, peak = top.length ? top[0][1] : 1;
    for (const [name, c] of top) {
      ensure(17);
      pdf.text(M, y + 10, name, { size: 9 });
      pdf.rect(M + labelW, y + 2, barMax, 10, ZEBRA);
      pdf.rect(M + labelW, y + 2, Math.max(2, barMax * c / peak), 10, ACC);
      pdf.text(W - M, y + 10, c + ' day' + (c === 1 ? '' : 's') + (total ? ' (' + Math.round(100 * c / total) + '%)' : ''), { size: 8.5, color: GREY, align: 'right' });
      y += 17;
    }
    y += 6;
  };

  header(true);

  /* Summary */
  section('Summary', 120);
  const v = (x, unit) => (x == null ? '-' : round1(x) + (unit || ''));
  const kv = [
    ['Days logged', String(sum.entries.length)],
    ['Periods recorded', String(sum.periods.length)],
    ['Complete cycles', String(sum.nCycles)],
    ['Average cycle length', v(sum.avgCycle, ' days')],
    ['Shortest / longest cycle', sum.nCycles ? sum.minCycle + ' / ' + sum.maxCycle + ' days' : '-'],
    ['Cycle variability (SD)', sum.sdCycle == null ? '-' : '±' + round1(sum.sdCycle) + ' days'],
    ['Average period length', v(sum.avgPeriod, ' days')],
    ['Longest period', sum.maxPeriod == null ? '-' : sum.maxPeriod + ' days'],
    ['Bleeding days', String(sum.bleedDays)],
    ['Heavy-flow days', String(sum.heavyDays)],
    ['Average pain on bleeding days', sum.avgPain == null ? '-' : round1(sum.avgPain) + ' / ' + PAIN_MAX],
    ['Highest pain recorded', sum.maxPain == null ? '-' : sum.maxPain + ' / ' + PAIN_MAX + ' (' + painWord(sum.maxPain) + ')'],
  ];
  if (a.last && to >= a.today && opts.showPredictions) {
    kv.push(['Last period started', fmtDate(a.last.start)]);
    kv.push(['Next period (estimate)', fmtDate(a.futureStarts[0] != null ? a.futureStarts[0] : a.nextStart)]);
  }
  const colW = CW / 2;
  kv.forEach(([k, val], i) => {
    const col = i % 2;
    if (col === 0) ensure(20);
    const x = M + col * colW;
    pdf.text(x, y + 12, k, { size: 9, color: GREY });
    pdf.text(x + colW - 14, y + 12, val, { size: 10, bold: true, align: 'right' });
    if (col === 1 || i === kv.length - 1) { pdf.line(M, y + 18, W - M, y + 18, LINE, 0.4); y += 20; }
  });
  y += 6;

  /* Patterns */
  section('Patterns to discuss', 50);
  if (sum.flags.length) {
    for (const f of sum.flags) {
      ensure(14);
      pdf.rect(M, y + 4, 4, 4, ACC);
      const lines = wrapText(f, CW - 14, 9.5);
      lines.forEach((ln) => { ensure(13.3); pdf.text(M + 12, y + 9.5, ln, { size: 9.5 }); y += 13.3; });
      y += 2;
    }
  } else {
    para('No cycles outside 21-35 days, no periods longer than 7 days and no severe pain were recorded in this range.');
  }
  para('Reference ranges are general guidance for adults and are not a diagnosis. Discuss any concerns with a clinician.', { size: 8, color: GREY });
  y += 6;

  /* Cycle length chart */
  if (sum.cycles.length) {
    section('Cycle length', 190);
    const cyc = sum.cycles.slice(-24);
    const cx = M + 28, cw = CW - 36, ch = 140, top = y + 6;
    const maxV = Math.max(40, ...cyc.map((c) => c.len)) + 5;
    const Y = (val) => top + ch - (val / maxV) * ch;
    pdf.rect(cx, Y(35), cw, Y(21) - Y(35), OK);
    for (let t = 0; t <= maxV; t += 10) {
      pdf.line(cx, Y(t), cx + cw, Y(t), LINE, 0.4);
      pdf.text(cx - 5, Y(t) + 3, String(t), { size: 7.5, color: GREY, align: 'right' });
    }
    const slot = cw / cyc.length, bw = Math.min(26, slot * 0.62);
    const every = Math.ceil(cyc.length / 12);
    cyc.forEach((c, i) => {
      const bx = cx + slot * i + (slot - bw) / 2;
      const out = c.len < 21 || c.len > 35;
      pdf.rect(bx, Y(c.len), bw, top + ch - Y(c.len), out ? [0.85, 0.45, 0.2] : ACC);
      pdf.text(bx + bw / 2, Y(c.len) - 3, String(c.len), { size: 7.5, align: 'center' });
      if (i % every === 0) pdf.text(bx + bw / 2, top + ch + 11, fmtShort(c.start), { size: 7, color: GREY, align: 'center' });
    });
    if (sum.avgCycle) {
      pdf.line(cx, Y(sum.avgCycle), cx + cw, Y(sum.avgCycle), [0.2, 0.2, 0.25], 0.8, true);
      pdf.text(cx + cw, Y(sum.avgCycle) - 3, 'avg ' + round1(sum.avgCycle), { size: 7.5, align: 'right', color: [0.2, 0.2, 0.25] });
    }
    y = top + ch + 20;
    pdf.rect(M, y, 8, 8, OK); pdf.text(M + 12, y + 7, '21-35 day reference range', { size: 7.5, color: GREY });
    pdf.rect(M + 130, y, 8, 8, [0.85, 0.45, 0.2]); pdf.text(M + 142, y + 7, 'outside range', { size: 7.5, color: GREY });
    pdf.text(M + 220, y + 7, 'Bars are labelled with the cycle start date.', { size: 7.5, color: GREY });
    y += 22;
  }

  /* Period history */
  section('Period history', 60);
  if (sum.periods.length) {
    table([
      { t: 'Start', w: 70 }, { t: 'End', w: 70 }, { t: 'Days', w: 36, align: 'right' },
      { t: 'Cycle', w: 42, align: 'right' }, { t: 'Peak flow', w: 70, swatch: true },
      { t: 'Avg pain', w: 50, align: 'right' }, { t: 'Most common symptoms' },
    ], sum.periods.map((p) => [
      fmtDate(p.start), fmtDate(p.end), p.length, p.cycleLength == null ? 'current' : p.cycleLength,
      FLOW_LABEL[p.peakFlow], p.avgPain == null ? '-' : round1(p.avgPain), p.topSymptoms.join(', ') || '-',
    ]));
  } else {
    para('No periods were recorded in this range.');
  }

  /* Symptoms, medications */
  const n = sum.entries.length;
  if (sum.symptoms.length) { section('Symptoms', 60); para('Share of logged days on which each symptom was recorded.', { size: 8, color: GREY }); y += 4; freqBars(sum.symptoms, n, 14); }
  if (sum.meds.length) { section('Medications', 60); freqBars(sum.meds, n, 10); }

  /* Daily log */
  if (opts.includeLog) {
    const rows = sum.entries.filter((e) => e.flow !== 'none' || e.pain != null || e.symptoms.length || e.medications.length || e.notes);
    section('Daily log', 60);
    if (!rows.length) para('No daily entries in this range.');
    else {
      const cols = [{ t: 'Date', w: 66 }, { t: 'Flow', w: 62, swatch: true }, { t: 'Pain', w: 32, align: 'right' }, { t: 'Symptoms', w: opts.includeNotes ? 150 : 0 }, { t: 'Medication', w: opts.includeNotes ? 84 : 120 }];
      // exactly one column is left without a width and takes the remaining space
      if (opts.includeNotes) cols.push({ t: 'Notes' });
      else cols[3].w = 0;
      table(cols, rows.map((e) => {
        const r = [fmtDate(e.day), FLOW_LABEL[e.flow], e.pain == null ? '-' : e.pain, e.symptoms.join(', ') || '-', e.medications.join(', ') || '-'];
        if (opts.includeNotes) r.push(e.notes || '');
        return r;
      }));
    }
  }

  /* Footers */
  const total = pdf.pages.length;
  pdf.pages.forEach((ops, i) => {
    pdf.ops = ops;
    pdf.line(M, H - 40, W - M, H - 40, LINE, 0.5);
    pdf.text(M, H - 27, 'Self-reported data recorded in Obsidian with Period Tracker. Not a diagnostic tool.', { size: 7.5, color: GREY });
    pdf.text(W - M, H - 27, 'Page ' + (i + 1) + ' of ' + total, { size: 7.5, color: GREY, align: 'right' });
  });
  return pdf.toBytes('Menstrual Cycle Report ' + fromDayNum(from) + ' to ' + fromDayNum(to));
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}
function iconButton(parent, icon, label, onClick, cta) {
  const b = parent.createEl('button', { cls: 'pt-btn' + (cta ? ' mod-cta' : '') });
  setIcon(b.createSpan({ cls: 'pt-btn-icon' }), icon);
  b.createSpan({ text: label });
  b.addEventListener('click', onClick);
  return b;
}

/* ------------------------------------------------------------------ */
/* Dashboard renderer (used by the view and the code block)            */
/* ------------------------------------------------------------------ */
class DashboardRenderer {
  constructor(plugin, el) {
    this.plugin = plugin;
    this.el = el;
    this.monthOffset = 0;
  }
  render() {
    const p = this.plugin, s = p.settings, el = this.el;
    el.empty();
    el.addClass('pt-dashboard');
    const a = p.getAnalysis();
    const today = a.today;

    const head = el.createDiv({ cls: 'pt-header' });
    head.createEl('h2', { text: 'Period tracker' });
    const actions = head.createDiv({ cls: 'pt-actions' });
    iconButton(actions, 'plus', 'Log day', () => new LogModal(p.app, p, today).open(), true);
    iconButton(actions, 'droplet', 'Period started', () => p.quickStart());
    iconButton(actions, 'file-text', 'PDF report', () => new ReportModal(p.app, p).open());

    if (!a.entries.length) {
      const empty = el.createDiv({ cls: 'pt-card pt-empty' });
      empty.createEl('p', { text: 'No logs yet. Use "Log day" or "Period started" to record your first entry. Each day is saved as a note in "' + s.logFolder + '".' });
    }

    this.renderCards(el, a);
    const grid = el.createDiv({ cls: 'pt-grid' });
    this.renderCalendar(grid, a);
    this.renderCycleChart(grid, a);
    this.renderSymptoms(grid, a);
    this.renderInsights(grid, a);
    this.renderHistory(el, a);
  }

  renderCards(el, a) {
    const s = this.plugin.settings;
    const cards = el.createDiv({ cls: 'pt-cards' });
    const card = (label, value, sub, cls) => {
      const c = cards.createDiv({ cls: 'pt-stat' + (cls ? ' ' + cls : '') });
      c.createDiv({ cls: 'pt-stat-label', text: label });
      c.createDiv({ cls: 'pt-stat-value', text: value });
      if (sub) c.createDiv({ cls: 'pt-stat-sub', text: sub });
    };
    if (a.last && a.cycleDay) {
      if (a.ongoing) card('Today', 'Period day ' + (a.today - a.last.start + 1), 'Started ' + fmtShort(a.last.start), 'is-accent');
      else card('Today', 'Cycle day ' + a.cycleDay, 'Last period ' + fmtShort(a.last.start));
    } else card('Today', '-', 'Log a period to begin');

    if (s.showPredictions && a.last) {
      const next = a.ongoing ? a.futureStarts[0] : a.nextStart;
      const du = next - a.today;
      const est = a.cycleEstimated ? ' · 28-day default' : '';
      if (a.ongoing) card('Next period', 'in ' + plural(du, 'day'), fmtDate(next) + est);
      else if (du > 0) card('Next period', 'in ' + plural(du, 'day'), fmtDate(next) + est);
      else if (du === 0) card('Next period', 'Expected today', fmtDate(next) + est);
      else card('Next period', plural(-du, 'day') + ' late', 'Expected ' + fmtDate(next) + est, 'is-warn');
    }
    card('Average cycle', a.avgCycle ? round1(a.avgCycle) + ' days' : '-',
      a.recent.length ? 'Last ' + plural(a.recent.length, 'cycle') + ' · ' + Math.min(...a.recent.map((x) => x.cycleLength)) + '-' + Math.max(...a.recent.map((x) => x.cycleLength)) + ' d' : 'Needs 2 periods');
    card('Average period', a.avgPeriod ? round1(a.avgPeriod) + ' days' : '-', a.periods.length ? plural(a.periods.length, 'period') + ' logged' : '');
    if (s.showFertile && a.last) {
      const ov = [...a.ovulation].filter((d) => d + 1 >= a.today).sort((x, y) => x - y)[0];
      if (ov != null) card('Fertile window (estimate)', fmtShort(ov - 5) + ' - ' + fmtShort(ov + 1), 'Not reliable for contraception');
    }
  }

  renderCalendar(grid, a) {
    const p = this.plugin, s = p.settings;
    const box = grid.createDiv({ cls: 'pt-card pt-calendar' });
    const now = new Date(a.today * DAY_MS);
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + this.monthOffset, 1));
    const y = base.getUTCFullYear(), m = base.getUTCMonth();
    const nav = box.createDiv({ cls: 'pt-cal-nav' });
    const prev = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Previous month' } });
    setIcon(prev, 'chevron-left');
    prev.onclick = () => { this.monthOffset--; this.render(); };
    nav.createDiv({ cls: 'pt-cal-title', text: MONTHS_LONG[m] + ' ' + y });
    const todayBtn = nav.createEl('button', { cls: 'pt-cal-today', text: 'Today' });
    todayBtn.onclick = () => { this.monthOffset = 0; this.render(); };
    const next = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Next month' } });
    setIcon(next, 'chevron-right');
    next.onclick = () => { this.monthOffset++; this.render(); };

    const cal = box.createDiv({ cls: 'pt-cal-grid' });
    const names = s.weekStartsMonday ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    for (const nm of names) cal.createDiv({ cls: 'pt-cal-head', text: nm });
    const first = Math.floor(Date.UTC(y, m, 1) / DAY_MS);
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const dow = new Date(first * DAY_MS).getUTCDay();
    const offset = s.weekStartsMonday ? (dow + 6) % 7 : dow;
    for (let i = 0; i < offset; i++) cal.createDiv({ cls: 'pt-cal-day is-blank' });
    for (let i = 0; i < dim; i++) {
      const d = first + i;
      const e = a.byDay.get(d);
      const cell = cal.createDiv({ cls: 'pt-cal-day' });
      cell.createSpan({ cls: 'pt-cal-num', text: String(i + 1) });
      const tip = [fmtDate(d)];
      if (e && e.flow !== 'none') { cell.addClass('flow-' + e.flow); tip.push('Flow: ' + FLOW_LABEL[e.flow]); }
      else if (s.showPredictions && a.predicted.has(d)) { cell.addClass('is-predicted'); tip.push('Predicted period'); }
      else if (s.showFertile && a.fertile.has(d) && d >= a.today) { cell.addClass('is-fertile'); tip.push('Estimated fertile window'); }
      if (s.showFertile && a.ovulation.has(d) && d >= a.today) { cell.addClass('is-ovulation'); tip.push('Estimated ovulation'); }
      if (e && (e.symptoms.length || e.pain || e.medications.length || e.notes)) {
        cell.createSpan({ cls: 'pt-cal-dot' });
        if (e.pain != null) tip.push('Pain: ' + e.pain + '/' + PAIN_MAX + ' (' + painWord(e.pain) + ')');
        if (e.symptoms.length) tip.push(e.symptoms.join(', '));
      }
      if (d === a.today) cell.addClass('is-today');
      if (d > a.today) cell.addClass('is-future');
      cell.setAttr('aria-label', tip.join('\n'));
      cell.onclick = () => new LogModal(p.app, p, d).open();
    }
    const legend = box.createDiv({ cls: 'pt-legend' });
    const li = (cls, label) => { const x = legend.createSpan({ cls: 'pt-legend-item' }); x.createSpan({ cls: 'pt-swatch ' + cls }); x.createSpan({ text: label }); };
    li('flow-light', 'Light'); li('flow-medium', 'Medium'); li('flow-heavy', 'Heavy'); li('flow-spotting', 'Spotting');
    if (s.showPredictions) li('is-predicted', 'Predicted');
    if (s.showFertile) li('is-fertile', 'Fertile (est.)');
  }

  renderCycleChart(grid, a) {
    const box = grid.createDiv({ cls: 'pt-card' });
    box.createEl('h4', { text: 'Cycle length' });
    const cyc = a.complete.slice(-12);
    if (!cyc.length) { box.createEl('p', { cls: 'pt-muted', text: 'Log at least two periods to see cycle lengths.' }); return; }
    const VW = 600, VH = 230, L = 34, R = 10, T = 16, B = 34, cw = VW - L - R, ch = VH - T - B;
    const svg = svgEl('svg', { viewBox: '0 0 ' + VW + ' ' + VH, class: 'pt-chart', role: 'img', 'aria-label': 'Cycle length chart' }, box);
    const maxV = Math.max(40, ...cyc.map((c) => c.cycleLength)) + 5;
    const Y = (v) => T + ch - (v / maxV) * ch;
    svgEl('rect', { x: L, y: Y(35), width: cw, height: Y(21) - Y(35), class: 'pt-band' }, svg);
    for (let t = 0; t <= maxV; t += 10) {
      svgEl('line', { x1: L, x2: L + cw, y1: Y(t), y2: Y(t), class: 'pt-gridline' }, svg);
      svgEl('text', { x: L - 6, y: Y(t) + 4, 'text-anchor': 'end', class: 'pt-axis' }, svg).textContent = t;
    }
    const slot = cw / cyc.length, bw = Math.min(34, slot * 0.6);
    cyc.forEach((c, i) => {
      const x = L + slot * i + (slot - bw) / 2;
      const out = c.cycleLength < 21 || c.cycleLength > 35;
      const r = svgEl('rect', { x, y: Y(c.cycleLength), width: bw, height: T + ch - Y(c.cycleLength), rx: 3, class: 'pt-bar' + (out ? ' is-out' : '') }, svg);
      svgEl('title', {}, r).textContent = fmtDate(c.start) + ': ' + c.cycleLength + ' days';
      svgEl('text', { x: x + bw / 2, y: Y(c.cycleLength) - 5, 'text-anchor': 'middle', class: 'pt-val' }, svg).textContent = c.cycleLength;
      svgEl('text', { x: x + bw / 2, y: VH - 12, 'text-anchor': 'middle', class: 'pt-axis' }, svg).textContent = fmtShort(c.start);
    });
    if (a.avgCycle) {
      svgEl('line', { x1: L, x2: L + cw, y1: Y(a.avgCycle), y2: Y(a.avgCycle), class: 'pt-avg' }, svg);
      svgEl('text', { x: L + cw, y: Y(a.avgCycle) - 5, 'text-anchor': 'end', class: 'pt-axis' }, svg).textContent = 'avg ' + round1(a.avgCycle);
    }
    box.createEl('p', { cls: 'pt-muted pt-small', text: 'Shaded band: 21-35 days (common adult range). Orange bars fall outside it.' });
  }

  renderSymptoms(grid, a) {
    const box = grid.createDiv({ cls: 'pt-card' });
    box.createEl('h4', { text: 'Symptoms · last 6 months' });
    const sum = summarize(a, addMonths(a.today, -6), a.today);
    if (!sum.symptoms.length) { box.createEl('p', { cls: 'pt-muted', text: 'No symptoms logged in the last 6 months.' }); return; }
    const peak = sum.symptoms[0][1];
    for (const [name, c] of sum.symptoms.slice(0, 10)) {
      const row = box.createDiv({ cls: 'pt-hbar' });
      row.createDiv({ cls: 'pt-hbar-label', text: name });
      const track = row.createDiv({ cls: 'pt-hbar-track' });
      track.createDiv({ cls: 'pt-hbar-fill', attr: { style: 'width:' + Math.max(3, 100 * c / peak) + '%' } });
      row.createDiv({ cls: 'pt-hbar-count', text: String(c) });
    }
    if (sum.avgPain != null) box.createEl('p', { cls: 'pt-muted pt-small', text: 'Average pain on bleeding days: ' + round1(sum.avgPain) + '/' + PAIN_MAX + ' (' + painWord(Math.round(sum.avgPain)) + ').' });
  }

  renderInsights(grid, a) {
    const box = grid.createDiv({ cls: 'pt-card' });
    box.createEl('h4', { text: 'Patterns · last 12 months' });
    const sum = summarize(a, addMonths(a.today, -12), a.today);
    if (!sum.periods.length) { box.createEl('p', { cls: 'pt-muted', text: 'Nothing to show yet.' }); return; }
    if (!sum.flags.length) box.createEl('p', { text: 'No cycles outside 21-35 days, no periods over 7 days and no severe pain recorded.' });
    else { const ul = box.createEl('ul', { cls: 'pt-flags' }); for (const f of sum.flags) ul.createEl('li', { text: f }); }
    box.createEl('p', { cls: 'pt-muted pt-small', text: 'General reference ranges, not a diagnosis. The PDF report collects these for your clinician.' });
  }

  renderHistory(el, a) {
    if (!a.periods.length) return;
    const box = el.createDiv({ cls: 'pt-card' });
    box.createEl('h4', { text: 'Recent periods' });
    const t = box.createEl('table', { cls: 'pt-table' });
    const hr = t.createEl('thead').createEl('tr');
    for (const h of ['Start', 'Days', 'Cycle', 'Peak flow', 'Avg pain', 'Symptoms']) hr.createEl('th', { text: h });
    const tb = t.createEl('tbody');
    for (const p of a.periods.slice(-8).reverse()) {
      const r = tb.createEl('tr');
      const startCell = r.createEl('td');
      const link = startCell.createEl('a', { text: fmtDate(p.start), href: '#' });
      link.onclick = (ev) => { ev.preventDefault(); new LogModal(this.plugin.app, this.plugin, p.start).open(); };
      r.createEl('td', { text: String(p.length) });
      r.createEl('td', { text: p.cycleLength == null ? 'current' : String(p.cycleLength) });
      const fc = r.createEl('td');
      fc.createSpan({ cls: 'pt-swatch flow-' + p.peakFlow });
      fc.createSpan({ text: ' ' + FLOW_LABEL[p.peakFlow] });
      r.createEl('td', { text: p.avgPain == null ? '-' : String(round1(p.avgPain)) });
      r.createEl('td', { text: p.topSymptoms.join(', ') || '-' });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Views and modals                                                    */
/* ------------------------------------------------------------------ */
class DashboardView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Period dashboard'; }
  getIcon() { return 'droplet'; }
  async onOpen() {
    this.renderer = new DashboardRenderer(this.plugin, this.contentEl);
    this.plugin.renderers.add(this.renderer);
    this.renderer.render();
  }
  async onClose() { this.plugin.renderers.delete(this.renderer); }
}

class BlockChild extends MarkdownRenderChild {
  constructor(el, plugin) { super(el); this.plugin = plugin; this.renderer = new DashboardRenderer(plugin, el); }
  onload() { this.plugin.renderers.add(this.renderer); this.renderer.render(); }
  onunload() { this.plugin.renderers.delete(this.renderer); }
}

function blankState(day) {
  return { day, flow: 'none', pain: null, symptoms: [], medications: [], notes: '' };
}
function entryToState(e) {
  return { day: e.day, flow: e.flow, pain: e.pain, symptoms: e.symptoms.slice(),
    medications: e.medications.slice(), notes: e.notes };
}

class LogModal extends Modal {
  constructor(app, plugin, day) { super(app); this.plugin = plugin; this.day = day; }
  onOpen() { this.modalEl.addClass('pt-log-modal'); this.load(this.day); }
  onClose() { this.contentEl.empty(); }
  load(day) {
    this.day = day;
    this.existing = this.plugin.getEntryByDay(day);
    this.st = this.existing ? entryToState(this.existing) : blankState(day);
    this.draw();
  }
  section(title) {
    const sec = this.contentEl.createDiv({ cls: 'pt-field' });
    sec.createDiv({ cls: 'pt-field-label', text: title });
    return sec;
  }
  draw() {
    const c = this.contentEl, st = this.st, s = this.plugin.settings;
    c.empty();
    this.titleEl.setText(this.existing ? 'Edit log' : 'Log day');

    const dsec = this.section('Date');
    const drow = dsec.createDiv({ cls: 'pt-row' });
    const di = drow.createEl('input', { type: 'date' });
    di.value = fromDayNum(this.day);
    di.onchange = () => { const d = toDayNum(di.value); if (d != null) this.load(d); };
    if (this.existing) drow.createSpan({ cls: 'pt-muted pt-small', text: 'Editing the saved entry for this day' });

    const fsec = this.section('Flow');
    const seg = fsec.createDiv({ cls: 'pt-segment' });
    for (const f of FLOWS) {
      const b = seg.createEl('button', { cls: 'pt-flow-btn', text: FLOW_LABEL[f] });
      b.createSpan({ cls: 'pt-swatch flow-' + f });
      if (st.flow === f) b.addClass('is-active');
      b.onclick = () => {
        st.flow = f;
        seg.querySelectorAll('button').forEach((x) => x.removeClass('is-active'));
        b.addClass('is-active');
      };
    }

    const psec = this.section('Pain');
    const pseg = psec.createDiv({ cls: 'pt-pain-select', attr: { role: 'radiogroup', 'aria-label': 'Pain level' } });
    const painOptions = [null];
    for (let i = 0; i <= PAIN_MAX; i++) painOptions.push(i);
    for (const val of painOptions) {
      const b = pseg.createEl('button', { cls: 'pt-pain-opt' + (val == null ? ' is-unset' : ' pain-' + val), attr: { role: 'radio' } });
      b.createDiv({ cls: 'pt-pain-num', text: val == null ? '–' : String(val) });
      b.createDiv({ cls: 'pt-pain-word', text: val == null ? 'Not recorded' : PAIN_LABELS[val] });
      const on = st.pain === val;
      b.toggleClass('is-active', on);
      b.setAttr('aria-checked', String(on));
      b.onclick = () => {
        st.pain = val;
        pseg.querySelectorAll('button').forEach((x) => { x.removeClass('is-active'); x.setAttr('aria-checked', 'false'); });
        b.addClass('is-active');
        b.setAttr('aria-checked', 'true');
      };
    }

    this.chips('Symptoms', 'symptoms', s.symptoms);
    this.chips('Medication', 'medications', s.medications);

    const nsec = this.section('Notes');
    const ta = nsec.createEl('textarea', { cls: 'pt-notes', attr: { rows: '3', placeholder: 'Anything worth remembering' } });
    ta.value = st.notes || '';
    ta.oninput = () => { st.notes = ta.value; };

    const btns = c.createDiv({ cls: 'pt-modal-buttons' });
    if (this.existing) {
      const del = btns.createEl('button', { text: 'Delete', cls: 'mod-warning' });
      let armed = false;
      del.onclick = async () => {
        if (!armed) { armed = true; del.setText('Click again to delete'); return; }
        await this.plugin.deleteEntry(this.existing);
        new Notice('Log for ' + fmtDate(this.day) + ' moved to trash');
        this.close();
      };
      const open = btns.createEl('button', { text: 'Open note' });
      open.onclick = () => { this.app.workspace.getLeaf('tab').openFile(this.existing.file); this.close(); };
    }
    btns.createDiv({ cls: 'pt-spacer' });
    const cancel = btns.createEl('button', { text: 'Cancel' });
    cancel.onclick = () => this.close();
    const save = btns.createEl('button', { text: 'Save', cls: 'mod-cta' });
    save.onclick = async () => {
      try {
        await this.plugin.saveEntry(st);
        new Notice('Saved log for ' + fmtDate(st.day));
        this.close();
      } catch (err) {
        console.error(err);
        new Notice('Could not save: ' + err.message);
      }
    };
  }
  chips(title, key, options) {
    const sec = this.section(title);
    const wrap = sec.createDiv({ cls: 'pt-chips' });
    const st = this.st;
    const draw = () => {
      wrap.empty();
      const all = options.slice();
      for (const x of st[key]) if (!hasItem(all, x)) all.push(x);
      for (const opt of all) {
        const on = hasItem(st[key], opt);
        const chip = wrap.createEl('button', { cls: 'pt-chip' + (on ? ' is-active' : ''), text: opt });
        chip.onclick = () => {
          if (hasItem(st[key], opt)) st[key] = st[key].filter((x) => x.toLowerCase() !== opt.toLowerCase());
          else st[key].push(opt);
          draw();
        };
      }
      const add = wrap.createEl('input', { type: 'text', cls: 'pt-chip-add', attr: { placeholder: '+ add' } });
      add.onkeydown = (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const v = add.value.trim();
        if (v && !hasItem(st[key], v)) st[key].push(v);
        draw();
        const again = wrap.querySelector('.pt-chip-add');
        if (again) again.focus();
      };
    };
    draw();
  }
}

class ReportModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    const p = this.plugin, s = p.settings, c = this.contentEl;
    const today = todayNum();
    const first = p.getAnalysis().entries[0];
    const o = { name: s.reportName, range: '6', from: addMonths(today, -6), to: today, includeLog: true, includeNotes: false };
    this.titleEl.setText('Create PDF report');
    const custom = [];
    new Setting(c).setName('Name on report').setDesc('Optional. Shown in the header.')
      .addText((t) => t.setValue(o.name).onChange((v) => { o.name = v; }));
    new Setting(c).setName('Date range')
      .addDropdown((d) => d.addOptions({ '3': 'Last 3 months', '6': 'Last 6 months', '12': 'Last 12 months', all: 'All data', custom: 'Custom range' })
        .setValue(o.range).onChange((v) => { o.range = v; custom.forEach((x) => x.settingEl.toggle(v === 'custom')); }));
    const mkDate = (label, key) => {
      const st = new Setting(c).setName(label).addText((t) => {
        t.inputEl.type = 'date';
        t.setValue(fromDayNum(o[key]));
        t.onChange((v) => { const d = toDayNum(v); if (d != null) o[key] = d; });
      });
      st.settingEl.toggle(false);
      custom.push(st);
    };
    mkDate('From', 'from');
    mkDate('To', 'to');
    new Setting(c).setName('Include daily log').setDesc('A table of every logged day.').addToggle((t) => t.setValue(o.includeLog).onChange((v) => { o.includeLog = v; }));
    new Setting(c).setName('Include notes').setDesc('Adds your free-text notes to the daily log.').addToggle((t) => t.setValue(o.includeNotes).onChange((v) => { o.includeNotes = v; }));
    new Setting(c).addButton((b) => b.setButtonText('Create report').setCta().onClick(async () => {
      if (o.range === 'all') { o.from = first ? first.day : today; o.to = today; }
      else if (o.range !== 'custom') { o.to = today; o.from = addMonths(today, -parseInt(o.range, 10)); }
      if (o.from > o.to) { new Notice('The start date is after the end date.'); return; }
      b.setDisabled(true);
      try { await p.generateReport(o); this.close(); }
      catch (err) { console.error(err); new Notice('Report failed: ' + err.message); b.setDisabled(false); }
    }));
  }
  onClose() { this.contentEl.empty(); }
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
class PeriodSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const c = this.containerEl, p = this.plugin, s = p.settings;
    c.empty();
    const save = async () => { await p.saveSettings(); p.requestRefresh(); };

    new Setting(c).setName('Log folder').setDesc('One note per logged day is stored here (YYYY-MM-DD.md).')
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.logFolder).setValue(s.logFolder).onChange(async (v) => { s.logFolder = v.trim() || DEFAULT_SETTINGS.logFolder; await save(); }));
    new Setting(c).setName('Report folder').setDesc('PDF reports are saved here.')
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.reportFolder).setValue(s.reportFolder).onChange(async (v) => { s.reportFolder = v.trim() || DEFAULT_SETTINGS.reportFolder; await save(); }));
    new Setting(c).setName('Default name on report').addText((t) => t.setValue(s.reportName).onChange(async (v) => { s.reportName = v; await save(); }));

    new Setting(c).setName('Cycle calculations').setHeading();
    new Setting(c).setName('Count spotting as period').setDesc('When off, spotting days are logged but do not start or extend a period.')
      .addToggle((t) => t.setValue(s.countSpotting).onChange(async (v) => { s.countSpotting = v; await save(); }));
    new Setting(c).setName('Cycles to average').setDesc('How many recent cycles are used for averages and predictions.')
      .addSlider((sl) => sl.setLimits(2, 12, 1).setValue(s.cyclesToAverage).setDynamicTooltip().onChange(async (v) => { s.cyclesToAverage = v; await save(); }));
    new Setting(c).setName('Luteal phase length').setDesc('Days from ovulation to the next period, used for the fertile-window estimate. 14 is typical.')
      .addSlider((sl) => sl.setLimits(10, 16, 1).setValue(s.lutealPhase).setDynamicTooltip().onChange(async (v) => { s.lutealPhase = v; await save(); }));
    new Setting(c).setName('Show period predictions').addToggle((t) => t.setValue(s.showPredictions).onChange(async (v) => { s.showPredictions = v; await save(); }));
    new Setting(c).setName('Show fertile window estimate').setDesc('A calendar estimate only. It is not reliable for preventing or planning pregnancy.')
      .addToggle((t) => t.setValue(s.showFertile).onChange(async (v) => { s.showFertile = v; await save(); }));
    new Setting(c).setName('Week starts on Monday').addToggle((t) => t.setValue(s.weekStartsMonday).onChange(async (v) => { s.weekStartsMonday = v; await save(); }));
    new Setting(c).setName('Show cycle day in status bar').addToggle((t) => t.setValue(s.showStatusBar).onChange(async (v) => { s.showStatusBar = v; await save(); }));

    new Setting(c).setName('Tracking options').setHeading();
    const list = (name, key) => new Setting(c).setName(name).setDesc('One per line. You can also add items on the fly in the log window.')
      .addTextArea((t) => {
        t.setValue(s[key].join('\n'));
        t.inputEl.rows = 6;
        t.onChange(async (v) => { s[key] = v.split(/\n|,/).map((x) => x.trim()).filter(Boolean); await save(); });
      });
    list('Symptoms', 'symptoms');
    list('Medications', 'medications');
  }
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */
class PeriodTrackerPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.renderers = new Set();
    this._analysis = null;

    this.registerView(VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
    this.addRibbonIcon('droplet', 'Open period dashboard', () => this.activateView());

    this.addCommand({ id: 'open-dashboard', name: 'Open dashboard', callback: () => this.activateView() });
    this.addCommand({ id: 'log-today', name: 'Log today', callback: () => new LogModal(this.app, this, todayNum()).open() });
    this.addCommand({ id: 'period-started', name: 'Period started today', callback: () => this.quickStart() });
    this.addCommand({ id: 'pdf-report', name: 'Create PDF report', callback: () => new ReportModal(this.app, this).open() });
    this.addCommand({ id: 'export-csv', name: 'Export all logs as CSV', callback: () => this.exportCsv() });

    this.registerMarkdownCodeBlockProcessor('period-tracker', (src, el, ctx) => {
      ctx.addChild(new BlockChild(el, this));
    });

    this.addSettingTab(new PeriodSettingTab(this.app, this));

    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('pt-status');
    this.statusEl.onclick = () => this.activateView();

    const watch = (f) => { if (f && this.inLogFolder(f.path)) this.requestRefresh(); };
    this.registerEvent(this.app.metadataCache.on('changed', watch));
    this.registerEvent(this.app.vault.on('delete', watch));
    this.registerEvent(this.app.vault.on('rename', (f, old) => { if (this.inLogFolder(f.path) || this.inLogFolder(old)) this.requestRefresh(); }));
    this.app.workspace.onLayoutReady(() => this.requestRefresh());
    // re-evaluate "today" every 30 minutes so the cycle day rolls over at midnight
    this.registerInterval(window.setInterval(() => { if (this._analysis && this._analysis.today !== todayNum()) this.requestRefresh(); }, 30 * 60 * 1000));
  }

  onunload() { if (this._timer) window.clearTimeout(this._timer); }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    for (const k of ['symptoms', 'medications']) this.settings[k] = toList(this.settings[k]);
  }
  async saveSettings() { await this.saveData(this.settings); }

  inLogFolder(path) {
    const folder = normalizePath(this.settings.logFolder);
    return !!path && path.startsWith(folder + '/') && path.endsWith('.md');
  }

  requestRefresh() {
    if (this._timer) window.clearTimeout(this._timer);
    this._timer = window.setTimeout(() => {
      this._analysis = null;
      for (const r of this.renderers) { try { r.render(); } catch (e) { console.error('Period tracker render failed', e); } }
      this.updateStatusBar();
    }, 250);
  }

  parseEntry(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache && cache.frontmatter;
    if (!fm) return null;
    if (fm.type && fm.type !== 'period-log') return null;
    const day = toDayNum(fm.date != null ? fm.date : file.basename);
    if (day == null) return null;
    let flow = String(fm.flow == null ? 'none' : fm.flow).toLowerCase().trim();
    if (!FLOWS.includes(flow)) flow = 'none';
    let pain = fm.pain === '' || fm.pain == null ? null : Number(fm.pain);
    if (pain != null && !isFinite(pain)) pain = null;
    if (pain != null) pain = Math.max(0, Math.min(PAIN_MAX, Math.round(pain)));
    return {
      day, file, flow, pain,
      symptoms: toList(fm.symptoms),
      medications: toList(fm.medications),
      notes: fm.notes == null ? '' : String(fm.notes),
    };
  }

  getEntries() {
    const map = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.inLogFolder(f.path)) continue;
      const e = this.parseEntry(f);
      if (e) map.set(e.day, e);
    }
    return [...map.values()].sort((a, b) => a.day - b.day);
  }
  getEntryByDay(day) { return this.getEntries().find((e) => e.day === day) || null; }

  getAnalysis() {
    const t = todayNum();
    if (!this._analysis || this._analysis.today !== t) this._analysis = analyze(this.getEntries(), this.settings, t);
    return this._analysis;
  }

  async ensureFolder(path) {
    const parts = normalizePath(path).split('/');
    let cur = '';
    for (const part of parts) {
      cur = cur ? cur + '/' + part : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        try { await this.app.vault.createFolder(cur); } catch (e) { /* created concurrently */ }
      }
    }
  }

  async saveEntry(st) {
    const folder = normalizePath(this.settings.logFolder);
    await this.ensureFolder(folder);
    const existing = this.getEntryByDay(st.day);
    let file = existing ? existing.file : null;
    if (!file) {
      const path = normalizePath(folder + '/' + fromDayNum(st.day) + '.md');
      const af = this.app.vault.getAbstractFileByPath(path);
      file = af instanceof TFile ? af : await this.app.vault.create(path, '');
    }
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.type = 'period-log';
      fm.date = fromDayNum(st.day);
      fm.flow = st.flow;
      if (st.pain == null) delete fm.pain; else fm.pain = st.pain;
      fm.symptoms = st.symptoms;
      fm.medications = st.medications;
      if (st.notes && st.notes.trim()) fm.notes = st.notes.trim(); else delete fm.notes;
    });
    this.requestRefresh();
  }

  async deleteEntry(entry) {
    if (this.app.fileManager.trashFile) await this.app.fileManager.trashFile(entry.file);
    else await this.app.vault.trash(entry.file, true);
    this.requestRefresh();
  }

  async quickStart() {
    const t = todayNum();
    const e = this.getEntryByDay(t);
    const st = e ? entryToState(e) : blankState(t);
    if (FLOW_SCORE[st.flow] < 2) st.flow = 'medium';
    await this.saveEntry(st);
    new Notice('Period start logged for today (' + FLOW_LABEL[st.flow].toLowerCase() + ' flow). Click the day in the calendar to add details.');
  }

  async activateView() {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = ws.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    ws.revealLeaf(leaf);
  }

  updateStatusBar() {
    if (!this.statusEl) return;
    const a = this.getAnalysis();
    if (!this.settings.showStatusBar || !a.last || !a.cycleDay) { this.statusEl.setText(''); this.statusEl.hide(); return; }
    this.statusEl.show();
    let t = a.ongoing ? 'Period day ' + (a.today - a.last.start + 1) : 'Cycle day ' + a.cycleDay;
    if (this.settings.showPredictions && !a.ongoing) {
      if (a.daysUntil > 0) t += ' · next in ' + a.daysUntil + 'd';
      else if (a.daysUntil === 0) t += ' · due today';
      else t += ' · ' + (-a.daysUntil) + 'd late';
    }
    this.statusEl.setText(t);
  }

  async uniquePath(base, ext) {
    let path = normalizePath(base + '.' + ext), i = 2;
    while (this.app.vault.getAbstractFileByPath(path)) path = normalizePath(base + ' (' + (i++) + ').' + ext);
    return path;
  }

  async generateReport(o) {
    const a = this.getAnalysis();
    const bytes = buildReport(a, Object.assign({ showPredictions: this.settings.showPredictions }, o));
    const folder = normalizePath(this.settings.reportFolder);
    await this.ensureFolder(folder);
    const path = await this.uniquePath(folder + '/Period report ' + fromDayNum(o.from) + ' to ' + fromDayNum(o.to), 'pdf');
    const file = await this.app.vault.createBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    new Notice('Report saved to ' + path);
    await this.app.workspace.getLeaf('tab').openFile(file);
  }

  async exportCsv() {
    const esc = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['date', 'flow', 'pain', 'symptoms', 'medications', 'notes']];
    for (const e of this.getEntries()) rows.push([fromDayNum(e.day), e.flow, e.pain, e.symptoms.join('; '), e.medications.join('; '), e.notes]);
    const folder = normalizePath(this.settings.reportFolder);
    await this.ensureFolder(folder);
    const path = await this.uniquePath(folder + '/Period export ' + fromDayNum(todayNum()), 'csv');
    await this.app.vault.create(path, rows.map((r) => r.map(esc).join(',')).join('\n') + '\n');
    new Notice('Exported ' + (rows.length - 1) + ' entries to ' + path);
  }
}

module.exports = PeriodTrackerPlugin;
module.exports.default = PeriodTrackerPlugin;
module.exports._internals = { analyze, summarize, buildReport, toDayNum, fromDayNum, todayNum, addMonths };
