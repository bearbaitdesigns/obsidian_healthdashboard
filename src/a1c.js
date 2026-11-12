/* A1C (HbA1c): lab results over time, estimated average glucose, test reminders and a PDF report for your doctor. */
const K = KitModule;
const { Notice, PluginSettingTab, Setting, setIcon } = require('obsidian');

const VIEW_TYPE = 'a1c-dashboard';
const ENTRY = 'a1c-result';
const DEFAULT_SETTINGS = {
  folder: 'A1C',
  displayUnit: 'percent', // percent | mmol | both
  glucoseUnit: 'mmol/L', // mg/dL | mmol/L
  useDoctorTarget: false,
  target: null,
  intervalMonths: 3,
  rangeStandard: 'ada', // ada | nice: where the at-risk (prediabetes) range starts
  showStatusBar: true,
  reportName: '',
  testTypes: ['Lab blood test', 'Finger-prick at clinic', 'Home test kit'],
  labs: [],
};
const LIST_KEYS = ['testTypes', 'labs'];

/* Conversions: NGSP % ↔ IFCC mmol/mol, and estimated average glucose (ADAG study) */
const toMmol = (pct) => Math.round((pct - 2.15) * 10.929);
const fromMmol = (mmol) => Math.round((mmol / 10.929 + 2.15) * 10) / 10;
const eagMg = (pct) => Math.round(28.7 * pct - 46.7);
const eagMmol = (pct) => Math.round((1.59 * pct - 2.59) * 10) / 10;

/* Diagnostic ranges. Everyone agrees on 6.5% (48 mmol/mol) for the diabetes range; where the at-risk range starts differs:
   ADA Standards of Care: prediabetes 5.7–6.4% (39–47 mmol/mol); NICE (UK): high risk 6.0–6.4% (42–47 mmol/mol). */
const STANDARDS = {
  ada: { id: 'ada', name: 'American Diabetes Association (ADA)', short: 'ADA', pre: 5.7, preLabel: 'Prediabetes range' },
  nice: { id: 'nice', name: 'NICE (UK)', short: 'NICE', pre: 6.0, preLabel: 'High-risk range' },
};
const STD = { cur: STANDARDS.ada };
const applyStandard = (s) => { STD.cur = STANDARDS[s && s.rangeStandard] || STANDARDS.ada; return STD.cur; };
const preLow = () => STD.cur.pre;
const CATS = [
  { id: 'diabetes', label: 'Diabetes range', level: 3, test: (v) => v >= 6.5 },
  { id: 'prediabetes', get label() { return STD.cur.preLabel; }, level: 2, test: (v) => v >= STD.cur.pre },
  { id: 'normal', label: 'Normal range', level: 0, test: () => true },
];
const classify = (v) => CATS.find((c) => c.test(v));
const LEVEL_HEX = ['#2f9e6b', '#c9a227', '#e08a2b', '#d1495b'];
// Same colours as the dashboard: green for a drop, orange for a rise
const DOWN_HEX = '#2f9e6b', UP_HEX = '#dd7a35';
const rangesNote = () => (STD.cur.id === 'nice'
  ? 'Ranges from NICE (UK): below 6.0% (42 mmol/mol) normal, 6.0–6.4% (42–47 mmol/mol) high risk of type 2 diabetes, 6.5% (48 mmol/mol) or higher diabetes range. A single result is not a diagnosis.'
  : 'Ranges from the American Diabetes Association Standards of Care: below 5.7% (39 mmol/mol) normal, 5.7–6.4% (39–47 mmol/mol) prediabetes, 6.5% (48 mmol/mol) or higher diabetes range. A single result is not a diagnosis.');
const hasTarget = (s) => !!(s.useDoctorTarget && s.target);

function fmtA1c(s, pct, short) {
  if (pct == null) return '–';
  const p = (Math.round(pct * 10) / 10).toFixed(1) + '%';
  const m = toMmol(pct) + (short ? '' : ' mmol/mol');
  if (s.displayUnit === 'mmol') return toMmol(pct) + ' mmol/mol';
  if (s.displayUnit === 'both') return p + ' (' + m + (short ? ' mmol/mol' : '') + ')';
  return p;
}
const fmtEag = (s, pct) => (s.glucoseUnit === 'mg/dL' ? eagMg(pct) + ' mg/dL' : eagMmol(pct) + ' mmol/L');

