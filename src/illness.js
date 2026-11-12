/* Sickness and general health: illness episodes with symptoms, treatment and what helped. */
const K = KitModule;
const { Notice, PluginSettingTab, Setting, setIcon, Menu } = require('obsidian');

const VIEW_TYPE = 'sickness-dashboard';
const ENTRY = 'illness';
const SEVERITIES = ['Mild', 'Moderate', 'Severe'];
const DEFAULT_SETTINGS = {
  folder: 'Health Log',
  tempUnit: 'C',
  weekStartsMonday: true,
  showStatusBar: true,
  types: ['Common cold', 'Flu', 'COVID-19', 'Sore throat', 'Sinus infection', 'Ear infection', 'Chest infection', 'Stomach bug',
    'Food poisoning', 'Urinary tract infection', 'Allergies', 'Fever', 'Injury', 'Other'],
  symptoms: ['Fever', 'Chills', 'Cough', 'Sore throat', 'Runny or blocked nose', 'Sneezing', 'Headache', 'Body aches', 'Fatigue',
    'Nausea', 'Vomiting', 'Diarrhea', 'Stomach pain', 'Shortness of breath', 'Loss of taste or smell', 'Dizziness', 'Rash', 'Earache'],
  medications: ['Paracetamol', 'Ibuprofen', 'Throat lozenges', 'Cough syrup', 'Decongestant', 'Antihistamine', 'Oral rehydration salts', 'Antibiotics'],
  remedies: ['Rest', 'Extra sleep', 'Fluids', 'Warm drinks', 'Honey and lemon', 'Soup', 'Steam inhalation', 'Salt-water gargle',
    'Nasal rinse', 'Humidifier', 'Hot water bottle', 'Light food', 'Fresh air'],
};
const LIST_KEYS = ['types', 'symptoms', 'medications', 'remedies'];

function parse(file, fm) {
  if (!fm) return null;
  const kind = String(fm.entry || '').toLowerCase();
  if (kind === ENTRY) {
    const start = K.normDate(fm.start);
    if (!start) return null;
    let end = K.normDate(fm.end);
    if (end && end < start) end = '';
    return {
      kind: 'illness', file, path: file ? file.path : '', start, end, type: K.str(fm.type), severity: K.str(fm.severity),
      symptoms: K.asArray(fm.symptoms), tempMax: K.num(fm.temp_max), tempUnit: K.str(fm.temp_unit) || 'C',
      medications: K.asArray(fm.medications), remedies: K.asArray(fm.remedies), helped: K.asArray(fm.helped),
      sawDoctor: fm.saw_doctor === true || String(fm.saw_doctor).toLowerCase() === 'true', daysMissed: K.num(fm.days_missed),
      diagnosis: K.str(fm.diagnosis), notes: K.str(fm.notes),
    };
  }
  return null;
}
const P_times = (n) => K.plural(n, 'time');
const lengthDays = (e, today) => K.daysBetween(e.start, e.end || today || K.todayKey()) + 1;
function episodeDays(e, today) {
  const out = [];
  const last = e.end || today;
  for (let k = e.start, i = 0; k <= last && i < 90; k = K.addDaysKey(k, 1), i++) out.push(k);
  return out;
}
const fmtTemp = (v, unit) => (v == null ? '' : K.round(v, 1) + ' °' + (unit || 'C'));

function computeStats(recs, fromKey, toKey) {
  const ill = recs.filter((r) => r.kind === 'illness');
  const inRange = ill.filter((e) => (!fromKey || (e.end || toKey) >= fromKey) && e.start <= toKey).sort((a, b) => a.start.localeCompare(b.start));
  const sickDays = new Set();
  for (const e of inRange) for (const k of episodeDays(e, toKey)) if ((!fromKey || k >= fromKey) && k <= toKey) sickDays.add(k);
  const ended = inRange.filter((e) => e.end);
  const helpCount = (list) => K.tally(inRange.map((e) => e[list])).map(([n, c]) => [n, c, c + ' used' + (inRange.some((e) => e.helped.includes(n)) ? ' · helped ' + inRange.filter((e) => e[list].includes(n) && e.helped.includes(n)).length + ' of ' + c : '')]);
  return {
    episodes: inRange, count: inRange.length, sickDays: sickDays.size,
    avgLength: ended.length ? K.mean(ended.map((e) => lengthDays(e))) : null,
    daysMissed: inRange.reduce((a, e) => a + (e.daysMissed || 0), 0),
    sawDoctor: inRange.filter((e) => e.sawDoctor).length,
    types: K.tally(inRange.map((e) => (e.type ? [e.type] : []))), symptoms: K.tally(inRange.map((e) => e.symptoms)),
    medications: helpCount('medications'), remedies: helpCount('remedies'),
    ongoing: ill.filter((e) => !e.end),
  };
}

