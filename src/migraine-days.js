/* ---- Day by day inside one migraine episode (added by Health Dashboard) ----
   An episode can list days: [{ date, pain, symptoms, head_location, relief, notes }]. Pain, symptoms and where it hurts
   on a day that isn't listed are the last listed day's before it; before any, the episode's own values apply.
   Medications keep their own date in the episode's medication list. Episodes without days work as before. */
function parseEpDays(v) {
  if (!Array.isArray(v)) return [];
  return v.map((d) => (d && typeof d === 'object' ? {
    date: String(d.date || '').slice(0, 10), pain: asPain(d.pain), symptoms: asArray(d.symptoms),
    headLocation: asArray(d.head_location), relief: asArray(d.relief), notes: d.notes ? String(d.notes) : '',
  } : null))
    .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}
const dayToFm = (d) => {
  const o = { date: d.date, pain: d.pain == null ? 0 : d.pain, symptoms: d.symptoms || [] };
  if (d.headLocation && d.headLocation.length) o.head_location = d.headLocation;
  if (d.relief && d.relief.length) o.relief = d.relief;
  if (d.notes) o.notes = d.notes;
  return o;
};
/** Pain, symptoms and where it hurt on one calendar day of an episode */
function epDay(ep, key) {
  let cur = null;
  for (const d of ep.days || []) if (d.date <= key) cur = d;
  if (!cur) return { pain: ep.painMax, symptoms: ep.symptoms, headLocation: ep.headLocation || [], relief: [], logged: false, from: null };
  const exact = cur.date === key;
  return { pain: cur.pain != null ? cur.pain : ep.painMax, symptoms: cur.symptoms, headLocation: cur.headLocation || [], relief: exact ? cur.relief || [] : [], notes: exact ? cur.notes : '', logged: exact, from: cur.date };
}
const epDayPain = (ep, key) => { const v = (ep.days && ep.days.length) ? epDay(ep, key).pain : ep.painMax; return v == null ? ep.painMax || 0 : v; };
/** Average pain over every day of the episode (each day's own pain, or the day before's when unchanged), to one decimal */
function autoPainAvg(ep) {
  const start = startOfDay(ep.start), last = startOfDay(ep.end || new Date());
  const n = Math.max(1, Math.min(31, spanDays(start, last < start ? start : last)));
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const key = dayKey(addDays(start, i));
    let p = ep.painMax || 0;
    for (const d of ep.days || []) if (d.date <= key && d.pain != null) p = d.pain;
    sum += p;
  }
  return Math.round((sum / n) * 10) / 10;
}
const asPainAvg = (v) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v != null ? Math.max(0, Math.min(PAIN_MAX, Math.round(n * 10) / 10)) : null; };
const uniq = (xs) => xs.filter((x, i) => x && xs.indexOf(x) === i);
/** Medication suggestions: the Medications tracker's list first, then names used before */
const medNameList = (plugin) => { const l = (plugin.medOptions ? plugin.medOptions() : []).slice(); for (const m of plugin.settings.medications) if (!l.includes(m)) l.push(m); return l; };
/*@@MODAL@@*/
/**
 * The full episode window. The episode itself holds only when it started and ended, type, place, possible causes
 * and notes; pain, where it hurt, symptoms, relief and medications are kept per day, in the list of days at the end.
 */