function parse(file, fm) {
  if (!fm || String(fm.entry || '').toLowerCase() !== ENTRY) return null;
  const date = K.normDate(fm.date);
  let pct = K.num(fm.a1c_percent);
  if (pct == null && K.num(fm.a1c_mmol_mol) != null) pct = fromMmol(K.num(fm.a1c_mmol_mol));
  if (!date || pct == null || pct < 3 || pct > 20) return null;
  return {
    file, path: file ? file.path : '', date, pct, testType: K.str(fm.test_type), lab: K.str(fm.lab), orderedBy: K.str(fm.ordered_by),
    fastingGlucose: K.num(fm.fasting_glucose), glucoseUnit: K.str(fm.glucose_unit) || '', medications: K.asArray(fm.medications), notes: K.str(fm.notes),
  };
}
const sortAsc = (a, b) => a.date.localeCompare(b.date);

function computeStats(all, s, fromKey, toKey) {
  const rs = all.filter((r) => (!fromKey || r.date >= fromKey) && r.date <= toKey).sort(sortAsc);
  const sorted = all.slice().sort(sortAsc);
  const latest = sorted[sorted.length - 1] || null;
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const vals = rs.map((r) => r.pct);
  return {
    results: rs, n: rs.length, latest, prev,
    change: latest && prev ? Math.round((latest.pct - prev.pct) * 10) / 10 : null,
    avg: vals.length ? K.mean(vals) : null, min: rs.length ? rs.reduce((m, r) => (r.pct < m.pct ? r : m)) : null, max: rs.length ? rs.reduce((m, r) => (r.pct > m.pct ? r : m)) : null,
    first: rs[0] || null, last: rs[rs.length - 1] || null,
    atTarget: hasTarget(s) ? rs.filter((r) => r.pct < s.target).length : null,
    cats: new Map(CATS.map((c) => [c.id, rs.filter((r) => classify(r.pct).id === c.id).length])),
    nextDue: latest ? K.addMonthsKey(latest.date, Number(s.intervalMonths) || 3) : null,
  };
}
function changeText(s, ch) {
  if (ch == null) return '';
  if (ch === 0) return 'No change';
  return (ch > 0 ? '▲ up ' : '▼ down ') + Math.abs(ch).toFixed(1) + (s.displayUnit === 'mmol' ? ' points (' + Math.abs(Math.round(ch * 10.929)) + ' mmol/mol)' : ' points');
}