/* ---------------- Modals ---------------- */
class IllnessModal extends K.FormModal {
  constructor(plugin, ep, opts = {}) {
    super(plugin);
    this.existing = ep || null;
    this.e = ep ? Object.assign({}, ep) : { start: opts.date || K.todayKey(), end: '', type: '', severity: 'Mild', symptoms: [], tempMax: null, tempUnit: plugin.settings.tempUnit, medications: [], remedies: [], helped: [], sawDoctor: false, daysMissed: null, diagnosis: '', notes: '' };
  }
  onOpen() {
    const p = this.plugin, s = p.settings, e = this.e;
    this.begin(this.existing ? 'Edit sickness' : 'Log sickness');
    const when = this.section('When', 'calendar');
    const row = this.row(when);
    this.startIn = this.field(row, 'Started', 'date', e.start);
    this.endIn = this.field(row, 'Recovered (leave empty if still sick)', 'date', e.end);
    const q = row.createDiv({ cls: 'hk-quick' });
    q.createEl('button', { cls: 'mt-chip', text: 'Today', attr: { type: 'button' } }).onclick = () => { this.endIn.value = K.todayKey(); upd(); };
    q.createEl('button', { cls: 'mt-chip', text: 'Still sick', attr: { type: 'button' } }).onclick = () => { this.endIn.value = ''; upd(); };
    this.lenHelp = when.createDiv({ cls: 'mt-help' });
    const upd = () => {
      const st = K.normDate(this.startIn.value), en = K.normDate(this.endIn.value);
      this.lenHelp.setText(!st ? '' : en ? (en < st ? 'Recovery date is before the start.' : 'Lasted ' + K.plural(K.daysBetween(st, en) + 1, 'day') + '.') : 'Ongoing · day ' + (K.daysBetween(st, K.todayKey()) + 1) + '.');
    };
    this.startIn.addEventListener('change', upd); this.endIn.addEventListener('change', upd); upd();

    const what = this.section('What', 'thermometer');
    this.typeC = this.chips(what, 'Type of sickness', s.types, e.type, true);
    this.sevC = this.chips(what, 'How bad', SEVERITIES, e.severity, true, { allowCustom: false });
    this.symC = this.chips(what, 'Symptoms', s.symptoms, e.symptoms);
    const tr = this.row(what);
    this.tempIn = this.field(tr, 'Highest temperature (°' + s.tempUnit + ', optional)', 'number', e.tempMax, { step: '0.1', placeholder: s.tempUnit === 'F' ? '100.4' : '38.0' });

    const care = this.section('Treatment', 'pill');
    const medOpts = (p.medOptions ? p.medOptions() : []).slice();
    for (const m of s.medications) if (!medOpts.includes(m)) medOpts.push(m);
    this.medC = this.chips(care, 'Medications', medOpts, e.medications, false, { onChange: () => this.syncHelped() });
    this.remC = this.chips(care, 'Remedies', s.remedies, e.remedies, false, { onChange: () => this.syncHelped() });
    this.helpWrap = care.createDiv();
    this.helpedSel = e.helped.slice();
    this.syncHelped();
    const dr = this.row(care);
    const lab = dr.createEl('label', { cls: 'hk-check' });
    this.docCb = lab.createEl('input', { type: 'checkbox' });
    this.docCb.checked = e.sawDoctor;
    lab.appendText(' Saw a doctor or nurse');
    this.missIn = this.field(dr, 'Days off work or school', 'number', e.daysMissed, { min: '0', step: '1' });
    this.diagIn = this.area(care, 'Diagnosis or test results', e.diagnosis, 'For example "Positive COVID test" or "Strep confirmed".', 2);
    this.notesIn = this.area(care, 'Notes', e.notes, 'Anything else worth remembering.', 3);

    this.footer({
      file: this.existing && this.existing.file,
      onDelete: this.existing ? async () => { await p.trash(this.existing.file); new Notice('Moved to trash.'); } : null,
      deleteTitle: 'Delete this sickness entry?',
      saveText: this.existing ? 'Save changes' : 'Save',
      onSave: () => this.save(),
    });
  }
  syncHelped() {
    if (this.helpC) this.helpedSel = this.helpC.values();
    const opts = [...this.medC.values(), ...this.remC.values()];
    this.helpWrap.empty();
    if (!opts.length) return;
    this.helpC = this.chips(this.helpWrap, 'What helped', opts, this.helpedSel.filter((x) => opts.includes(x)), false, { allowCustom: false });
  }
  async save() {
    const p = this.plugin, s = p.settings;
    const start = K.normDate(this.startIn.value), end = K.normDate(this.endIn.value);
    if (!start) { new Notice('Choose the date it started.'); return; }
    if (end && end < start) { new Notice('The recovery date is before the start date.'); return; }
    const v = {
      entry: ENTRY, start, end, type: this.typeC.value(), severity: this.sevC.value(), symptoms: this.symC.values(),
      temp_max: K.num(this.tempIn.value), temp_unit: K.num(this.tempIn.value) != null ? s.tempUnit : '',
      medications: this.medC.values(), remedies: this.remC.values(), helped: this.helpC ? this.helpC.values() : [],
      saw_doctor: this.docCb.checked ? true : '', days_missed: K.num(this.missIn.value), diagnosis: this.diagIn.value.trim(), notes: this.notesIn.value.trim(), tags: ['sickness'],
    };
    p.remember('types', [v.type]); p.remember('symptoms', v.symptoms); p.remember('remedies', v.remedies);
    p.remember('medications', v.medications.filter((m) => !(p.medOptions && p.medOptions().includes(m))));
    await p.saveSettings();
    if (this.existing) await p.updateNote(this.existing.file, v);
    else await p.createNote(s.folder + '/Sickness', start + ' ' + (v.type || 'Sickness'), v, '# ' + (v.type || 'Sickness') + ' · ' + K.fmtKey(start) + '\n\n');
    new Notice(this.existing ? 'Sickness updated.' : 'Sickness logged.' + (end ? '' : ' Get well soon.'));
    this.close();
  }
}

