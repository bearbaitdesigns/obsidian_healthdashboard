/* Blood pressure: readings as notes, statistics, charts and a PDF report for your doctor. */
const K = KitModule;
const { Notice, PluginSettingTab, Setting, setIcon, Menu } = require('obsidian');

const VIEW_TYPE = 'blood-pressure-dashboard';
const ENTRY = 'bp-reading';
const DEFAULT_SETTINGS = {
  folder: 'Blood Pressure',
  guideline: 'esc-home',
  useDoctorTarget: false,
  targetSys: null,
  targetDia: null,
  defaultRange: '30',
  reportName: '',
  arms: ['Left arm', 'Right arm', 'Left wrist', 'Right wrist'],
  positions: ['Sitting', 'Standing', 'Lying down'],
  contexts: ['Before medication', 'After medication', 'After exercise', 'After caffeine', 'After a meal', 'Stressed', 'In pain', 'Feeling unwell', 'At the clinic'],
  medications: [],
};
const LIST_KEYS = ['arms', 'positions', 'contexts', 'medications'];

/* Categories. level: 0 normal → 4 very high (used for colours) */
const VERY_HIGH = { id: 'very-high', label: 'Very high', level: 4, test: (s, d) => s >= 180 || d >= 120 };
const GUIDELINES = {
  'esc-home': {
    name: 'ESC 2024 (European) · home readings', target: [135, 85],
    note: 'Home thresholds from the 2024 ESC guideline: non-elevated below 120/70, elevated 120–134 or 70–84, hypertension 135/85 or higher.',
    cats: [VERY_HIGH,
      { id: 'hypertension', label: 'Hypertension range', level: 3, test: (s, d) => s >= 135 || d >= 85 },
      { id: 'elevated', label: 'Elevated', level: 1, test: (s, d) => s >= 120 || d >= 70 },
      { id: 'normal', label: 'Non-elevated', level: 0, test: () => true }],
    sysLines: [120, 135], diaLines: [70, 85],
  },
  'esc-office': {
    name: 'ESC 2024 (European) · clinic readings', target: [140, 90],
    note: 'Office thresholds from the 2024 ESC guideline: non-elevated below 120/70, elevated 120–139 or 70–89, hypertension 140/90 or higher.',
    cats: [VERY_HIGH,
      { id: 'hypertension', label: 'Hypertension range', level: 3, test: (s, d) => s >= 140 || d >= 90 },
      { id: 'elevated', label: 'Elevated', level: 1, test: (s, d) => s >= 120 || d >= 70 },
      { id: 'normal', label: 'Non-elevated', level: 0, test: () => true }],
    sysLines: [120, 140], diaLines: [70, 90],
  },
  aha: {
    name: 'ACC/AHA 2025 (American)', target: [130, 80],
    note: 'Categories from the 2025 ACC/AHA guideline: normal below 120/80, elevated 120–129 with diastolic below 80, stage 1 130–139 or 80–89, stage 2 140/90 or higher.',
    cats: [VERY_HIGH,
      { id: 'stage2', label: 'Stage 2 range', level: 3, test: (s, d) => s >= 140 || d >= 90 },
      { id: 'stage1', label: 'Stage 1 range', level: 2, test: (s, d) => s >= 130 || d >= 80 },
      { id: 'elevated', label: 'Elevated', level: 1, test: (s) => s >= 120 },
      { id: 'normal', label: 'Normal', level: 0, test: () => true }],
    sysLines: [120, 130, 140], diaLines: [80, 90],
  },
};
const LEVEL_RGB = ['#2f9e6b', '#c9a227', '#e08a2b', '#d1495b', '#7f1d1d'].map((h) => K.MI.hexRgb(h));
const guide = (s) => GUIDELINES[s.guideline] || GUIDELINES['esc-home'];
const classify = (s, r) => guide(s).cats.find((c) => c.test(r.sys, r.dia));
const doctorTarget = (s) => !!(s.useDoctorTarget && (s.targetSys || s.targetDia));
const target = (s) => (doctorTarget(s) ? [s.targetSys || guide(s).target[0], s.targetDia || guide(s).target[1]] : guide(s).target.slice());
const targetLabel = (s) => (doctorTarget(s) ? 'your doctor\u2019s target' : 'the guideline threshold');
function partOfDay(t) {
  if (!t) return '';
  const h = Number(t.slice(0, 2));
  if (h >= 4 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17) return 'Evening';
  return 'Night';
}