/* ---------------- Log modal ---------------- */
class ResultModal extends K.FormModal {
  constructor(plugin, r) {
    super(plugin);
    this.existing = r || null;
    this.r = r ? Object.assign({}, r) : { date: K.todayKey(), pct: null, testType: plugin.settings.testTypes[0] || '', lab: '', orderedBy: '', fastingGlucose: null, glucoseUnit: plugin.settings.glucoseUnit, medications: [], notes: '' };
    if (!r) { const last = plugin.getRecords().slice().sort(sortAsc).pop(); if (last) { this.r.lab = last.lab; this.r.testType = last.testType || this.r.testType; this.r.orderedBy = last.orderedBy; } }
  }
  onOpen() {
    const p = this.plugin, s = p.settings, r = this.r;
    this.begin(this.existing ? 'Edit A1C result' : 'Log A1C result');
    const res = this.section('Result', 'test-tube');
    const row = this.row(res);
    this.dateIn = this.field(row, 'Date of test', 'date', r.date);
    this.unit = s.displayUnit === 'mmol' ? 'mmol' : 'percent';
    const big = this.row(res);
    big.addClass('a1c-big');
    this.valIn = this.field(big, this.unit === 'mmol' ? 'A1C (mmol/mol)' : 'A1C (%)', 'number', r.pct == null ? '' : this.unit === 'mmol' ? toMmol(r.pct) : r.pct, this.unit === 'mmol' ? { min: '15', max: '200', step: '1', placeholder: '42' } : { min: '3', max: '20', step: '0.1', placeholder: '6.0' });
    const sw = big.createDiv({ cls: 'hk-quick' });
    const swb = sw.createEl('button', { cls: 'mt-chip', text: this.unit === 'mmol' ? 'Enter as %' : 'Enter as mmol/mol', attr: { type: 'button' } });
    swb.onclick = () => {
      const v = this.readPct();
      this.unit = this.unit === 'mmol' ? 'percent' : 'mmol';
      this.valIn.hkLabel.setText(this.unit === 'mmol' ? 'A1C (mmol/mol)' : 'A1C (%)');
      this.valIn.step = this.unit === 'mmol' ? '1' : '0.1';
      this.valIn.value = v == null ? '' : String(this.unit === 'mmol' ? toMmol(v) : v);
      swb.setText(this.unit === 'mmol' ? 'Enter as %' : 'Enter as mmol/mol');
      upd();
    };
    this.live = res.createDiv({ cls: 'a1c-live' });
    const upd = () => {
      this.live.empty();
      const v = this.readPct();
      if (v == null) return;
      const c = classify(v);
      this.live.createSpan({ cls: 'bp-cat bp-l' + c.level, text: c.label });
      this.live.createSpan({ cls: 'hk-muted', text: '  ' + (Math.round(v * 10) / 10).toFixed(1) + '% = ' + toMmol(v) + ' mmol/mol · estimated average glucose ' + fmtEag(s, v) });
    };
    this.valIn.addEventListener('input', upd);
    upd();

    const det = this.section('Details', 'clipboard-list');
    this.typeC = this.chips(det, 'Type of test', s.testTypes, r.testType, true);
    this.labC = this.chips(det, 'Lab or clinic', s.labs, r.lab, true);
    const docs = (p.prescriberOptions ? p.prescriberOptions() : []);
    this.docC = this.chips(det, 'Ordered by', docs, r.orderedBy, true);
    const gr = this.row(det);
    this.fgIn = this.field(gr, 'Fasting glucose (optional, ' + s.glucoseUnit + ')', 'number', r.fastingGlucose, { step: s.glucoseUnit === 'mg/dL' ? '1' : '0.1' });
    const medOpts = (p.medOptions ? p.medOptions() : []);
    if (medOpts.length || r.medications.length) this.medC = this.chips(det, 'Medications at the time', medOpts, r.medications);
    this.notesIn = this.area(det, 'Notes', r.notes, 'For example what the doctor said, or anything that may have affected the result (illness, anaemia, pregnancy, recent blood loss).', 3);
    this.footer({
      file: this.existing && this.existing.file,
      onDelete: this.existing ? async () => { await p.trash(this.existing.file); new Notice('Result moved to trash.'); } : null,
      deleteTitle: 'Delete this A1C result?',
      saveText: this.existing ? 'Save changes' : 'Save result',
      onSave: () => this.save(),
    });
  }
  readPct() {
    const n = K.num(this.valIn.value);
    if (n == null) return null;
    return this.unit === 'mmol' ? fromMmol(n) : n;
  }
  async save() {
    const p = this.plugin, s = p.settings;
    const pct = this.readPct(), date = K.normDate(this.dateIn.value);
    if (!date) { new Notice('Choose the date of the test.'); return; }
    if (pct == null || pct < 3 || pct > 20) { new Notice(this.unit === 'mmol' ? 'Enter an A1C between 9 and 195 mmol/mol.' : 'Enter an A1C between 3 and 20%.'); return; }
    const v = {
      entry: ENTRY, date, a1c_percent: Math.round(pct * 10) / 10, a1c_mmol_mol: toMmol(pct), test_type: this.typeC.value(), lab: this.labC.value(), ordered_by: this.docC.value(),
      fasting_glucose: K.num(this.fgIn.value), glucose_unit: K.num(this.fgIn.value) != null ? s.glucoseUnit : '', medications: this.medC ? this.medC.values() : [],
      notes: this.notesIn.value.trim(), tags: ['a1c'],
    };
    p.remember('testTypes', [v.test_type]); p.remember('labs', [v.lab]);
    await p.saveSettings();
    if (this.existing) await p.updateNote(this.existing.file, v);
    else await p.createNote(s.folder, date + ' A1C', v, '# A1C ' + v.a1c_percent + '% · ' + K.fmtKey(date) + '\n\n');
    new Notice('Saved A1C ' + fmtA1c(s, pct) + ' · ' + classify(pct).label + '.');
    this.close();
  }
}