/* ---------------- Dashboard ---------------- */
class IllnessRenderer {
  constructor(plugin, el) { this.plugin = plugin; this.el = el; this.range = '365'; this.cal = { monthOffset: 0 }; this.showAll = false; }
  render() {
    const p = this.plugin, s = p.settings, el = this.el;
    el.empty(); el.addClass('hk-dashboard', 'ill-dashboard');
    const recs = p.getRecords();
    const ill = recs.filter((r) => r.kind === 'illness');
    const today = K.todayKey();
    K.header(el, 'Sickness and general health', K.plural(ill.length, 'sickness entry', 'sickness entries'), [
      { select: [['90', 'Last 90 days'], ['180', 'Last 6 months'], ['365', 'Last 12 months'], ['all', 'All time']], value: this.range, label: 'Period', onChange: (v) => { this.range = v; this.render(); } },
      { icon: 'download', text: 'CSV', onClick: () => p.exportCsv() },
      { icon: 'file-text', text: 'Doctor report', onClick: () => p.openReport() },
      { icon: 'plus', text: 'Log sickness', cta: true, onClick: () => new IllnessModal(p).open() },
    ]);
    if (!ill.length) {
      K.emptyState(el, 'thermometer', 'Nothing logged yet', 'Log a sickness when you feel ill, with the type, dates, how bad it was, symptoms, temperature, medications and remedies, and what helped.', 'Log sickness', () => new IllnessModal(p).open());
      return;
    }
    for (const e of ill.filter((x) => !x.end)) {
      const b = el.createDiv({ cls: 'hk-banner is-warn' });
      setIcon(b.createSpan({ cls: 'hk-btn-icon' }), 'thermometer');
      b.createSpan({ text: (e.type || 'Sick') + ' since ' + K.fmtKey(e.start) + ' · day ' + lengthDays(e, today) + '.' });
      b.createDiv({ cls: 'mt-spacer' });
      b.createEl('button', { text: 'I’m better', cls: 'mod-cta' }).onclick = () => p.endEpisode(e);
      b.createEl('button', { text: 'Edit' }).onclick = () => new IllnessModal(p, e).open();
    }
    const from = this.range === 'all' ? '' : K.addDaysKey(today, -(Number(this.range) - 1));
    const st = computeStats(recs, from, today);
    const firstStart = ill.length ? ill.map((e) => e.start).sort()[0] : today;
    const rangeDays = Math.max(1, K.daysBetween(from || firstStart, today) + 1);
    const tile = K.tiles(el);
    if (st.ongoing.length) tile('Right now', 'Sick · day ' + lengthDays(st.ongoing[0], today), st.ongoing[0].type || '', 'is-warn');
    else {
      const last = ill.filter((e) => e.end).sort((a, b) => a.end.localeCompare(b.end)).pop();
      tile('Right now', 'Well', last ? K.plural(K.daysBetween(last.end, today), 'day') + ' since last sickness' : 'No sickness logged', 'ill-tile-good');
    }
    tile('Times sick', String(st.count), st.count ? st.sawDoctor + ' with a doctor or nurse' : 'In this period');
    tile('Sick days', String(st.sickDays), Math.round((100 * st.sickDays) / rangeDays) + '% of days');
    tile('Average length', st.avgLength != null ? K.round(st.avgLength, 1) + ' days' : '–', 'Recovered episodes');
    tile('Days missed', String(st.daysMissed), 'Work or school');
    tile('Most common', st.types.length ? st.types[0][0] : '–', st.types.length ? P_times(st.types[0][1]) : 'In this period');

    const grid = el.createDiv({ cls: 'hk-grid' });
    // calendar
    const calCard = K.card(grid, null, null, 'hk-calendar');
    const sickMap = new Map();
    for (const e of ill) for (const k of episodeDays(e, today)) { if (!sickMap.has(k)) sickMap.set(k, []); sickMap.get(k).push(e); }
    K.monthCalendar(calCard, this.cal, () => this.render(), (k) => {
      const info = { cls: [], marks: [], tip: [] };
      const es = sickMap.get(k);
      if (es) {
        const sev = Math.max(...es.map((x) => Math.max(0, SEVERITIES.indexOf(x.severity))));
        info.cls.push('ill-sick', 'ill-sev-' + sev);
        for (const x of es) info.tip.push((x.type || 'Sick') + (x.severity ? ' · ' + x.severity.toLowerCase() : ''));
      }
      return info;
    }, (evt, k) => this.dayMenu(evt, k, sickMap.get(k) || []), s.weekStartsMonday);
    const lg = calCard.createDiv({ cls: 'hk-legend' });
    const li = (cls, t) => { const x = lg.createSpan({ cls: 'hk-legend-item' }); x.createSpan({ cls: 'hk-swatch ' + cls }); x.createSpan({ text: t }); };
    li('ill-sev-0', 'Mild'); li('ill-sev-1', 'Moderate'); li('ill-sev-2', 'Severe');

    // months
    const mc = K.card(grid, 'Sick days per month', 'Last 12 months');
    const months = [];
    for (let i = 11; i >= 0; i--) { const d = K.parseKey(today); d.setDate(1); d.setMonth(d.getMonth() - i); months.push({ y: d.getFullYear(), m: d.getMonth(), n: 0 }); }
    for (const k of sickMap.keys()) { const d = K.parseKey(k); const mo = months.find((x) => x.y === d.getFullYear() && x.m === d.getMonth()); if (mo) mo.n++; }
    K.vbars(mc, months.map((x) => ({ label: K.MONTHS[x.m], value: x.n, title: K.MONTHS_LONG[x.m] + ' ' + x.y + ': ' + K.plural(x.n, 'sick day') })), { cls: 'ill-bar', height: 170 });

    for (const [title, list, sub] of [['Types of sickness', st.types], ['Symptoms', st.symptoms], ['Medications', st.medications, 'Times used · helped of times used'], ['Remedies', st.remedies, 'Times used · helped of times used']]) {
      const c = K.card(grid, title, sub);
      K.hbars(c, list, sub ? 0 : st.count, { cls: 'ill-fill' });
    }

    // table
    if (st.episodes.length) {
      el.createDiv({ cls: 'hk-section-heading', text: 'Sickness in this period' });
      const box = el.createDiv({ cls: 'hk-card hk-table-card' });
      const t = box.createEl('table', { cls: 'hk-table' });
      const hr = t.createEl('thead').createEl('tr');
      for (const h of ['Started', 'Length', 'Type', 'How bad', 'Temp.', 'Symptoms', 'Treatment', '']) hr.createEl('th', { text: h });
      const tb = t.createEl('tbody');
      const rows = st.episodes.slice().reverse();
      for (const e of this.showAll ? rows : rows.slice(0, 15)) {
        const tr = tb.createEl('tr');
        tr.createEl('td', { text: K.fmtKey(e.start) });
        tr.createEl('td', { text: e.end ? K.plural(lengthDays(e), 'day') : 'Ongoing (day ' + lengthDays(e, today) + ')' });
        tr.createEl('td', { text: e.type || '–' });
        tr.createEl('td').createSpan({ cls: 'ill-sev-badge ill-sev-' + Math.max(0, SEVERITIES.indexOf(e.severity)), text: e.severity || '–' });
        tr.createEl('td', { text: fmtTemp(e.tempMax, e.tempUnit) || '–' });
        tr.createEl('td', { cls: 'hk-td-notes', text: e.symptoms.join(', ') || '–' });
        tr.createEl('td', { cls: 'hk-td-notes', text: [...e.medications, ...e.remedies].map((x) => (e.helped.includes(x) ? x + ' ✓' : x)).join(', ') || '–' });
        const ed = tr.createEl('td').createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit' } });
        setIcon(ed, 'pencil');
        ed.onclick = () => new IllnessModal(p, e).open();
      }
      if (rows.length > 15 && !this.showAll) box.createEl('button', { cls: 'hk-more', text: 'Show all ' + rows.length }).onclick = () => { this.showAll = true; this.render(); };
      box.createDiv({ cls: 'hk-muted hk-small', text: '✓ = marked as helped.' });
    }
  }
  dayMenu(evt, k, eps) {
    const p = this.plugin;
    const menu = new Menu();
    for (const e of eps) menu.addItem((it) => it.setTitle('Edit ' + (e.type || 'sickness') + ' · from ' + K.fmtKey(e.start)).setIcon('pencil').onClick(() => new IllnessModal(p, e).open()));
    menu.addItem((it) => it.setTitle('Log sickness starting ' + K.fmtKey(k)).setIcon('thermometer').onClick(() => new IllnessModal(p, null, { date: k }).open()));
    menu.showAtMouseEvent(evt);
  }
}