EpisodeModal.prototype.onOpen = function () {
  const { contentEl, modalEl } = this;
  const s = this.plugin.settings;
  modalEl.addClass('mt-modal', 'mt-episode-modal');
  contentEl.empty();
  this.titleEl.setText(this.existing ? 'Edit migraine episode' : 'Log a migraine');

  /* When */
  const when = this.section('When', 'clock');
  const grid = when.createDiv({ cls: 'mt-grid-2' });
  this.startInput = this.field(grid, 'Started').createEl('input', { type: 'date', cls: 'mt-input' });
  this.startInput.value = toDateValue(this.ep.start);
  const endField = this.field(grid, 'Ended');
  const endRow = endField.createDiv({ cls: 'mt-row' });
  this.endInput = endRow.createEl('input', { type: 'date', cls: 'mt-input' });
  if (this.ep.end) this.endInput.value = toDateValue(this.ep.end);
  const nowBtn = endRow.createEl('button', { text: 'Today', cls: 'mt-small-btn', attr: { type: 'button' } });
  nowBtn.onclick = () => { this.endInput.value = toDateValue(new Date()); this.updateDuration(); };
  endField.createDiv({ cls: 'mt-help', text: 'Leave empty if it’s still going.' });
  this.durationEl = when.createDiv({ cls: 'mt-duration' });
  this.startInput.addEventListener('change', () => this.updateDuration());
  this.endInput.addEventListener('change', () => this.updateDuration());
  this.label(when, 'Time of day it started');
  this.todChips = new ChipSelect(when, { options: TIME_OF_DAY.map((t) => t.value), hints: Object.fromEntries(TIME_OF_DAY.map((t) => [t.value, t.hint])), selected: this.ep.timeOfDay ? [this.ep.timeOfDay] : [], single: true, allowCustom: false });
  this.label(when, 'Time of day it ended');
  this.todEndChips = new ChipSelect(when, {
    options: TIME_OF_DAY_END.map((t) => t.value), hints: Object.fromEntries(TIME_OF_DAY_END.map((t) => [t.value, t.hint])), selected: this.ep.timeOfDayEnd ? [this.ep.timeOfDayEnd] : [], single: true, allowCustom: false,
    onChange: (v) => { if (v.length && !this.endInput.value) { this.endInput.value = toDateValue(new Date()); this.updateDuration(); } },
  });
  this.todEndHelp = when.createDiv({ cls: 'mt-help' });

  /* Type and place */
  const kind = this.section('Type and place', 'tag');
  this.label(kind, 'Migraine type');
  this.typeChips = new ChipSelect(kind, { options: s.types, selected: this.ep.type ? [this.ep.type] : [], single: true });
  this.label(kind, 'Where were you when it started?');
  this.whereChips = new ChipSelect(kind, { options: s.attackLocations, selected: this.ep.attackLocation ? [this.ep.attackLocation] : [], single: true });

  /* Possible causes */
  const trig = this.section('Possible causes', 'zap');
  this.trigChips = new ChipSelect(trig, { options: s.triggers, selected: this.ep.triggers });

  /* Notes */
  const notes = this.section('Notes', 'pencil');
  this.notesInput = notes.createEl('textarea', { cls: 'mt-textarea', attr: { rows: 2, placeholder: 'Anything else worth remembering…' } });
  this.notesInput.value = this.ep.notes || '';

  /* Migraine days, at the end */
  this.daysSec = this.section('Migraine days', 'calendar-days');
  this.renderDays();

  const footer = contentEl.createDiv({ cls: 'mt-footer' });
  if (this.existing) footer.createEl('button', { text: 'Delete', cls: 'mod-warning', attr: { type: 'button' } }).onclick = () => this.confirmDelete();
  footer.createDiv({ cls: 'mt-spacer' });
  footer.createEl('button', { text: 'Cancel', attr: { type: 'button' } }).onclick = () => this.close();
  footer.createEl('button', { text: this.existing ? 'Save changes' : 'Save episode', cls: 'mod-cta', attr: { type: 'button' } }).onclick = () => this.save();
  this.updateDuration();
};

/** Medication rows stay with their day when the list of days is redrawn */
EpisodeModal.prototype.snapshotMeds = function () {
  if (this.medRowEls) this.medState = this.medRowEls.map((r) => ({ name: r.name.value, dose: r.dose.value, date: r.date.value, time: r.time.value, effect: r.effect.value }));
  else if (!this.medState) this.medState = this.ep.medications.map((m) => Object.assign({}, m, { date: medDayKey(m, this.ep) }));
};