/* ---------------- Dashboard ---------------- */
class A1CRenderer {
  constructor(plugin, el) { this.plugin = plugin; this.el = el; }
  render() {
    const p = this.plugin, s = p.settings, el = this.el;
    el.empty(); el.addClass('hk-dashboard', 'a1c-dashboard');
    applyStandard(s);
    const all = p.getRecords().slice().sort(sortAsc);
    const today = K.todayKey();
    K.header(el, 'A1C', K.plural(all.length, 'result') + ' logged' + (hasTarget(s) ? ' · your target below ' + fmtA1c(s, s.target, true) : ''), [
      { icon: 'download', text: 'CSV', onClick: () => p.exportCsv() },
      { icon: 'file-text', text: 'Doctor report', onClick: () => p.openReport() },
      { icon: 'plus', text: 'Log result', cta: true, onClick: () => new ResultModal(p).open() },
    ]);
    if (!all.length) {
      K.emptyState(el, 'test-tube', 'No A1C results yet', 'A1C (HbA1c) shows your average blood sugar over the past 2–3 months. Log each result from your lab or clinic to follow the trend, see your estimated average glucose, get a reminder when the next test is due, and print a report for your doctor.', 'Log a result', () => new ResultModal(p).open());
      return;
    }
    const st = computeStats(all, s, '', today);
    const L = st.latest, lc = classify(L.pct);
    if (st.nextDue && st.nextDue <= today) {
      const b = el.createDiv({ cls: 'hk-banner is-warn' });
      setIcon(b.createSpan({ cls: 'hk-btn-icon' }), 'calendar-clock');
      b.createSpan({ text: 'Your next A1C test was due ' + K.fmtKey(st.nextDue) + ' (' + K.relDays(st.nextDue, today) + '), ' + s.intervalMonths + ' months after your last test.' });
    }
    const tile = K.tiles(el);
    tile('Latest', fmtA1c(s, L.pct), lc.label + ' · ' + K.fmtKey(L.date), 'bp-tile-l' + lc.level);
    tile('Change', st.change == null ? '–' : (st.change > 0 ? '+' : '') + st.change.toFixed(1), st.prev ? changeText(s, st.change).replace(/^[▲▼] /, '') + ' since ' + K.fmtKey(st.prev.date) : 'Needs two results', st.change > 0 ? 'is-warn' : '');
    tile('Estimated average glucose', fmtEag(s, L.pct), 'From the latest A1C');
    if (hasTarget(s)) tile('Your target', 'Below ' + fmtA1c(s, s.target, true), L.pct < s.target ? 'Latest result is below target' : 'Latest result is above target', L.pct < s.target ? 'bp-tile-l0' : 'is-warn');
    const overdue = st.nextDue && st.nextDue < today;
    tile('Next test', !st.nextDue ? '–' : overdue ? 'Overdue' : K.cap(K.relDays(st.nextDue, today)), st.nextDue ? (overdue ? 'Was due ' : '') + K.fmtKey(st.nextDue) + ' · every ' + s.intervalMonths + ' months' : '', overdue ? 'is-warn' : '');
    const yr = all.filter((r) => r.date > K.addDaysKey(today, -365));
    tile('Tests · last 12 months', String(yr.length), yr.length ? 'Average ' + fmtA1c(s, K.mean(yr.map((r) => r.pct))) : '');

    const grid = el.createDiv({ cls: 'hk-grid' });
    const c = K.card(grid, 'A1C over time', 'Dashed lines mark ' + preLow().toFixed(1) + '% and 6.5%' + (hasTarget(s) ? ', the green line your target.' : '.'), 'hk-wide');
    const vals = all.map((r) => r.pct).concat(hasTarget(s) ? [s.target] : []);
    const yMin = Math.max(3, Math.floor(Math.min(...vals, 5.2) - 0.5)), yMax = Math.ceil(Math.max(...vals, 7) + 0.5);
    const fromKey = all.length > 1 ? all[0].date : K.addDaysKey(all[0].date, -90);
    K.lineChart(c, {
      fromKey: K.addDaysKey(fromKey, -14), toKey: K.addDaysKey(all[all.length - 1].date > today ? all[all.length - 1].date : today, 14), yMin, yMax, yStep: 1, label: 'A1C results over time',
      bands: [{ from: 6.5, to: yMax, cls: 'a1c-band-dm' }, { from: preLow(), to: 6.5, cls: 'a1c-band-pre' }],
      refs: [{ y: preLow(), label: preLow().toFixed(1) + '%', cls: 'a1c-ref' }, { y: 6.5, label: '6.5%', cls: 'a1c-ref' }].concat(hasTarget(s) ? [{ y: s.target, label: 'your target ' + s.target + '%', cls: 'bp-ref-target' }] : []),
      series: [{ name: 'A1C', cls: 'a1c-line', points: all.map((r) => ({ key: r.date, y: r.pct, title: K.fmtKey(r.date) + ': ' + fmtA1c(s, r.pct) + ' · ' + classify(r.pct).label })) }],
    });
    c.createDiv({ cls: 'hk-muted hk-small', text: rangesNote() });

    el.createDiv({ cls: 'hk-section-heading', text: 'All results' });
    const box = el.createDiv({ cls: 'hk-card hk-table-card' });
    const t = box.createEl('table', { cls: 'hk-table' });
    const hr = t.createEl('thead').createEl('tr');
    for (const h of ['Date', 'A1C', 'mmol/mol', 'Change', 'Avg. glucose', 'Test · lab', 'Notes', '']) hr.createEl('th', { text: h });
    const tb = t.createEl('tbody');
    const rows = all.slice().reverse();
    rows.forEach((r, i) => {
      const prev = rows[i + 1];
      const tr = tb.createEl('tr');
      tr.createEl('td', { text: K.fmtKey(r.date) });
      const cat = classify(r.pct);
      tr.createEl('td').createSpan({ cls: 'bp-cat bp-l' + cat.level, text: r.pct.toFixed(1) + '%', attr: { title: cat.label } });
      tr.createEl('td', { text: String(toMmol(r.pct)) });
      const d = prev ? Math.round((r.pct - prev.pct) * 10) / 10 : null;
      tr.createEl('td', { cls: d > 0 ? 'a1c-up' : d < 0 ? 'a1c-down' : '', text: d == null ? '–' : (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '') + d.toFixed(1) });
      tr.createEl('td', { text: fmtEag(s, r.pct) });
      tr.createEl('td', { text: [r.testType, r.lab].filter(Boolean).join(' · ') || '–' });
      tr.createEl('td', { cls: 'hk-td-notes', text: r.notes || '' });
      const ed = tr.createEl('td').createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit result' } });
      setIcon(ed, 'pencil');
      ed.onclick = () => new ResultModal(p, r).open();
    });
  }
}