/* ---------------- PDF report ---------------- */
function buildReport(plugin, o) {
  const recs = plugin.getRecords();
  const to = o.to || K.todayKey();
  const first = recs.length ? recs.map((r) => r.start).sort()[0] : to;
  const from = o.from || first;
  const st = computeStats(recs, from, to);
  const days = Math.max(1, K.daysBetween(from, to) + 1);
  const range = K.fmtKey(from) + ' – ' + K.fmtKey(to);
  const R = new K.Report('Sickness report', range, '#e08a2b');
  R.cover([o.name ? 'Name: ' + o.name : '', 'Period: ' + range + ' (' + K.plural(days, 'day') + ')', 'Created ' + K.fmtKey(K.todayKey())]);
  if (!st.count) R.para('No sickness was logged in this period.');
  else {
    R.heading('Summary');
    R.stats([
      ['Times sick', String(st.count), st.sawDoctor + ' with a doctor or nurse'],
      ['Sick days', String(st.sickDays), Math.round((100 * st.sickDays) / days) + '% of days in the period'],
      ['Average length', st.avgLength != null ? K.round(st.avgLength, 1) + ' days' : '–', 'recovered episodes'],
      ['Days missed', String(st.daysMissed), 'work or school'],
      ['Most common', st.types.length ? st.types[0][0] : '–', st.types.length ? K.plural(st.types[0][1], 'time') : ''],
      ['Ongoing now', st.ongoing.length ? (st.ongoing[0].type || 'Sick') : 'No', st.ongoing.length ? 'since ' + K.fmtKey(st.ongoing[0].start) : ''],
    ]);
    const freq = (title, list, helped) => {
      if (!list.length) return;
      R.heading(title);
      const col = { 'Types of sickness': 'Type', Symptoms: 'Symptom', 'Medications used': 'Medication', 'Remedies used': 'Remedy' }[title] || title;
      R.table([{ label: col, w: 0.5 }, { label: 'Times', w: 0.2, align: 'right' }, { label: helped ? 'Helped' : 'Share', w: 0.3, align: 'right' }],
        list.slice(0, 12).map(([n, c]) => [n, String(c), helped ? String(st.episodes.filter((e) => e.helped.includes(n) && (e.medications.includes(n) || e.remedies.includes(n))).length) : Math.round((100 * c) / st.count) + '%']));
    };
    freq('Types of sickness', st.types);
    freq('Symptoms', st.symptoms);
    freq('Medications used', st.medications, true);
    freq('Remedies used', st.remedies, true);
    if (o.includeLog !== false) {
      R.heading('All sickness episodes', 'Oldest first. ✓ marks what helped.');
      R.table([{ label: 'Started', w: 0.14 }, { label: 'Length', w: 0.11 }, { label: 'Type', w: 0.15, wrap: true }, { label: 'How bad', w: 0.1 }, { label: 'Temp.', w: 0.08 }, { label: 'Symptoms, treatment, notes', w: 0.42, wrap: true }],
        st.episodes.map((e) => [K.fmtKey(e.start), e.end ? K.plural(lengthDays(e), 'day') : 'ongoing', e.type || '–', e.severity || '–', fmtTemp(e.tempMax, e.tempUnit) || '–',
          [e.symptoms.join(', '), [...e.medications, ...e.remedies].map((x) => (e.helped.includes(x) ? x + ' (helped)' : x)).join(', '), e.sawDoctor ? 'saw a doctor' : '', e.daysMissed ? e.daysMissed + ' days missed' : '', e.diagnosis, e.notes].filter(Boolean).join('. ')]),
        { size: 8, cellColor: (ri, ci) => (ci === 3 ? K.MI.hexRgb(['#c98a2b', '#e08a2b', '#d1495b'][Math.max(0, SEVERITIES.indexOf(st.episodes[ri].severity))]) : null), boldColored: true });
    }
  }
  if (o.notes) { R.heading('Questions and notes'); R.para(o.notes); }
  if (plugin.reportExtras) R.extraSections(plugin.reportExtras({ from, to, includeNotes: o.includeGenNotes !== false, includeMissed: false }));
  R.footerAll('Sickness report · self-reported · for discussion with a clinician, not a diagnosis');
  return R.output();
}

class IllnessSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const c = this.containerEl, p = this.plugin, s = p.settings;
    c.empty();
    new Setting(c).setName('Folder').setDesc('Sickness entries go in "<folder>/Sickness".')
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.folder).setValue(s.folder).onChange(async (v) => { s.folder = v.trim() || DEFAULT_SETTINGS.folder; await p.saveSettings(); }));
    new Setting(c).setName('Temperature unit').addDropdown((d) => d.addOptions({ C: 'Celsius (°C)', F: 'Fahrenheit (°F)' }).setValue(s.tempUnit).onChange(async (v) => { s.tempUnit = v; await p.saveSettings(); }));
    new Setting(c).setName('Week starts on Monday').addToggle((t) => t.setValue(s.weekStartsMonday).onChange(async (v) => { s.weekStartsMonday = v; await p.saveSettings(); }));
    new Setting(c).setName('Show ongoing sickness in status bar').addToggle((t) => t.setValue(s.showStatusBar).onChange(async (v) => { s.showStatusBar = v; await p.saveSettings(); }));
    new Setting(c).setName('Choice lists').setHeading();
    c.createEl('p', { cls: 'setting-item-description', text: 'Sickness types, symptoms, medications and remedies are edited under Settings → Health Dashboard → Selectors.' });
  }
}