/** The list of migraine days: each day's pain, where it hurt, symptoms, relief, medications and notes */
EpisodeModal.prototype.renderDays = function () {
  const sec = this.daysSec;
  if (!sec || !this.startInput) return;
  if (!this.dayState) this.dayState = new Map((this.ep.days || []).map((d) => [d.date, Object.assign({}, d, { symptoms: d.symptoms.slice(), headLocation: (d.headLocation || []).slice(), relief: (d.relief || []).slice() })]));
  this.snapshotMeds();
  if (this.daysBox) this.daysBox.remove();
  const box = sec.createDiv({ cls: 'mt-days' });
  this.daysBox = box;
  this.medRowEls = [];
  const st = parseDT(this.startInput.value);
  if (!st) return;
  const en = parseDT(this.endInput.value) || new Date();
  const n = Math.max(1, Math.min(31, spanDays(st, en < st ? st : en)));
  const keys = Array.from({ length: n }, (_, i) => dayKey(addDays(startOfDay(st), i)));
  box.createDiv({ cls: 'mt-help', text: 'A day you don’t change keeps the pain, where it hurt and symptoms of the day before. Relief, medications and notes belong to their own day.' });
  const s = this.plugin.settings;
  this.medListId = this.medListId || 'mt-meds-' + Date.now();
  { const dl = box.createEl('datalist', { attr: { id: this.medListId } }); for (const m of medNameList(this.plugin)) dl.createEl('option', { attr: { value: m } }); }
  let prev = null;
  keys.forEach((key, i) => {
    const logged = this.dayState.get(key);
    const base = i === 0 ? { pain: this.ep.painMax == null ? Math.ceil(PAIN_MAX * 0.6) : this.ep.painMax, symptoms: this.ep.symptoms || [], headLocation: this.ep.headLocation || [] } : prev;
    const cur = logged ? { pain: logged.pain != null ? logged.pain : base.pain, symptoms: logged.symptoms, headLocation: logged.headLocation || [] } : base;
    const row = box.createDiv({ cls: 'mt-day' + (logged ? ' is-logged' : '') });
    const head = row.createDiv({ cls: 'mt-day-head' });
    head.createSpan({ cls: 'mt-day-title', text: 'Day ' + (i + 1) + ' · ' + fmtDate(parseDT(key)) });
    const pill = head.createSpan({ cls: 'mt-pain-pill', text: (cur.pain == null ? '–' : cur.pain) + '/' + PAIN_MAX });
    if (cur.pain) pill.style.background = painColor(cur.pain, 0.75);
    head.createSpan({ cls: 'mt-day-sum', text: [cur.headLocation.join(', '), cur.symptoms.join(', ') || 'No symptoms'].filter(Boolean).join(' · ') + (logged ? '' : i === 0 ? ' · not logged yet' : ' · same as day ' + i) });
    const btn = head.createEl('button', { cls: 'mt-small-btn', text: logged ? (i === 0 ? 'Clear this day' : 'Same as day ' + i) : 'Change this day', attr: { type: 'button' } });
    const del = head.createEl('button', { cls: 'mt-icon-btn mt-day-del', attr: { type: 'button', 'aria-label': 'Delete this day' } });
    setIcon(del, 'trash-2');
    del.onclick = () => this.deleteDay(key, i, n);
    btn.onclick = () => {
      if (logged) this.dayState.delete(key);
      else this.dayState.set(key, { date: key, pain: cur.pain, symptoms: cur.symptoms.slice(), headLocation: cur.headLocation.slice(), relief: [], notes: '' });
      this.renderDays();
    };
    if (logged) {
      const ed = row.createDiv({ cls: 'mt-day-edit' });
      this.painSelector(ed, 'Pain', cur.pain == null ? 0 : cur.pain, (v) => { logged.pain = v; this.renderDays(); });
      ed.createDiv({ cls: 'mt-label', text: 'Where it hurt' });
      new ChipSelect(ed, { options: s.headLocations, selected: logged.headLocation || [], onChange: (v) => { logged.headLocation = v.slice(); } });
      ed.createDiv({ cls: 'mt-label', text: 'Symptoms' });
      new ChipSelect(ed, { options: s.symptoms, selected: logged.symptoms, onChange: (v) => { logged.symptoms = v.slice(); } });
      ed.createDiv({ cls: 'mt-label', text: 'Relief tried' });
      new ChipSelect(ed, { options: s.reliefs, selected: logged.relief || [], onChange: (v) => { logged.relief = v.slice(); } });
      ed.createDiv({ cls: 'mt-label', text: 'Notes' });
      const ta = ed.createEl('textarea', { cls: 'mt-textarea', attr: { rows: 1, placeholder: 'Anything about this day…' } });
      ta.value = logged.notes || '';
      ta.addEventListener('input', () => { logged.notes = ta.value; });
    }
    // medications are kept with their day, whether or not the rest of the day changed
    const md = row.createDiv({ cls: 'mt-day-meds' });
    md.createDiv({ cls: 'mt-label', text: 'Medications' });
    this.medRows = md.createDiv({ cls: 'mt-med-rows' });
    const mine = (this.medState || []).filter((m) => (m.date || keys[0]) === key || (i === 0 && (!m.date || m.date < keys[0])) || (i === n - 1 && m.date > keys[n - 1]));
    for (const m of mine) this.addMedRow(Object.assign({}, m, { date: key }));
    const add = md.createEl('button', { cls: 'mt-add-med', attr: { type: 'button' } });
    setIcon(add.createSpan(), 'plus');
    add.createSpan({ text: 'Add medication' });
    const rows = this.medRows;
    add.onclick = () => { this.medRows = rows; this.addMedRow({ name: '', dose: '', date: key, time: '', effect: 'Not sure' }, true); };
    prev = cur;
  });
};
/**
 * Delete one day: its pain, symptoms, relief, notes and medications go. The first or last day also moves the
 * start or end date; a day in the middle then keeps the day before's values. A one-day migraine is deleted whole.
 */