/* ---------------- PDF report ---------------- */
function buildReport(plugin, o) {
  const s = plugin.settings;
  const all = plugin.getRecords().slice().sort(sortAsc);
  const to = o.to || K.todayKey();
  const from = o.from || (all.length ? all[0].date : to);
  const st = computeStats(all.filter((r) => r.date <= to), s, from, to);
  const range = K.fmtKey(from) + ' – ' + K.fmtKey(to);
  applyStandard(s);
  const R = new K.Report('A1C report', range, '#7a4fd0');
  R.cover([o.name ? 'Name: ' + o.name : '', 'Period: ' + range, 'Created ' + K.fmtKey(K.todayKey()), hasTarget(s) ? 'Target set by doctor: below ' + s.target.toFixed(1) + '% (' + toMmol(s.target) + ' mmol/mol)' : '']);
  if (!st.n) { R.para('No A1C results were recorded in this period.'); R.footerAll('A1C report · for discussion with a clinician, not a diagnosis'); return R.output(); }
  const L = st.last, F = st.first;
  R.heading('Summary');
  const both = (v) => v.toFixed(1) + '% · ' + toMmol(v) + ' mmol/mol';
  const rgb = (h) => K.MI.hexRgb(h);
  const arrowStyle = (d) => (d == null || d === 0 ? {} : { arrow: d > 0 ? 'up' : 'down', valueColor: rgb(d > 0 ? UP_HEX : DOWN_HEX) });
  const periodChange = st.n > 1 ? Math.round((L.pct - F.pct) * 10) / 10 : null;
  const items = [
    ['Latest result', both(L.pct), K.fmtKey(L.date) + ' · ' + classify(L.pct).label, { accent: rgb(LEVEL_HEX[classify(L.pct).level]), valueColor: rgb(LEVEL_HEX[classify(L.pct).level]) }],
    ['Change over period', periodChange != null ? (periodChange > 0 ? '+' : '') + periodChange.toFixed(1) + ' points' : '–', st.n > 1 ? 'from ' + F.pct.toFixed(1) + '% on ' + K.fmtKey(F.date) : 'one result in period', arrowStyle(periodChange)],
    ['Estimated average glucose', eagMmol(L.pct) + ' mmol/L', eagMg(L.pct) + ' mg/dL (from latest A1C)'],
    ['Results in period', String(st.n), st.n > 1 ? 'average ' + st.avg.toFixed(1) + '%' : ''],
    ['Lowest', st.min.pct.toFixed(1) + '%', K.fmtKey(st.min.date), { valueColor: rgb(LEVEL_HEX[classify(st.min.pct).level]) }],
    ['Highest', st.max.pct.toFixed(1) + '%', K.fmtKey(st.max.date), { valueColor: rgb(LEVEL_HEX[classify(st.max.pct).level]) }],
  ];
  if (hasTarget(s)) items.push(['Below target', st.atTarget + ' of ' + st.n, 'target below ' + s.target.toFixed(1) + '%', { accent: rgb(LEVEL_HEX[0]) }]);
  if (st.prev && st.latest === L) items.push(['Since previous test', changeText(s, st.change).replace(/^[▲▼] /, ''), 'previous ' + st.prev.pct.toFixed(1) + '% on ' + K.fmtKey(st.prev.date), arrowStyle(st.change)]);
  R.stats(items);
  R.note(rangesNote());

  if (st.n > 1 || all.length > 1) {
    R.heading('A1C over time');
    const vals = all.map((r) => r.pct).concat(hasTarget(s) ? [s.target] : []);
    const yMin = Math.max(3, Math.floor(Math.min(...vals, 5.2) - 0.5)), yMax = Math.ceil(Math.max(...vals, 7) + 0.5);
    const line = K.MI.hexRgb('#7a4fd0');
    R.chart({
      fromKey: K.addDaysKey(all[0].date < from ? all[0].date : from, -14), toKey: K.addDaysKey(to, 14), yMin, yMax, yStep: 1,
      bands: [{ from: 6.5, to: yMax, color: [0.99, 0.93, 0.93] }, { from: preLow(), to: 6.5, color: [0.99, 0.97, 0.9] }],
      refs: [{ y: preLow(), label: preLow().toFixed(1) + '%', color: [0.8, 0.65, 0.3] }, { y: 6.5, label: '6.5%', color: [0.85, 0.45, 0.45] }].concat(hasTarget(s) ? [{ y: s.target, label: 'target ' + s.target + '%', color: K.MI.hexRgb('#2f9e6b') }] : []),
      series: [{ color: line, points: all.filter((r) => r.date <= to).map((r) => ({ key: r.date, y: r.pct })) }],
      legend: [['A1C', line]],
    });
    if (all[0].date < from) R.para('The chart includes earlier results for context; the summary covers the selected period only.', { size: 8, color: K.RC.muted });
  }

  R.heading('Results');
  const rows = st.results;
  R.table([{ label: 'Date', w: 0.15 }, { label: 'A1C', w: 0.09, align: 'right' }, { label: 'mmol/mol', w: 0.1, align: 'right' }, { label: 'Change', w: 0.09, align: 'right' }, { label: 'Avg. glucose', w: 0.14, align: 'right' }, { label: 'Range', w: 0.15 }, { label: 'Test, lab, notes', w: 0.28, wrap: true }],
    rows.map((r) => {
      const i = all.indexOf(r), prev = i > 0 ? all[i - 1] : null;
      const d = prev ? r.pct - prev.pct : null;
      return [K.fmtKey(r.date), r.pct.toFixed(1) + '%', String(toMmol(r.pct)), d == null ? '' : (d > 0 ? '+' : '') + d.toFixed(1), s.glucoseUnit === 'mg/dL' ? eagMg(r.pct) + ' mg/dL' : eagMmol(r.pct) + ' mmol/L',
        classify(r.pct).label.replace(' range', ''), [r.testType, r.lab, r.orderedBy ? 'ordered by ' + r.orderedBy : '', r.fastingGlucose != null ? 'fasting glucose ' + r.fastingGlucose + ' ' + (r.glucoseUnit || s.glucoseUnit) : '', r.notes].filter(Boolean).join('. ')];
    }),
    {
      cellColor: (ri, ci) => (ci === 5 ? rgb(LEVEL_HEX[classify(rows[ri].pct).level]) : null), boldColored: true,
      drawCell: (ri, ci, c) => {
        const r = rows[ri];
        if (ci === 1) { // A1C % as a coloured pill
          R.pill(c.x + c.w - c.pad, c.y + 1, r.pct.toFixed(1) + '%', { fill: rgb(LEVEL_HEX[classify(r.pct).level]), size: c.size, align: 'right', h: c.lh + 1 });
          return true;
        }
        if (ci === 3) { // change with a green/orange triangle
          const i = all.indexOf(r), prev = i > 0 ? all[i - 1] : null;
          if (!prev) { R.doc.text(c.x + c.w - c.pad, c.y + c.lh - 2, '–', { size: c.size, color: K.RC.muted, align: 'right' }); return true; }
          const d = Math.round((r.pct - prev.pct) * 10) / 10;
          const color = d > 0 ? rgb(UP_HEX) : d < 0 ? rgb(DOWN_HEX) : K.RC.muted;
          const label = (d > 0 ? '+' : '') + d.toFixed(1);
          const tw = R.doc.width(label, c.size, true);
          R.doc.text(c.x + c.w - c.pad, c.y + c.lh - 2, label, { size: c.size, bold: true, color, align: 'right' });
          if (d !== 0) R.triangle(c.x + c.w - c.pad - tw - 6, c.y + c.lh - 5, 6, d > 0, color);
          return true;
        }
        return false;
      },
    });

  const cur = plugin.currentMeds ? plugin.currentMeds() : [];
  if (o.includeMeds && cur.length) {
    R.heading('Current medications');
    R.table([{ label: 'Medication', w: 0.32 }, { label: 'Dose and schedule', w: 0.36, wrap: true }, { label: 'For', w: 0.32, wrap: true }], cur.map((x) => [x.name, x.schedule, x.purpose]));
  }
  if (o.notes) { R.heading('Questions and notes'); R.para(o.notes); }
  if (plugin.reportExtras) R.extraSections(plugin.reportExtras({ from: from, to: to, includeNotes: o.includeGenNotes !== false, includeMissed: false }));
  R.footerAll('A1C report · estimated average glucose from the ADAG formula · for discussion with a clinician, not a diagnosis');
  return R.output();
}