function parseReading(file, fm) {
  if (!fm || String(fm.entry || '').toLowerCase() !== ENTRY) return null;
  const date = K.normDate(fm.date), sys = K.num(fm.systolic), dia = K.num(fm.diastolic);
  if (!date || sys == null || dia == null) return null;
  return {
    file, path: file ? file.path : '', date, time: K.normTime(fm.time), sys, dia, pulse: K.num(fm.pulse),
    arm: K.str(fm.arm), position: K.str(fm.position), context: K.asArray(fm.context), medications: K.asArray(fm.medications), notes: K.str(fm.notes),
  };
}
const sortAsc = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
const fmtBP = (r) => Math.round(r.sys) + '/' + Math.round(r.dia);

function computeStats(all, s, fromKey, toKey) {
  const rs = all.filter((r) => (!fromKey || r.date >= fromKey) && r.date <= toKey).sort(sortAsc);
  const avg = (list) => (list.length ? { sys: K.mean(list.map((r) => r.sys)), dia: K.mean(list.map((r) => r.dia)), n: list.length } : null);
  const pulses = rs.map((r) => r.pulse).filter((p) => p != null);
  const byDay = new Map();
  for (const r of rs) { if (!byDay.has(r.date)) byDay.set(r.date, []); byDay.get(r.date).push(r); }
  const daily = [...byDay.entries()].map(([key, l]) => ({ key, sys: K.mean(l.map((r) => r.sys)), dia: K.mean(l.map((r) => r.dia)), pulse: K.mean(l.map((r) => r.pulse).filter((p) => p != null)), n: l.length }));
  const [ts, td] = target(s);
  const cats = new Map(guide(s).cats.map((c) => [c.id, 0]));
  for (const r of rs) cats.set(classify(s, r).id, cats.get(classify(s, r).id) + 1);
  const parts = {};
  for (const p of ['Morning', 'Afternoon', 'Evening', 'Night']) parts[p] = avg(rs.filter((r) => partOfDay(r.time) === p));
  const sd = (xs) => { if (xs.length < 2) return null; const m = K.mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
  return {
    readings: rs, n: rs.length, days: byDay.size, daily, avg: avg(rs), parts,
    pulse: pulses.length ? K.mean(pulses) : null, pulseMin: pulses.length ? Math.min(...pulses) : null, pulseMax: pulses.length ? Math.max(...pulses) : null,
    high: rs.length ? rs.reduce((m, r) => (r.sys > m.sys || (r.sys === m.sys && r.dia > m.dia) ? r : m), rs[0]) : null,
    low: rs.length ? rs.reduce((m, r) => (r.sys < m.sys ? r : m), rs[0]) : null,
    sdSys: sd(rs.map((r) => r.sys)), sdDia: sd(rs.map((r) => r.dia)),
    atTarget: rs.filter((r) => r.sys < ts && r.dia < td).length, target: [ts, td], cats,
    meds: K.tally(rs.map((r) => r.medications)),
  };
}
function rangeFrom(range, all) {
  const t = K.todayKey();
  if (range === 'all') return all.length ? all.slice().sort(sortAsc)[0].date : t;
  return K.addDaysKey(t, -(Number(range) - 1));
}

/* ---------------- Log modal ---------------- */
class ReadingModal extends K.FormModal {
  constructor(plugin, reading, opts = {}) {
    super(plugin);
    this.existing = reading || null;
    this.r = reading ? Object.assign({}, reading) : Object.assign({ date: K.todayKey(), time: K.nowTime(), sys: null, dia: null, pulse: null, arm: '', position: 'Sitting', context: [], medications: [], notes: '' }, opts.prefill || {});
    if (!reading && !opts.prefill) {
      const last = plugin.getRecords().slice().sort(sortAsc).pop();
      if (last) { this.r.arm = last.arm; this.r.position = last.position || 'Sitting'; }
    }
  }
  onOpen() {
    const p = this.plugin, s = p.settings, r = this.r;
    this.begin(this.existing ? 'Edit blood pressure reading' : 'Log blood pressure');
    const main = this.section('Reading', 'activity');
    const big = main.createDiv({ cls: 'hk-row bp-big' });
    this.sysIn = this.field(big, 'Systolic (top)', 'number', r.sys, { min: '50', max: '300', inputmode: 'numeric', placeholder: '120' });
    big.createDiv({ cls: 'bp-slash', text: '/' });
    this.diaIn = this.field(big, 'Diastolic (bottom)', 'number', r.dia, { min: '30', max: '200', inputmode: 'numeric', placeholder: '80' });
    this.pulseIn = this.field(big, 'Pulse (optional)', 'number', r.pulse, { min: '25', max: '250', inputmode: 'numeric', placeholder: '70' });
    this.badge = main.createDiv({ cls: 'bp-live' });
    const upd = () => {
      const sys = K.num(this.sysIn.value), dia = K.num(this.diaIn.value);
      this.badge.empty();
      if (sys == null || dia == null) return;
      const c = classify(s, { sys, dia });
      this.badge.createSpan({ cls: 'bp-cat bp-l' + c.level, text: c.label });
      if (c.level === 4) this.badge.createSpan({ cls: 'bp-live-warn', text: ' Rest for 5 minutes and measure again. If it stays this high, or you have chest pain, shortness of breath, weakness, numbness, or vision or speech changes, get emergency care.' });
    };
    this.sysIn.addEventListener('input', upd); this.diaIn.addEventListener('input', upd); upd();
    const when = this.row(main);
    this.dateIn = this.field(when, 'Date', 'date', r.date);
    this.timeIn = this.field(when, 'Time', 'time', r.time);

    const how = this.section('How it was measured', 'ruler');
    this.armC = this.chips(how, 'Arm', s.arms, r.arm, true);
    this.posC = this.chips(how, 'Position', s.positions, r.position, true);
    this.ctxC = this.chips(how, 'Anything that might affect it', s.contexts, r.context);
    const medOpts = (p.medOptions ? p.medOptions() : []).slice();
    for (const m of s.medications) if (!medOpts.includes(m)) medOpts.push(m);
    this.medC = this.chips(how, 'Blood pressure medication taken today', medOpts, r.medications);
    this.notesIn = this.area(how, 'Notes', r.notes, 'Optional', 2);

    this.footer({
      file: this.existing && this.existing.file,
      onDelete: this.existing ? async () => { await p.trash(this.existing.file); new Notice('Reading moved to trash.'); } : null,
      deleteTitle: 'Delete this reading?',
      extra: this.existing ? [] : [{ text: 'Save and add another', onClick: () => this.save(true) }],
      saveText: this.existing ? 'Save changes' : 'Save reading',
      onSave: () => this.save(false),
    });
    window.setTimeout(() => { if (!this.existing && this.sysIn.focus) this.sysIn.focus(); }, 30);
  }
  collect() {
    const sys = K.num(this.sysIn.value), dia = K.num(this.diaIn.value), pulse = K.num(this.pulseIn.value);
    if (sys == null || dia == null) { new Notice('Enter both the systolic (top) and diastolic (bottom) numbers.'); return null; }
    if (sys < 50 || sys > 300 || dia < 30 || dia > 200) { new Notice('Those numbers look out of range. Please check them.'); return null; }
    if (dia >= sys) { new Notice('The diastolic (bottom) number should be lower than the systolic (top) number.'); return null; }
    if (pulse != null && (pulse < 25 || pulse > 250)) { new Notice('The pulse looks out of range. Please check it.'); return null; }
    const date = K.normDate(this.dateIn.value);
    if (!date) { new Notice('Choose a date.'); return null; }
    return { date, time: K.normTime(this.timeIn.value), sys, dia, pulse, arm: this.armC.value(), position: this.posC.value(), context: this.ctxC.values(), medications: this.medC.values(), notes: this.notesIn.value.trim() };
  }
  async save(again) {
    const v = this.collect();
    if (!v) return;
    const p = this.plugin;
    p.remember('arms', [v.arm]); p.remember('positions', [v.position]); p.remember('contexts', v.context); p.remember('medications', v.medications.filter((m) => !(p.medOptions && p.medOptions().includes(m))));
    await p.saveSettings();
    const fm = { entry: ENTRY, date: v.date, time: v.time, systolic: v.sys, diastolic: v.dia, pulse: v.pulse, arm: v.arm, position: v.position, context: v.context, medications: v.medications, notes: v.notes, tags: ['blood-pressure'] };
    if (this.existing) await p.updateNote(this.existing.file, fm);
    else await p.createNote(p.settings.folder + '/Readings', v.date + ' ' + v.time.replace(':', ''), fm, '');
    const c = classify(p.settings, v);
    new Notice('Saved ' + fmtBP(v) + (v.pulse ? ', pulse ' + v.pulse : '') + ' · ' + c.label);
    this.close();
    if (again) {
      const [h, m] = (v.time || K.nowTime()).split(':').map(Number);
      const t = new Date(2000, 0, 1, h, m + 1);
      new ReadingModal(p, null, { prefill: { date: v.date, time: K.pad(t.getHours()) + ':' + K.pad(t.getMinutes()), arm: v.arm, position: v.position, context: v.context, medications: v.medications } }).open();
    }
  }
}

/* ---------------- Dashboard ---------------- */
class BPRenderer {
  constructor(plugin, el) { this.plugin = plugin; this.el = el; this.range = plugin.settings.defaultRange || '30'; this.showAll = false; }
  render() {
    const p = this.plugin, s = p.settings, el = this.el;
    el.empty(); el.addClass('hk-dashboard', 'bp-dashboard');
    const all = p.getRecords();
    const today = K.todayKey();
    K.header(el, 'Blood pressure', K.plural(all.length, 'reading') + ' logged · ' + guide(s).name + (doctorTarget(s) ? ' · your target ' + target(s).join('/') : ''), [
      { select: [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['180', 'Last 6 months'], ['365', 'Last 12 months'], ['all', 'All time']], value: this.range, label: 'Period', onChange: (v) => { this.range = v; this.render(); } },
      { icon: 'download', text: 'CSV', onClick: () => p.exportCsv() },
      { icon: 'file-text', text: 'Doctor report', onClick: () => p.openReport() },
      { icon: 'plus', text: 'Log reading', cta: true, onClick: () => new ReadingModal(p).open() },
    ]);
    if (!all.length) {
      K.emptyState(el, 'activity', 'No readings yet', 'Log your blood pressure and pulse to see averages, morning and evening patterns, a trend chart and a report you can print for your doctor. For home readings, a common routine is two readings a minute apart, morning and evening.', 'Log a reading', () => new ReadingModal(p).open());
      return;
    }
    const sorted = all.slice().sort(sortAsc);
    const latest = sorted[sorted.length - 1];
    const lc = classify(s, latest);
    if (lc.level === 4 && K.daysBetween(latest.date, today) <= 1) {
      const b = el.createDiv({ cls: 'hk-banner is-danger' });
      setIcon(b.createSpan({ cls: 'hk-btn-icon' }), 'alert-triangle');
      b.createSpan({ text: 'Your latest reading (' + fmtBP(latest) + ') is very high. Rest for 5 minutes and measure again. If it stays this high, or you have chest pain, shortness of breath, weakness, numbness, or vision or speech changes, get emergency care.' });
    }
    const from = rangeFrom(this.range, all);
    const st = computeStats(all, s, from, today);
    const tile = K.tiles(el);
    tile('Latest', fmtBP(latest), lc.label + (latest.pulse ? ' · pulse ' + latest.pulse : '') + ' · ' + K.cap(K.relDays(latest.date, today)) + (latest.time ? ' ' + latest.time : ''), 'bp-tile-l' + lc.level);
    if (st.avg) {
      const ac = classify(s, st.avg);
      tile('Average', fmtBP(st.avg), K.plural(st.n, 'reading') + ' on ' + K.plural(st.days, 'day') + ' · ' + ac.label, 'bp-tile-l' + ac.level);
      const m = st.parts.Morning, e = st.parts.Evening;
      tile('Morning average', m ? fmtBP(m) : '–', m ? K.plural(m.n, 'reading') + ' · 4 am–noon' : 'No morning readings');
      tile('Evening average', e ? fmtBP(e) : '–', e ? K.plural(e.n, 'reading') + ' · 5 pm–midnight' : 'No evening readings');
      tile('Pulse', st.pulse != null ? Math.round(st.pulse) + ' bpm' : '–', st.pulse != null ? 'Range ' + st.pulseMin + '–' + st.pulseMax : 'Not recorded');
      tile((doctorTarget(s) ? 'Below your target ' : 'Below ') + st.target[0] + '/' + st.target[1], Math.round((100 * st.atTarget) / st.n) + '%', K.plural(st.atTarget, 'reading') + ' of ' + st.n + (doctorTarget(s) ? ' · set by your doctor' : ''), doctorTarget(s) ? 'bp-tile-target' : '');
    } else el.createDiv({ cls: 'hk-muted hk-pad', text: 'No readings in this period.' });

    const grid = el.createDiv({ cls: 'hk-grid' });
    if (st.daily.length) {
      const c = K.card(grid, 'Daily average', 'Shaded bands show the ' + guide(s).name + ' thresholds.', 'hk-wide');
      const g = guide(s);
      const ys = st.daily.flatMap((d) => [d.sys, d.dia]);
      const yMin = Math.max(40, Math.floor((Math.min(...ys, 70) - 10) / 20) * 20), yMax = Math.min(240, Math.ceil((Math.max(...ys, 140) + 10) / 20) * 20);
      K.lineChart(c, {
        fromKey: this.range === 'all' ? st.daily[0].key : from, toKey: today, yMin, yMax, yStep: 20, label: 'Daily average blood pressure',
        bands: [{ from: g.sysLines[g.sysLines.length - 1], to: yMax, cls: 'bp-band-high' }],
        refs: g.sysLines.map((y) => ({ y, label: 'sys ' + y, cls: 'bp-ref-sys' })).concat(g.diaLines.map((y) => ({ y, label: 'dia ' + y, cls: 'bp-ref-dia' })))
          .concat(doctorTarget(s) ? [{ y: target(s)[0], label: 'your target ' + target(s)[0], cls: 'bp-ref-target' }, { y: target(s)[1], label: 'your target ' + target(s)[1], cls: 'bp-ref-target' }] : []),
        series: [
          { name: 'Systolic', cls: 'bp-sys', points: st.daily.map((d) => ({ key: d.key, y: K.round(d.sys), title: K.fmtKey(d.key) + ': ' + fmtBP(d) + ' (' + K.plural(d.n, 'reading') + ')' })) },
          { name: 'Diastolic', cls: 'bp-dia', points: st.daily.map((d) => ({ key: d.key, y: K.round(d.dia), title: K.fmtKey(d.key) + ': ' + fmtBP(d) })) },
          { name: 'Pulse', cls: 'bp-pulse', points: st.daily.filter((d) => d.pulse != null).map((d) => ({ key: d.key, y: K.round(d.pulse), title: K.fmtKey(d.key) + ': pulse ' + Math.round(d.pulse) })) },
        ],
      });
    }
    if (st.n) {
      const c = K.card(grid, 'Readings by category', guide(s).note);
      K.hbars(c, guide(s).cats.slice().reverse().map((cat) => [cat.label, st.cats.get(cat.id)]).filter((x) => x[1]), st.n, { cls: 'bp-fill' });
      const c2 = K.card(grid, 'Time of day');
      const parts = Object.entries(st.parts).filter(([, v]) => v);
      if (!parts.length) c2.createDiv({ cls: 'hk-muted', text: 'Add times to your readings to compare.' });
      for (const [name, v] of parts) {
        const row = c2.createDiv({ cls: 'bp-part' });
        row.createSpan({ cls: 'bp-part-name', text: name });
        const cat = classify(s, v);
        row.createSpan({ cls: 'bp-cat bp-l' + cat.level, text: fmtBP(v) });
        row.createSpan({ cls: 'hk-muted', text: K.plural(v.n, 'reading') });
      }
      if (st.high) {
        c2.createDiv({ cls: 'hk-muted hk-small', text: 'Highest: ' + fmtBP(st.high) + ' on ' + K.fmtKey(st.high.date) + '. Lowest: ' + fmtBP(st.low) + ' on ' + K.fmtKey(st.low.date) + '.' });
      }
      if (st.meds.length) { const c3 = K.card(grid, 'Medication noted with readings'); K.hbars(c3, st.meds, st.n, { cls: 'bp-fill' }); }
    }

    // Readings table
    if (st.n) {
      el.createDiv({ cls: 'hk-section-heading', text: 'Readings in this period' });
      const box = el.createDiv({ cls: 'hk-card hk-table-card' });
      const t = box.createEl('table', { cls: 'hk-table' });
      const hr = t.createEl('thead').createEl('tr');
      for (const h of ['Date', 'Time', 'Reading', 'Pulse', 'Arm · position', 'Notes', '']) hr.createEl('th', { text: h });
      const tb = t.createEl('tbody');
      const rows = st.readings.slice().reverse();
      for (const r of this.showAll ? rows : rows.slice(0, 25)) {
        const tr = tb.createEl('tr');
        tr.createEl('td', { text: K.fmtKey(r.date) });
        tr.createEl('td', { text: r.time || '–' });
        const c = classify(s, r);
        tr.createEl('td').createSpan({ cls: 'bp-cat bp-l' + c.level, text: fmtBP(r), attr: { title: c.label } });
        tr.createEl('td', { text: r.pulse != null ? String(r.pulse) : '–' });
        tr.createEl('td', { text: [r.arm, r.position].filter(Boolean).join(' · ') || '–' });
        tr.createEl('td', { cls: 'hk-td-notes', text: [r.context.join(', '), r.notes].filter(Boolean).join(' · ') || '' });
        const ed = tr.createEl('td').createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit reading' } });
        setIcon(ed, 'pencil');
        ed.onclick = () => new ReadingModal(p, r).open();
      }
      if (rows.length > 25 && !this.showAll) box.createEl('button', { cls: 'hk-more', text: 'Show all ' + rows.length + ' readings' }).onclick = () => { this.showAll = true; this.render(); };
    }
  }
}

/* ---------------- PDF report ---------------- */
function buildReport(plugin, o) {
  const s = plugin.settings, g = guide(s);
  const all = plugin.getRecords();
  const to = o.to || K.todayKey();
  const from = o.from || (all.length ? all.slice().sort(sortAsc)[0].date : to);
  const st = computeStats(all, s, from, to);
  const range = K.fmtKey(from) + ' – ' + K.fmtKey(to);
  const R = new K.Report('Blood pressure report', range, '#c0392b');
  R.cover([o.name ? 'Name: ' + o.name : '', 'Period: ' + range + ' (' + K.plural(K.daysBetween(from, to) + 1, 'day') + ')', 'Created ' + K.fmtKey(K.todayKey()) + ' · categories: ' + g.name, doctorTarget(s) ? 'Target set by doctor: below ' + target(s).join('/') + ' mmHg' : '']);
  if (!st.n) { R.para('No readings were recorded in this period.'); R.footerAll('Blood pressure report · for discussion with a clinician, not a diagnosis'); return R.output(); }

  R.heading('Summary');
  const a = st.avg, m = st.parts.Morning, e = st.parts.Evening;
  R.stats([
    ['Average', fmtBP(a) + ' mmHg', classify(s, a).label],
    ['Readings', String(st.n), 'on ' + K.plural(st.days, 'day')],
    ['Average pulse', st.pulse != null ? Math.round(st.pulse) + ' bpm' : '–', st.pulse != null ? 'range ' + st.pulseMin + '–' + st.pulseMax : 'not recorded'],
    ['Morning average', m ? fmtBP(m) : '–', m ? K.plural(m.n, 'reading') + ' (4 am–noon)' : 'no morning readings'],
    ['Evening average', e ? fmtBP(e) : '–', e ? K.plural(e.n, 'reading') + ' (5 pm–midnight)' : 'no evening readings'],
    [(doctorTarget(s) ? 'Below target ' : 'Below ') + st.target[0] + '/' + st.target[1], Math.round((100 * st.atTarget) / st.n) + '%', K.plural(st.atTarget, 'reading') + ' of ' + st.n + (doctorTarget(s) ? ' (doctor\u2019s target)' : '')],
    ['Highest', fmtBP(st.high), K.fmtKey(st.high.date) + (st.high.time ? ' ' + st.high.time : '')],
    ['Lowest', fmtBP(st.low), K.fmtKey(st.low.date) + (st.low.time ? ' ' + st.low.time : '')],
    ['Variability (SD)', st.sdSys != null ? K.round(st.sdSys, 1) + ' / ' + K.round(st.sdDia, 1) : '–', 'systolic / diastolic, mmHg'],
  ]);
  const vh = st.readings.filter((r) => classify(s, r).level === 4);
  if (vh.length) R.note(K.plural(vh.length, 'reading') + ' at 180/120 or higher: ' + vh.slice(0, 6).map((r) => fmtBP(r) + ' on ' + K.fmtKey(r.date)).join(', ') + (vh.length > 6 ? '…' : '') + '.', true);

  R.heading('Daily averages', 'Each point is the average of that day’s readings. Lines mark the ' + g.name + ' thresholds.');
  const ys = st.daily.flatMap((d) => [d.sys, d.dia]);
  const yMin = Math.max(40, Math.floor((Math.min(...ys, 70) - 10) / 20) * 20), yMax = Math.min(240, Math.ceil((Math.max(...ys, 140) + 10) / 20) * 20);
  const sysC = K.MI.hexRgb('#c0392b'), diaC = K.MI.hexRgb('#2c6fbb'), pulC = K.MI.hexRgb('#8a8a8a');
  R.chart({
    fromKey: from, toKey: to, yMin, yMax, yStep: 20,
    refs: g.sysLines.map((y) => ({ y, label: 'systolic ' + y, color: [0.85, 0.55, 0.5] })).concat(g.diaLines.map((y) => ({ y, label: 'diastolic ' + y, color: [0.55, 0.65, 0.85] }))),
    series: [
      { color: sysC, points: st.daily.map((d) => ({ key: d.key, y: d.sys })) },
      { color: diaC, points: st.daily.map((d) => ({ key: d.key, y: d.dia })) },
      { color: pulC, points: st.daily.filter((d) => d.pulse != null).map((d) => ({ key: d.key, y: d.pulse })) },
    ],
    legend: [['Systolic', sysC], ['Diastolic', diaC], ['Pulse', pulC]],
  });

  R.heading('Readings by category', g.note);
  R.table([{ label: 'Category', w: 0.55 }, { label: 'Readings', w: 0.2, align: 'right' }, { label: 'Share', w: 0.25, align: 'right' }],
    g.cats.slice().reverse().map((c) => [c.label, String(st.cats.get(c.id)), Math.round((100 * st.cats.get(c.id)) / st.n) + '%']),
    { cellColor: (ri, ci) => (ci === 0 ? LEVEL_RGB[g.cats.slice().reverse()[ri].level] : null), boldColored: true });

  // Weekly averages
  const weeks = new Map();
  for (const r of st.readings) {
    const d = K.parseKey(r.date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = K.keyOf(d);
    if (!weeks.has(k)) weeks.set(k, []);
    weeks.get(k).push(r);
  }
  if (weeks.size > 1) {
    R.heading('Weekly averages');
    R.table([{ label: 'Week of', w: 0.3 }, { label: 'Readings', w: 0.15, align: 'right' }, { label: 'Average', w: 0.2, align: 'right' }, { label: 'Morning', w: 0.175, align: 'right' }, { label: 'Evening', w: 0.175, align: 'right' }],
      [...weeks.entries()].map(([k, l]) => {
        const av = (x) => (x.length ? fmtBP({ sys: K.mean(x.map((r) => r.sys)), dia: K.mean(x.map((r) => r.dia)) }) : '–');
        return [K.fmtKey(k), String(l.length), av(l), av(l.filter((r) => partOfDay(r.time) === 'Morning')), av(l.filter((r) => partOfDay(r.time) === 'Evening'))];
      }));
  }

  const cur = plugin.currentMeds ? plugin.currentMeds() : [];
  if (o.includeMeds && (cur.length || st.meds.length)) {
    R.heading('Medications');
    if (cur.length) R.table([{ label: 'Current medication', w: 0.32 }, { label: 'Dose and schedule', w: 0.36, wrap: true }, { label: 'For', w: 0.32, wrap: true }], cur.map((x) => [x.name, x.schedule, x.purpose]));
    if (st.meds.length) R.para('Noted with readings: ' + st.meds.map(([n, c]) => n + ' (' + c + ')').join(', ') + '.', { size: 9 });
  }
  if (o.notes) { R.heading('Questions and notes'); R.para(o.notes); }
  if (o.includeLog) {
    R.heading('All readings');
    R.table([{ label: 'Date', w: 0.17 }, { label: 'Time', w: 0.08 }, { label: 'BP', w: 0.1, align: 'right' }, { label: 'Pulse', w: 0.08, align: 'right' }, { label: 'Category', w: 0.17 }, { label: 'Arm · position · notes', w: 0.4, wrap: true }],
      st.readings.map((r) => [K.fmtKey(r.date), r.time || '', fmtBP(r), r.pulse != null ? String(r.pulse) : '', classify(s, r).label, [r.arm, r.position, r.context.join(', '), r.notes].filter(Boolean).join(' · ')]),
      { size: 8, cellColor: (ri, ci) => (ci === 2 || ci === 4 ? LEVEL_RGB[classify(s, st.readings[ri]).level] : null) });
  }
  if (plugin.reportExtras) R.extraSections(plugin.reportExtras({ from: from, to: to, includeNotes: o.includeGenNotes !== false, includeMissed: false }));
  R.footerAll('Blood pressure report · ' + g.name + ' · for discussion with a clinician, not a diagnosis');
  return R.output();
}

/* ---------------- Settings ---------------- */
/** Guideline and doctor's-target controls; shown in the Blood Pressure tab and in the Health Dashboard tab. */
function guidelineSettings(c, p, redraw, heading) {
  const s = p.settings;
  new Setting(c).setName(heading || 'Guidelines and target').setHeading();
  new Setting(c).setName('Guideline').setDesc('Which guideline labels your readings and draws the lines on the chart and in the report.')
    .addDropdown((d) => d.addOptions({
      'esc-home': 'ESC 2024 (European) · home readings · default',
      'esc-office': 'ESC 2024 (European) · clinic readings',
      aha: 'ACC/AHA 2025 (American)',
    }).setValue(s.guideline).onChange(async (v) => { s.guideline = v; await p.saveSettings(); redraw(); }));
  const g = guide(s);
  c.createEl('p', { cls: 'setting-item-description bp-set-note', text: g.note + ' Readings of 180/120 or higher are always marked very high.' });
  new Setting(c).setName('Use my doctor\u2019s target').setDesc('Count readings as on target when they are below the target your doctor gave you, instead of the guideline threshold (' + g.target[0] + '/' + g.target[1] + '). The guideline still labels each reading.')
    .addToggle((t) => t.setValue(!!s.useDoctorTarget).onChange(async (v) => { s.useDoctorTarget = v; await p.saveSettings(); redraw(); }));
  if (s.useDoctorTarget) {
    new Setting(c).setName('Target systolic (top number)').setDesc('Readings must be below this. Empty uses ' + g.target[0] + '.')
      .addText((t) => { t.setPlaceholder(String(g.target[0])).setValue(s.targetSys ? String(s.targetSys) : '').onChange(async (v) => { const n = K.num(v); s.targetSys = n && n >= 80 && n <= 200 ? n : null; await p.saveSettings(); }); t.inputEl.type = 'number'; });
    new Setting(c).setName('Target diastolic (bottom number)').setDesc('Readings must be below this. Empty uses ' + g.target[1] + '.')
      .addText((t) => { t.setPlaceholder(String(g.target[1])).setValue(s.targetDia ? String(s.targetDia) : '').onChange(async (v) => { const n = K.num(v); s.targetDia = n && n >= 40 && n <= 130 ? n : null; await p.saveSettings(); }); t.inputEl.type = 'number'; });
  }
}

class BPSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const c = this.containerEl, p = this.plugin, s = p.settings;
    c.empty();
    new Setting(c).setName('Reading folder').setDesc('Each reading is a note in "<folder>/Readings". Reports go in "<folder>/Reports".')
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.folder).setValue(s.folder).onChange(async (v) => { s.folder = v.trim() || DEFAULT_SETTINGS.folder; await p.saveSettings(); }));
    guidelineSettings(c, p, () => this.display());
    new Setting(c).setName('Dashboard and reports').setHeading();
    new Setting(c).setName('Default dashboard period').addDropdown((d) => d.addOptions({ 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', 180: 'Last 6 months', 365: 'Last 12 months', all: 'All time' })
      .setValue(String(s.defaultRange)).onChange(async (v) => { s.defaultRange = v; await p.saveSettings(); }));
    new Setting(c).setName('Choice lists').setHeading();
    c.createEl('p', { cls: 'setting-item-description', text: 'Arms, positions, circumstances and medications are edited under Settings → Health Dashboard → Selectors.' });
  }
}