EpisodeModal.prototype.deleteDay = function (key, i, n) {
  if (n <= 1) { if (this.existing) this.confirmDelete(); else new Notice('A migraine needs at least one day.'); return; }
  this.snapshotMeds();
  this.medState = (this.medState || []).filter((m) => m.date !== key);
  this.medRowEls = null;
  if (this.dayState) this.dayState.delete(key);
  if (i === 0) { this.startInput.value = dayKey(addDays(parseDT(key), 1)); new Notice('Day deleted. The migraine now starts ' + fmtDate(parseDT(this.startInput.value)) + '.'); }
  else if (i === n - 1) { this.endInput.value = dayKey(addDays(parseDT(key), -1)); new Notice('Day deleted. The migraine now ends ' + fmtDate(parseDT(this.endInput.value)) + '.'); }
  else new Notice('Day deleted. It now keeps the day before’s pain and symptoms.');
  this.updateDuration();
};
/** Days the person changed, inside the episode's dates */
EpisodeModal.prototype.collectDays = function (start, end) {
  if (!this.dayState) return this.ep.days || [];
  const lo = dayKey(start), hi = dayKey(end || new Date());
  return [...this.dayState.entries()].filter(([k]) => k >= lo && k <= hi).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, pain: v.pain == null ? 0 : v.pain, symptoms: v.symptoms || [], headLocation: v.headLocation || [], relief: v.relief || [], notes: v.notes || '' }));
};
/** The episode from the window: overall pain, symptoms, where it hurt and relief come from its days */
EpisodeModal.prototype.collect = function () {
  const start = parseDT(this.startInput.value);
  if (!start) { new Notice('Please set the date the migraine started.'); return null; }
  const end = parseDT(this.endInput.value);
  if (end && end < start) { new Notice('The end date can’t be before the start date.'); return null; }
  const days = this.collectDays(start, end);
  const day1Logged = days.some((d) => d.date === dayKey(start));
  const base = !days.length || !day1Logged ? this.ep : { painMax: 0, symptoms: [], headLocation: [], relief: [] };
  this.snapshotMeds();
  return {
    start, end,
    type: this.typeChips.value(),
    attackLocation: this.whereChips.value(),
    timeOfDay: this.todChips.value(),
    timeOfDayEnd: end ? this.todEndChips.value() : '',
    painMax: Math.max(base.painMax || 0, ...days.map((d) => d.pain || 0)),
    painAvg: this.ep.painAvg,
    headLocation: uniq((base.headLocation || []).concat(...days.map((d) => d.headLocation))),
    symptoms: uniq((base.symptoms || []).concat(...days.map((d) => d.symptoms))),
    triggers: this.trigChips.values(),
    relief: uniq((base.relief || []).concat(...days.map((d) => d.relief))),
    medications: (this.medState || []).filter((m) => String(m.name || '').trim()).map((m) => ({ name: m.name.trim(), dose: (m.dose || '').trim(), date: m.date, time: m.time || '', effect: m.effect || 'Not sure' })),
    notes: this.notesInput.value.trim(),
    days,
  };
};

/**
 * One window for logging a migraine, in two parts:
 *  1. About this migraine (only when it starts): date and time of day it started, type, place, possible causes, notes
 *  2. The day: pain, where it hurts, symptoms, relief and medications (the same questions every day)
 * Ticking "last day" ends the migraine on that day's date and asks the time of day it ended. Saving shows a summary of the episode.
 * mode: 'start' | 'day' | 'end' (a day that no migraine covers starts one)
 */