/* ---------------- Settings ---------------- */
class A1CSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const c = this.containerEl, p = this.plugin, s = p.settings;
    c.empty();
    new Setting(c).setName('Folder').setDesc('Each result is a note in this folder. Reports go in "<folder>/Reports".')
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.folder).setValue(s.folder).onChange(async (v) => { s.folder = v.trim() || DEFAULT_SETTINGS.folder; await p.saveSettings(); }));
    new Setting(c).setName('Show A1C as').setDesc('Percent (NGSP, used in the US) or mmol/mol (IFCC, used in Europe including Iceland). The report always shows both.')
      .addDropdown((d) => d.addOptions({ percent: 'Percent (%)', mmol: 'mmol/mol', both: 'Both' }).setValue(s.displayUnit).onChange(async (v) => { s.displayUnit = v; await p.saveSettings(); }));
    new Setting(c).setName('Glucose unit').setDesc('For estimated average glucose and fasting glucose.')
      .addDropdown((d) => d.addOptions({ 'mmol/L': 'mmol/L', 'mg/dL': 'mg/dL' }).setValue(s.glucoseUnit).onChange(async (v) => { s.glucoseUnit = v; await p.saveSettings(); }));
    new Setting(c).setName('Guidelines and target').setHeading();
    new Setting(c).setName('Ranges').setDesc('Bodies agree that 6.5% (48 mmol/mol) or higher is the diabetes range, but not on where the at-risk range starts. ADA (US): prediabetes from 5.7% (39 mmol/mol). NICE (UK): high risk from 6.0% (42 mmol/mol).')
      .addDropdown((d) => d.addOptions({ ada: 'ADA: prediabetes 5.7–6.4%', nice: 'NICE (UK): high risk 6.0–6.4%' }).setValue(s.rangeStandard || 'ada').onChange(async (v) => { s.rangeStandard = v; applyStandard(s); await p.saveSettings(); }));
    new Setting(c).setName('Use my doctor’s target').setDesc('Show the A1C target your doctor gave you on the dashboard, chart and report. Many adults with diabetes are given a target below 7%, but yours may differ.')
      .addToggle((t) => t.setValue(!!s.useDoctorTarget).onChange(async (v) => { s.useDoctorTarget = v; if (v && !s.target) s.target = 7; await p.saveSettings(); this.display(); }));
    if (s.useDoctorTarget) {
      new Setting(c).setName('Target A1C (%)').setDesc('Results below this count as at target.')
        .addText((t) => { t.setValue(s.target ? String(s.target) : '').onChange(async (v) => { const n = K.num(v); s.target = n && n >= 4 && n <= 12 ? n : null; await p.saveSettings(); }); t.inputEl.type = 'number'; });
    }
    new Setting(c).setName('Test every').setDesc('Used for the "next test" reminder. Doctors often check A1C every 3 months while treatment is changing, and about every 6 months when it is stable.')
      .addDropdown((d) => d.addOptions({ 3: '3 months', 4: '4 months', 6: '6 months', 12: '12 months' }).setValue(String(s.intervalMonths)).onChange(async (v) => { s.intervalMonths = Number(v); await p.saveSettings(); }));
    new Setting(c).setName('Show test reminder in status bar').setDesc('When the next test is due within 14 days or overdue.')
      .addToggle((t) => t.setValue(s.showStatusBar).onChange(async (v) => { s.showStatusBar = v; await p.saveSettings(); }));
    new Setting(c).setName('Choice lists').setHeading();
    c.createEl('p', { cls: 'setting-item-description', text: 'Test types and labs are edited under Settings → Health Dashboard → Selectors.' });
  }
}