/* ---------------- Plugin ---------------- */
class BloodPressurePlugin extends K.TrackerPlugin {
  async onload() {
    this.cfg = { viewType: VIEW_TYPE, title: 'Blood pressure', icon: 'activity', defaults: DEFAULT_SETTINGS, listKeys: LIST_KEYS, Renderer: BPRenderer, parse: parseReading };
    await this.setup();
    if (this.settings.useDoctorTarget == null || (!this.settings.useDoctorTarget && (this.settings.targetSys || this.settings.targetDia) && !this.settings._targetMigrated)) {
      this.settings.useDoctorTarget = !!(this.settings.targetSys || this.settings.targetDia);
      this.settings._targetMigrated = true;
    }
    this.addCommand({ id: 'log-reading', name: 'Log a reading', callback: () => new ReadingModal(this).open() });
    this.addCommand({ id: 'pdf-report', name: 'Create PDF report for doctor', callback: () => this.openReport() });
    this.addCommand({
      id: 'edit-current-reading', name: 'Edit this reading',
      checkCallback: (checking) => { const f = this.app.workspace.getActiveFile(); const r = f && this.recordFromFile(f); if (!r) return false; if (!checking) new ReadingModal(this, r).open(); return true; },
    });
    this.addSettingTab(new BPSettingTab(this.app, this));
  }
  stats(fromKey, toKey) { return computeStats(this.getRecords(), this.settings, fromKey, toKey); }
  classify(r) { return classify(this.settings, r); }
  openReport() {
    new K.ReportOptionsModal(this, {
      title: 'Blood pressure report for your doctor', defaultRange: '30',
      toggles: [['includeLog', 'Include every reading', true], ['includeMeds', 'Include medications', true]],
      build: async (o) => {
        const bytes = buildReport(this, o);
        const name = 'Blood pressure report ' + (o.from || 'start') + ' to ' + o.to + '.pdf';
        const { file, path } = await this.writeFile(this.settings.folder + '/Reports', name, bytes, true);
        new Notice('Report saved to ' + path);
        return file;
      },
    }).open();
  }
  async exportCsv() {
    const rows = [['date', 'time', 'systolic', 'diastolic', 'pulse', 'category', 'arm', 'position', 'context', 'medications', 'notes']];
    for (const r of this.getRecords().sort(sortAsc)) rows.push([r.date, r.time, r.sys, r.dia, r.pulse, classify(this.settings, r).label, r.arm, r.position, r.context.join('; '), r.medications.join('; '), r.notes]);
    await this.exportRows(this.settings.folder, 'Blood pressure export', rows);
  }
}

module.exports = BloodPressurePlugin;
module.exports._internals = { VIEW_TYPE, DEFAULT_SETTINGS, GUIDELINES, target, doctorTarget, guidelineSettings, ReadingModal, BPRenderer, Renderer: BPRenderer, parseReading, computeStats, classify, buildReport, fmtBP, sortAsc, partOfDay };