class MigraineDayModal extends EpisodeModal {
  constructor(plugin, date, opts = {}) {
    super(plugin, null, {});
    this.day = startOfDay(date || new Date());
    this.opts = opts;
  }
  findEpisode(key) {
    const eps = this.plugin.getEpisodes();
    return eps.find((e) => dayKey(e.start) <= key && (!e.end || dayKey(e.end) >= key)) || null;
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    const s = this.plugin.settings;
    modalEl.addClass('mt-modal', 'mt-day-modal');
    contentEl.empty();
    const key = dayKey(this.day);
    const ep = this.opts.mode === 'start' ? null : this.findEpisode(key);
    this.target = ep;
    this.mode = ep ? (this.opts.mode === 'end' ? 'end' : 'day') : 'start';
    this.titleEl.setText(this.mode === 'start' ? 'Migraine started' : this.mode === 'end' ? 'End migraine' : 'Log migraine day');
    const v = ep ? epDay(ep, key) : { pain: null, symptoms: [], headLocation: [], relief: [], notes: '', logged: false };
    const isToday = key === dayKey(new Date());

    /* Section 1: about this migraine (start only) */
    if (this.mode === 'start') {
      const about = this.section('1 · About this migraine', 'brain');
      const g = about.createDiv({ cls: 'mt-grid-2' });
      this.dateInput = this.field(g, 'Date started').createEl('input', { type: 'date', cls: 'mt-input' });
      this.dateInput.value = key;
      this.label(about, 'Time of day it started');
      this.todChips = new ChipSelect(about, { options: TIME_OF_DAY.map((t) => t.value), hints: Object.fromEntries(TIME_OF_DAY.map((t) => [t.value, t.hint])), selected: isToday ? [deriveTimeOfDay(new Date())] : [], single: true, allowCustom: false });
      this.label(about, 'Migraine type');
      this.typeChips = new ChipSelect(about, { options: s.types, selected: [], single: true });
      this.label(about, 'Where were you when it started?');
      this.whereChips = new ChipSelect(about, { options: s.attackLocations, selected: [], single: true });
      this.label(about, 'Possible causes');
      this.trigChips = new ChipSelect(about, { options: s.triggers, selected: [] });
      this.label(about, 'Notes');
      this.notesInput = about.createEl('textarea', { cls: 'mt-textarea', attr: { rows: 2, placeholder: 'Anything else about this migraine…' } });
      this.notesInput.value = '';
    }

    /* Section 2: the day (same questions every day) */
    const dayTitle = this.mode === 'start' ? '2 · How it is today' : (ep ? 'Day ' + spanDays(ep.start, this.day) + ' · ' + fmtDate(this.day) : fmtDate(this.day));
    const daySec = this.section(dayTitle, 'calendar-days');
    if (this.mode !== 'start') {
      const g = daySec.createDiv({ cls: 'mt-grid-2' });
      this.dateInput = this.field(g, 'Date').createEl('input', { type: 'date', cls: 'mt-input' });
      this.dateInput.value = key;
      this.info = daySec.createDiv({ cls: 'mt-duration' });
      const setInfo = () => {
        const k = this.dateInput.value, e = k ? this.findEpisode(k) : null;
        this.info.setText(e ? 'Day ' + spanDays(e.start, parseDT(k)) + ' of the migraine that started ' + fmtDate(e.start) + (e.end ? ' (ended ' + fmtDate(e.end) + ')' : ' (still going)') + '.' : 'No migraine covers this day: saving starts a new one.');
      };
      this.dateInput.addEventListener('change', setInfo);
      setInfo();
    }
    this.startInput = this.dateInput; // medication rows use this date
    const fresh = !v.logged && !(ep && ep.days && ep.days.length) && !v.pain;
    this.maxPain = this.painSelector(daySec, 'Pain today', v.pain == null || fresh ? Math.ceil(PAIN_MAX * 0.6) : v.pain);
    if (ep && !v.logged && v.from) daySec.createDiv({ cls: 'mt-help', text: 'Filled in from ' + fmtDate(parseDT(v.from)) + '. Change anything that is different today.' });
    this.label(daySec, 'Where does it hurt?');
    this.headChips = new ChipSelect(daySec, { options: s.headLocations, selected: (v.headLocation || []).slice() });
    this.label(daySec, 'Symptoms');
    this.symChips = new ChipSelect(daySec, { options: s.symptoms, selected: (v.symptoms || []).slice() });
    this.label(daySec, 'Relief tried today');
    this.reliefChips = new ChipSelect(daySec, { options: s.reliefs, selected: (v.logged ? v.relief : []).slice() });
    this.label(daySec, 'Medications taken today');
    this.medListId = 'mt-meds-' + Date.now();
    const dl = daySec.createEl('datalist', { attr: { id: this.medListId } });
    for (const m of medNameList(this.plugin)) dl.createEl('option', { attr: { value: m } });
    this.medRows = daySec.createDiv({ cls: 'mt-med-rows' });
    this.medRowEls = [];
    for (const m of ep ? ep.medications.filter((m) => medDayKey(m, ep) === key) : []) this.addMedRow(m);
    const addMed = daySec.createEl('button', { cls: 'mt-add-med', attr: { type: 'button' } });
    setIcon(addMed.createSpan(), 'plus');
    addMed.createSpan({ text: 'Add medication' });
    addMed.onclick = () => this.addMedRow({ name: '', dose: '', date: this.dateInput.value, time: '', effect: 'Not sure' }, true);
    if (this.mode !== 'start') {
      this.label(daySec, 'Notes about today');
      this.dayNotesInput = daySec.createEl('textarea', { cls: 'mt-textarea', attr: { rows: 2, placeholder: 'Anything about today…' } });
      this.dayNotesInput.value = v.logged ? v.notes || '' : '';
    }

    /* Last day: end date and the time of day it ended */
    const last = contentEl.createDiv({ cls: 'mt-section mt-last' });
    this.endedBox = last.createEl('label', { cls: 'mt-check' });
    this.endedCb = this.endedBox.createEl('input', { type: 'checkbox' });
    this.endedCb.checked = this.mode === 'end' || !!(ep && ep.end && dayKey(ep.end) === key);
    this.endedBox.appendText(' This is the last day of the migraine');
    this.endBox = last.createDiv({ cls: 'mt-end-fields' });
    this.label(this.endBox, 'Time of day it ended');
    this.todEndChips = new ChipSelect(this.endBox, { options: TIME_OF_DAY_END.map((t) => t.value), hints: Object.fromEntries(TIME_OF_DAY_END.map((t) => [t.value, t.hint])), selected: ep && ep.timeOfDayEnd ? [ep.timeOfDayEnd] : isToday ? [deriveTimeOfDay(new Date())] : [], single: true, allowCustom: false });
    const showEnd = () => this.endBox.toggleClass('is-hidden', !this.endedCb.checked);
    this.endedCb.addEventListener('change', showEnd);
    showEnd();

    const footer = contentEl.createDiv({ cls: 'mt-footer' });
    if (ep) footer.createEl('button', { text: 'Edit whole episode', attr: { type: 'button' } }).onclick = () => { this.close(); new EpisodeModal(this.plugin, ep).open(); };
    if (ep && this.mode !== 'start') footer.createEl('button', { text: 'Delete this day', cls: 'mod-warning', attr: { type: 'button' } }).onclick = () => {
      const single = spanDays(ep.start, ep.end || new Date()) <= 1;
      const m = new Modal(this.app);
      m.titleEl.setText(single ? 'Delete this migraine?' : 'Delete this day?');
      m.contentEl.createEl('p', { text: single ? 'This is the only day of the migraine, so the whole episode note will be moved to the trash.' : 'The pain, symptoms, relief, notes and medications for ' + fmtDate(parseDT(key)) + ' will be removed from this migraine.' });
      const r = m.contentEl.createDiv({ cls: 'mt-footer' });
      r.createDiv({ cls: 'mt-spacer' });
      r.createEl('button', { text: 'Cancel' }).onclick = () => m.close();
      r.createEl('button', { text: 'Delete', cls: 'mod-warning' }).onclick = async () => {
        m.close();
        const what = await this.plugin.deleteMigraineDay(ep, key);
        new Notice(what === 'episode' ? 'Migraine moved to trash.' : 'Day deleted.');
        this.close();
      };
      m.open();
    };
    footer.createDiv({ cls: 'mt-spacer' });
    footer.createEl('button', { text: 'Cancel', attr: { type: 'button' } }).onclick = () => this.close();
    footer.createEl('button', { text: this.mode === 'start' ? 'Save migraine' : this.mode === 'end' ? 'End migraine' : 'Save day', cls: 'mod-cta', attr: { type: 'button' } }).onclick = () => this.save();
  }
  updateDuration() {}
  async save() {
    const key = K_dayVal(this.dateInput.value);
    if (!key) { new Notice('Choose the date.'); return; }
    const ended = this.endedCb.checked;
    const endKey = ended ? key : null; // the migraine ends on this day's date
    const s = this.plugin.settings;
    const day = { date: key, pain: this.maxPain.get(), symptoms: this.symChips.values(), headLocation: this.headChips.values(), relief: this.reliefChips.values(), notes: this.dayNotesInput ? this.dayNotesInput.value.trim() : '' };
    const meds = this.medRowEls.map((r) => ({ name: r.name.value.trim(), dose: r.dose.value.trim(), date: key, time: r.time.value, effect: r.effect.value })).filter((m) => m.name);
    const remember = (k, values) => { for (const x of values) if (x && !s[k].includes(x)) s[k].push(x); };
    remember('symptoms', day.symptoms); remember('headLocations', day.headLocation); remember('reliefs', day.relief); { const tracked = this.plugin.medOptions ? this.plugin.medOptions() : []; remember('medications', meds.map((m) => m.name).filter((x) => !tracked.includes(x))); }
    const about = this.mode === 'start' ? { timeOfDay: this.todChips.value(), type: this.typeChips.value(), attackLocation: this.whereChips.value(), triggers: this.trigChips.values(), notes: this.notesInput.value.trim() } : null;
    if (about) { remember('types', [about.type]); remember('attackLocations', [about.attackLocation]); remember('triggers', about.triggers); }
    await this.plugin.saveSettings();
    try {
      const ep = await this.plugin.saveMigraineDay(day, meds, ended ? { date: endKey, timeOfDayEnd: this.todEndChips.value() } : null, about);
      this.close();
      new MigraineSummaryModal(this.plugin, ep, this.mode === 'start' ? 'started' : ended ? 'ended' : 'day').open();
    } catch (err) {
      console.error('[Migraine Tracker]', err);
      new Notice('Couldn’t save: ' + err.message);
    }
  }
}
const K_dayVal = (v) => (parseDT(v) ? dayKey(parseDT(v)) : null);