/* ---------------- Plugin ---------------- */
class A1CPlugin extends K.TrackerPlugin {
  async onload() {
    this.cfg = { viewType: VIEW_TYPE, title: 'A1C', icon: 'test-tube', defaults: DEFAULT_SETTINGS, listKeys: LIST_KEYS, Renderer: A1CRenderer, parse };
    await this.setup();
    applyStandard(this.settings);
    this.addCommand({ id: 'log-result', name: 'Log A1C result', callback: () => new ResultModal(this).open() });
    this.addCommand({ id: 'pdf-report', name: 'Create PDF report for doctor', callback: () => this.openReport() });
    this.addCommand({
      id: 'edit-current', name: 'Edit this result',
      checkCallback: (checking) => { const f = this.app.workspace.getActiveFile(); const r = f && this.recordFromFile(f); if (!r) return false; if (!checking) new ResultModal(this, r).open(); return true; },
    });
    this.addSettingTab(new A1CSettingTab(this.app, this));
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('med-status');
    this.statusEl.onclick = () => this.activateView();
  }
  stats() { return computeStats(this.getRecords(), this.settings, '', K.todayKey()); }
  fmt(pct) { return fmtA1c(this.settings, pct); }
  afterRefresh() {
    if (!this.statusEl) return;
    const st = this.settings.showStatusBar ? this.stats() : null;
    const today = K.todayKey();
    if (!st || !st.nextDue || K.daysBetween(today, st.nextDue) > 14) { this.statusEl.setText(''); this.statusEl.hide(); return; }
    this.statusEl.show();
    this.statusEl.setText(st.nextDue < today ? 'A1C test overdue' : 'A1C test due ' + K.relDays(st.nextDue, today));
  }
  openReport() {
    new K.ReportOptionsModal(this, {
      title: 'A1C report for your doctor', defaultRange: 'all',
      toggles: [['includeMeds', 'Include current medications', true]],
      build: async (o) => {
        const { file, path } = await this.writeFile(this.settings.folder + '/Reports', 'A1C report ' + (o.from || 'all') + ' to ' + o.to + '.pdf', buildReport(this, o), true);
        new Notice('Report saved to ' + path);
        return file;
      },
    }).open();
  }
  async exportCsv() {
    const rows = [['date', 'a1c_percent', 'a1c_mmol_mol', 'range', 'estimated_avg_glucose_mmol_l', 'estimated_avg_glucose_mg_dl', 'test_type', 'lab', 'ordered_by', 'fasting_glucose', 'glucose_unit', 'medications', 'notes']];
    for (const r of this.getRecords().slice().sort(sortAsc)) rows.push([r.date, r.pct, toMmol(r.pct), classify(r.pct).label, eagMmol(r.pct), eagMg(r.pct), r.testType, r.lab, r.orderedBy, r.fastingGlucose, r.glucoseUnit, r.medications.join('; '), r.notes]);
    await this.exportRows(this.settings.folder, 'A1C export', rows);
  }
}

module.exports = A1CPlugin;
module.exports._internals = { VIEW_TYPE, DEFAULT_SETTINGS, ResultModal, A1CRenderer, Renderer: A1CRenderer, parse, computeStats, classify, STANDARDS, STD, applyStandard, preLow, buildReport, toMmol, fromMmol, eagMg, eagMmol, fmtA1c, sortAsc, hasTarget, changeText };