class SicknessPlugin extends K.TrackerPlugin {
  async onload() {
    this.cfg = { viewType: VIEW_TYPE, title: 'Sickness and general health', icon: 'thermometer', defaults: DEFAULT_SETTINGS, listKeys: LIST_KEYS, Renderer: IllnessRenderer, parse };
    await this.setup();
    this.addCommand({ id: 'log-sickness', name: 'Log sickness', callback: () => new IllnessModal(this).open() });
    this.addCommand({ id: 'pdf-report', name: 'Create PDF report for doctor', callback: () => this.openReport() });
    this.addCommand({
      id: 'end-sickness', name: 'I’m better (end ongoing sickness)',
      checkCallback: (checking) => { const e = this.ongoing()[0]; if (!e) return false; if (!checking) this.endEpisode(e); return true; },
    });
    this.addCommand({
      id: 'edit-current', name: 'Edit this entry',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile(); const r = f && this.recordFromFile(f);
        if (!r) return false;
        if (!checking) new IllnessModal(this, r).open();
        return true;
      },
    });
    this.addSettingTab(new IllnessSettingTab(this.app, this));
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('ill-status');
    this.statusEl.onclick = () => this.activateView();
  }
  ongoing() { return this.getRecords().filter((r) => r.kind === 'illness' && !r.end).sort((a, b) => b.start.localeCompare(a.start)); }
  stats(fromKey, toKey) { return computeStats(this.getRecords(), fromKey, toKey); }
  afterRefresh() {
    if (!this.statusEl) return;
    const e = this.settings.showStatusBar ? this.ongoing()[0] : null;
    if (!e) { this.statusEl.setText(''); this.statusEl.hide(); return; }
    this.statusEl.show();
    this.statusEl.setText((e.type || 'Sick') + ' · day ' + lengthDays(e, K.todayKey()));
  }
  async endEpisode(e) {
    await this.updateNote(e.file, { end: K.todayKey() });
    new Notice('Glad you’re better. ' + (e.type || 'Sickness') + ' lasted ' + K.plural(lengthDays(e, K.todayKey()), 'day') + '.');
  }
  openReport() {
    new K.ReportOptionsModal(this, {
      title: 'Sickness report for your doctor', defaultRange: '365',
      toggles: [['includeLog', 'Include every sickness episode', true]],
      build: async (o) => {
        const { file, path } = await this.writeFile(this.settings.folder + '/Reports', 'Sickness report ' + (o.from || 'all') + ' to ' + o.to + '.pdf', buildReport(this, o), true);
        new Notice('Report saved to ' + path);
        return file;
      },
    }).open();
  }
  async exportCsv() {
    const rows = [['start', 'end', 'type', 'severity', 'symptoms', 'temp_max', 'temp_unit', 'medications', 'remedies', 'helped', 'saw_doctor', 'days_missed', 'diagnosis', 'notes']];
    for (const r of this.getRecords().sort((a, b) => a.start.localeCompare(b.start))) {
      rows.push([r.start, r.end, r.type, r.severity, r.symptoms.join('; '), r.tempMax, r.tempMax != null ? r.tempUnit : '', r.medications.join('; '), r.remedies.join('; '), r.helped.join('; '), r.sawDoctor ? 'yes' : '', r.daysMissed, r.diagnosis, r.notes]);
    }
    await this.exportRows(this.settings.folder, 'Sickness export', rows);
  }
}

module.exports = SicknessPlugin;
module.exports._internals = { VIEW_TYPE, DEFAULT_SETTINGS, IllnessModal, IllnessRenderer, Renderer: IllnessRenderer, parse, computeStats, episodeDays, lengthDays, SEVERITIES, buildReport };