/** A summary of one episode after saving, with a way back to the dashboard */
class MigraineSummaryModal extends Modal {
  constructor(plugin, ep, what) { super(plugin.app); this.plugin = plugin; this.ep = ep; this.what = what; }
  onOpen() {
    const ep = this.ep, { contentEl } = this;
    this.modalEl.addClass('mt-modal', 'mt-summary-modal');
    const now = new Date();
    const n = Math.max(1, Math.min(31, spanDays(ep.start, ep.end || now)));
    this.titleEl.setText(this.what === 'ended' ? 'Migraine ended' : this.what === 'started' ? 'Migraine saved' : 'Day saved');
    const head = contentEl.createDiv({ cls: 'mt-sum-head' });
    head.createDiv({ cls: 'mt-sum-dates', text: fmtDate(ep.start) + (ep.end ? ' – ' + fmtDate(ep.end) : ' · still going') });
    head.createDiv({ cls: 'mt-muted', text: [ep.end ? fmtDays(n) : 'Day ' + n, ep.type, ep.timeOfDay ? 'started: ' + ep.timeOfDay.toLowerCase() : '', ep.end && ep.timeOfDayEnd ? 'ended: ' + ep.timeOfDayEnd.toLowerCase() : '', ep.attackLocation ? 'at ' + ep.attackLocation.toLowerCase() : ''].filter(Boolean).join(' · ') });
    const tiles = contentEl.createDiv({ cls: 'mt-sum-tiles' });
    const tile = (l, val, sub, color) => { const t = tiles.createDiv({ cls: 'mt-sum-tile' }); t.createDiv({ cls: 'mt-sum-label', text: l }); const v = t.createDiv({ cls: 'mt-sum-value', text: val }); if (color) v.style.color = color; if (sub) t.createDiv({ cls: 'mt-muted', text: sub }); };
    tile('Peak pain', (ep.painMax ?? '–') + '/' + PAIN_MAX, painLabel(ep.painMax || 0), ep.painMax ? painColor(ep.painMax, 1) : '');
    tile('Average pain', (ep.painAvg ?? '–') + '/' + PAIN_MAX, ep.avgAuto ? 'from each day' : 'as entered');
    const medDays = new Set(ep.medications.map((m) => medDayKey(m, ep))).size;
    tile('Medication', String(ep.medications.length), ep.medications.length ? 'on ' + medDays + (medDays === 1 ? ' day' : ' days') : 'none taken');
    tile('Days', String(n), ep.end ? 'ended ' + fmtDate(ep.end) : 'still going');
    // day by day
    const t = contentEl.createEl('table', { cls: 'mt-sum-table' });
    const hr = t.createEl('thead').createEl('tr');
    for (const h of ['Day', 'Pain', 'Where', 'Symptoms', 'Medication', 'Relief']) hr.createEl('th', { text: h });
    const tb = t.createEl('tbody');
    for (let i = 0; i < n; i++) {
      const k = dayKey(addDays(startOfDay(ep.start), i));
      const d = (ep.days && ep.days.length) ? epDay(ep, k) : { pain: ep.painMax, symptoms: ep.symptoms, headLocation: ep.headLocation, relief: i === 0 ? ep.relief : [], logged: i === 0 };
      const tr = tb.createEl('tr', { cls: d.logged ? '' : 'is-carried' });
      tr.createEl('td', { text: 'Day ' + (i + 1) + ' · ' + fmtDate(parseDT(k)).replace(/, \d{4}$/, '') });
      const pill = tr.createEl('td').createSpan({ cls: 'mt-pain-pill', text: (d.pain ?? '–') + '/' + PAIN_MAX });
      if (d.pain) pill.style.background = painColor(d.pain, 0.75);
      tr.createEl('td', { text: (d.headLocation || []).join(', ') || '–' });
      tr.createEl('td', { text: ((d.symptoms || []).join(', ') || '–') + (d.logged ? '' : ' (same as day before)') });
      tr.createEl('td', { text: ep.medications.filter((m) => medDayKey(m, ep) === k).map((m) => m.name + (m.dose ? ' ' + m.dose : '') + (m.effect && m.effect !== 'Not sure' ? ' (' + m.effect.toLowerCase() + ')' : '')).join(', ') || '–' });
      tr.createEl('td', { text: (d.relief || []).join(', ') || '–' });
    }
    const facts = contentEl.createDiv({ cls: 'mt-sum-facts' });
    if (ep.triggers.length) facts.createDiv({ text: 'Possible causes: ' + ep.triggers.join(', ') });
    if (ep.notes) facts.createDiv({ text: 'Notes: ' + ep.notes });
    const foot = contentEl.createDiv({ cls: 'mt-footer' });
    foot.createEl('button', { text: 'Edit episode', attr: { type: 'button' } }).onclick = () => {
      this.close();
      const fresh = this.plugin.getEpisodes().find((e) => e.path === ep.path) || ep;
      new EpisodeModal(this.plugin, fresh).open();
    };
    foot.createDiv({ cls: 'mt-spacer' });
    foot.createEl('button', { text: 'Back to dashboard', cls: 'mod-cta', attr: { type: 'button' } }).onclick = () => {
      this.close();
      const c = this.app.commands;
      if (c && c.executeCommandById && c.commands && c.commands['health-dashboard:open-migraine']) c.executeCommandById('health-dashboard:open-migraine');
      else if (this.plugin.activateView) this.plugin.activateView();
    };
  }
  onClose() { this.contentEl.empty(); }
}
/*@@PLUGIN@@*/
/** Save one day into the episode that covers it, or start a new episode on that day. Returns the episode as saved. */
MigraineTrackerPlugin.prototype.saveMigraineDay = async function (day, meds, endInfo, about) {
  const date = parseDT(day.date);
  const eps = this.getEpisodes();
  let ep = about ? null : eps.find((e) => dayKey(e.start) <= day.date && (!e.end || dayKey(e.end) >= day.date));
  if (!ep && !about) ep = eps.find((e) => e.end && dayKey(addDays(e.end, 1)) === day.date) || null; // the day after it ended carries it on
  const endDate = endInfo ? parseDT(endInfo.date) : null;
  if (!ep) {
    const a = about || {};
    const fresh = {
      start: date, end: endDate, type: a.type || '', attackLocation: a.attackLocation || '', timeOfDay: a.timeOfDay || '', timeOfDayEnd: endInfo ? endInfo.timeOfDayEnd || '' : '',
      painMax: day.pain, painAvg: day.pain, symptoms: day.symptoms.slice(), triggers: a.triggers || [], relief: day.relief.slice(), medications: meds,
      headLocation: day.headLocation.slice(), notes: a.notes || '', days: [day], avgAuto: true,
    };
    fresh.painAvg = autoPainAvg(fresh);
    const file = await this.createEpisode(fresh);
    return Object.assign(fresh, { file, path: file ? file.path : '' });
  }
  const days = (ep.days || []).filter((d) => d.date !== day.date);
  const k0 = dayKey(ep.start);
  if (!days.length && day.date !== k0) days.push({ date: k0, pain: ep.painMax || 0, symptoms: ep.symptoms.slice(), headLocation: (ep.headLocation || []).slice(), relief: [], notes: '' });
  days.push(day);
  days.sort((a, b) => a.date.localeCompare(b.date));
  const start = day.date < k0 ? date : ep.start;
  let end = ep.end, timeOfDayEnd = ep.timeOfDayEnd;
  if (endInfo) { end = endDate; timeOfDayEnd = endInfo.timeOfDayEnd || timeOfDayEnd; }
  else if (end && dayKey(end) < day.date) end = date; // a later day extends a finished migraine
  const next = Object.assign({}, ep, {
    start, end, timeOfDayEnd: end ? timeOfDayEnd : '', days,
    medications: ep.medications.filter((m) => medDayKey(m, ep) !== day.date).concat(meds),
    painMax: Math.max(...days.map((d) => d.pain || 0)),
    symptoms: uniq(ep.symptoms.concat(...days.map((d) => d.symptoms))),
    headLocation: uniq((ep.headLocation || []).concat(...days.map((d) => d.headLocation || []))),
    relief: uniq(ep.relief.concat(...days.map((d) => d.relief || []))),
  });
  next.painAvg = ep.avgAuto ? autoPainAvg(next) : ep.painAvg;
  await this.updateEpisode(ep.file, next);
  return next;
};
/** Migraine started: opens the start window (or today's day if one is already going) */
MigraineTrackerPlugin.prototype.migraineStarted = function (date) {
  const going = this.getEpisodes().filter((e) => !e.end).sort((a, b) => b.start - a.start)[0];
  if (going && !date) {
    new Notice('A migraine is already in progress since ' + fmtDate(going.start) + '. Log how today is going.');
    new MigraineDayModal(this, new Date()).open();
    return;
  }
  new MigraineDayModal(this, date || new Date(), { mode: 'start' }).open();
};
/** End now: today's questions with the end date and time */
MigraineTrackerPlugin.prototype.endMigraineDay = function (ep) {
  const today = startOfDay(new Date());
  new MigraineDayModal(this, ep && ep.start > today ? ep.start : today, { mode: 'end' }).open();
};

/** Delete one day from an episode (the first or last day moves the start or end); a one-day migraine goes to the trash */
MigraineTrackerPlugin.prototype.deleteMigraineDay = async function (ep, key) {
  const n = spanDays(ep.start, ep.end || new Date());
  if (n <= 1) {
    if (this.app.fileManager.trashFile) await this.app.fileManager.trashFile(ep.file); else await this.app.vault.trash(ep.file, true);
    return 'episode';
  }
  const days = (ep.days || []).filter((d) => d.date !== key);
  const next = Object.assign({}, ep, { days, medications: ep.medications.filter((m) => medDayKey(m, ep) !== key) });
  if (key === dayKey(ep.start)) next.start = addDays(startOfDay(ep.start), 1);
  else if (key === dayKey(ep.end || new Date())) { next.end = addDays(parseDT(key), -1); if (!ep.end) next.timeOfDayEnd = ''; }
  if (days.length) {
    next.painMax = Math.max(...days.map((d) => d.pain || 0));
    next.symptoms = uniq([].concat(...days.map((d) => d.symptoms)));
    next.headLocation = uniq([].concat(...days.map((d) => d.headLocation || [])));
    next.relief = uniq([].concat(...days.map((d) => d.relief || [])));
  }
  next.painAvg = ep.avgAuto ? autoPainAvg(next) : ep.painAvg;
  await this.updateEpisode(ep.file, next);
  return 'day';
};
