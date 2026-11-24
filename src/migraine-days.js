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
/*@@MODAL@@*/
/** The "Day by day" section of the episode window */
EpisodeModal.prototype.renderDays = function () {
  const sec = this.daysSec;
  if (!sec || !this.startInput) return;
  if (!this.dayState) this.dayState = new Map((this.ep.days || []).map((d) => [d.date, Object.assign({}, d, { symptoms: d.symptoms.slice(), headLocation: (d.headLocation || []).slice(), relief: (d.relief || []).slice() })]));
  if (this.daysBox) this.daysBox.remove();
  const box = sec.createDiv({ cls: 'mt-days' });
  this.daysBox = box;
  const st = parseDT(this.startInput.value);
  if (!st) return;
  const en = parseDT(this.endInput.value) || new Date();
  const n = Math.max(1, Math.min(31, spanDays(st, en < st ? st : en)));
  if (n < 2 && !this.dayState.size) {
    box.createDiv({ cls: 'mt-help', text: 'When a migraine lasts more than a day, you can set the pain and symptoms for each day here, or use Log day. A day you don’t change keeps the day before’s values.' });
    return;
  }
  box.createDiv({ cls: 'mt-help', text: 'A day you don’t change keeps the pain, symptoms and where it hurt of the day before, until you change them or the migraine ends. Day 1 uses the values above unless you change it. Use Log day for a day’s medications and relief.' });
  const s = this.plugin.settings;
  let prev = null;
  for (let i = 0; i < n; i++) {
    const key = dayKey(addDays(startOfDay(st), i));
    const logged = this.dayState.get(key);
    const base = i === 0 ? { pain: this.maxPain ? this.maxPain.get() : this.ep.painMax, symptoms: this.symChips ? this.symChips.values() : this.ep.symptoms, headLocation: this.headChips ? this.headChips.values() : this.ep.headLocation } : prev;
    const cur = logged ? { pain: logged.pain != null ? logged.pain : base.pain, symptoms: logged.symptoms, headLocation: logged.headLocation && logged.headLocation.length ? logged.headLocation : base.headLocation } : base;
    const row = box.createDiv({ cls: 'mt-day' + (logged ? ' is-logged' : '') });
    const head = row.createDiv({ cls: 'mt-day-head' });
    head.createSpan({ cls: 'mt-day-title', text: 'Day ' + (i + 1) + ' · ' + fmtDate(parseDT(key)) });
    const pill = head.createSpan({ cls: 'mt-pain-pill', text: (cur.pain == null ? '–' : cur.pain) + '/' + PAIN_MAX });
    if (cur.pain) pill.style.background = painColor(cur.pain, 0.75);
    head.createSpan({ cls: 'mt-day-sum', text: (cur.symptoms.join(', ') || 'No symptoms') + (logged ? '' : i === 0 ? ' · from above' : ' · same as day ' + i) });
    const btn = head.createEl('button', { cls: 'mt-small-btn', text: logged ? (i === 0 ? 'Use the values above' : 'Same as day ' + i) : 'Change this day', attr: { type: 'button' } });
    btn.onclick = () => {
      if (logged) this.dayState.delete(key);
      else this.dayState.set(key, { date: key, pain: cur.pain, symptoms: cur.symptoms.slice(), headLocation: (cur.headLocation || []).slice(), relief: [], notes: '' });
      this.renderDays();
    };
    const meds = (this.medRowEls || []).filter((r) => r.date.value === key && r.name.value.trim()).map((r) => r.name.value.trim());
    const extra = [meds.length ? 'Medication: ' + meds.join(', ') : '', logged && logged.relief && logged.relief.length ? 'Relief: ' + logged.relief.join(', ') : '', logged && logged.notes ? logged.notes : ''].filter(Boolean);
    if (extra.length) row.createDiv({ cls: 'mt-day-extra', text: extra.join(' · ') });
    if (logged) {
      const ed = row.createDiv({ cls: 'mt-day-edit' });
      this.painSelector(ed, 'Pain', cur.pain == null ? 0 : cur.pain, (v) => { logged.pain = v; this.renderDays(); });
      ed.createDiv({ cls: 'mt-label', text: 'Where it hurt' });
      new ChipSelect(ed, { options: s.headLocations, selected: cur.headLocation || [], onChange: (v) => { logged.headLocation = v.slice(); } });
      ed.createDiv({ cls: 'mt-label', text: 'Symptoms' });
      new ChipSelect(ed, { options: s.symptoms, selected: logged.symptoms, onChange: (v) => { logged.symptoms = v.slice(); this.renderDays(); } });
    }
    prev = cur;
  }
};
/** Days the person changed, inside the episode's dates */
EpisodeModal.prototype.collectDays = function (start, end) {
  if (!this.dayState) return this.ep.days || [];
  const lo = dayKey(start), hi = dayKey(end || new Date());
  return [...this.dayState.entries()].filter(([k]) => k >= lo && k <= hi).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, pain: v.pain == null ? 0 : v.pain, symptoms: v.symptoms || [], headLocation: v.headLocation || [], relief: v.relief || [], notes: v.notes || '' }));
};

/** Log one day of a migraine, like Log day for periods: pain, where it hurt, symptoms, medications and relief that day */
class MigraineDayModal extends EpisodeModal {
  constructor(plugin, date, opts = {}) {
    super(plugin, null, {});
    this.day = startOfDay(date || new Date());
    this.opts = opts;
  }
  /** The episode this day belongs to: one that covers it, or an ongoing one that started before it */
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
    const ep = this.findEpisode(key);
    this.target = ep;
    this.titleEl.setText(this.opts.title || 'Log migraine day');
    // values for this day: logged ones, else carried over from the day before, else the episode's
    const v = ep ? epDay(ep, key) : { pain: Math.ceil(PAIN_MAX * 0.6), symptoms: [], headLocation: [], relief: [], notes: '', logged: false };
    const when = this.section('Day', 'calendar-days');
    const grid = when.createDiv({ cls: 'mt-grid-2' });
    const df = this.field(grid, 'Date');
    this.dateInput = df.createEl('input', { type: 'date', cls: 'mt-input' });
    this.dateInput.value = key;
    this.startInput = this.dateInput; // medication rows default to this date
    this.info = when.createDiv({ cls: 'mt-duration' });
    const setInfo = () => {
      const k = this.dateInput.value, e = k ? this.findEpisode(k) : null;
      if (e) this.info.setText('Day ' + spanDays(e.start, parseDT(k)) + ' of the migraine that started ' + fmtDate(e.start) + (e.end ? ' (ended ' + fmtDate(e.end) + ')' : ' (still going)') + '.');
      else this.info.setText('No migraine covers this day yet: saving starts a new one on this day.');
    };
    this.dateInput.addEventListener('change', setInfo);
    setInfo();
    this.endedBox = when.createEl('label', { cls: 'mt-check' });
    this.endedCb = this.endedBox.createEl('input', { type: 'checkbox' });
    this.endedCb.checked = !!(ep && ep.end && dayKey(ep.end) === key) || (!ep && key < dayKey(new Date()));
    this.endedBox.appendText(' The migraine ended this day');

    const pain = this.section('Pain', 'activity');
    const fresh = !v.logged && !(ep && ep.days && ep.days.length) && !v.pain;
    this.maxPain = this.painSelector(pain, 'Pain today', v.pain == null || fresh ? Math.ceil(PAIN_MAX * 0.6) : v.pain);
    if (ep && !v.logged && v.from) pain.createDiv({ cls: 'mt-help', text: 'Filled in from ' + fmtDate(parseDT(v.from)) + '. Change anything that is different today.' });
    this.label(pain, 'Where does it hurt?');
    this.headChips = new ChipSelect(pain, { options: s.headLocations, selected: (v.headLocation || []).slice() });
    const sym = this.section('Symptoms', 'thermometer');
    this.symChips = new ChipSelect(sym, { options: s.symptoms, selected: (v.symptoms || []).slice() });
    const meds = this.section('Medications taken today', 'pill');
    this.medListId = 'mt-meds-' + Date.now();
    const dl = meds.createEl('datalist', { attr: { id: this.medListId } });
    for (const m of s.medications) dl.createEl('option', { attr: { value: m } });
    this.medRows = meds.createDiv({ cls: 'mt-med-rows' });
    this.medRowEls = [];
    for (const m of ep ? ep.medications.filter((m) => medDayKey(m, ep) === key) : []) this.addMedRow(m);
    const addMed = meds.createEl('button', { cls: 'mt-add-med', attr: { type: 'button' } });
    setIcon(addMed.createSpan(), 'plus');
    addMed.createSpan({ text: 'Add medication' });
    addMed.onclick = () => this.addMedRow({ name: '', dose: '', date: this.dateInput.value, time: '', effect: 'Not sure' }, true);
    const rel = this.section('Relief tried today', 'heart-handshake');
    this.reliefChips = new ChipSelect(rel, { options: s.reliefs, selected: (v.logged ? v.relief : []).slice() });
    const notes = this.section('Notes', 'pencil');
    this.notesInput = notes.createEl('textarea', { cls: 'mt-textarea', attr: { rows: 2, placeholder: 'Anything about today…' } });
    this.notesInput.value = v.logged ? v.notes || '' : '';

    const footer = contentEl.createDiv({ cls: 'mt-footer' });
    if (ep) footer.createEl('button', { text: 'Edit whole episode', attr: { type: 'button' } }).onclick = () => { this.close(); new EpisodeModal(this.plugin, ep).open(); };
    footer.createDiv({ cls: 'mt-spacer' });
    footer.createEl('button', { text: 'Cancel', attr: { type: 'button' } }).onclick = () => this.close();
    footer.createEl('button', { text: 'Save day', cls: 'mod-cta', attr: { type: 'button' } }).onclick = () => this.save();
  }
  updateDuration() {}
  async save() {
    const key = K_dayVal(this.dateInput.value);
    if (!key) { new Notice('Choose the date.'); return; }
    const s = this.plugin.settings;
    const day = {
      date: key, pain: this.maxPain.get(), symptoms: this.symChips.values(), headLocation: this.headChips.values(),
      relief: this.reliefChips.values(), notes: this.notesInput.value.trim(),
    };
    const meds = this.medRowEls.map((r) => ({ name: r.name.value.trim(), dose: r.dose.value.trim(), date: key, time: r.time.value, effect: r.effect.value })).filter((m) => m.name);
    const remember = (k, values) => { for (const x of values) if (x && !s[k].includes(x)) s[k].push(x); };
    remember('symptoms', day.symptoms); remember('headLocations', day.headLocation); remember('reliefs', day.relief); remember('medications', meds.map((m) => m.name));
    await this.plugin.saveSettings();
    try {
      await this.plugin.saveMigraineDay(day, meds, this.endedCb.checked);
      new Notice('Saved ' + fmtDate(parseDT(key)) + ': pain ' + day.pain + '/' + PAIN_MAX + '.');
      this.close();
    } catch (err) {
      console.error('[Migraine Tracker]', err);
      new Notice('Couldn’t save the day: ' + err.message);
    }
  }
}
const K_dayVal = (v) => (parseDT(v) ? dayKey(parseDT(v)) : null);
/*@@PLUGIN@@*/
/** Save one day into the episode that covers it, or start a new episode on that day */
MigraineTrackerPlugin.prototype.saveMigraineDay = async function (day, meds, ended) {
  const date = parseDT(day.date);
  const eps = this.getEpisodes();
  let ep = eps.find((e) => dayKey(e.start) <= day.date && (!e.end || dayKey(e.end) >= day.date));
  // the day after an episode that ended yesterday carries it on
  if (!ep) ep = eps.find((e) => e.end && dayKey(addDays(e.end, 1)) === day.date) || null;
  if (!ep) {
    const fresh = {
      start: date, end: ended ? date : null, type: '', attackLocation: '', timeOfDay: '', timeOfDayEnd: '',
      painMax: day.pain, painAvg: day.pain, symptoms: day.symptoms.slice(), triggers: [], relief: day.relief.slice(), medications: meds,
      headLocation: day.headLocation.slice(), notes: '', days: [day], avgAuto: true,
    };
    if (dayKey(date) === dayKey(new Date())) fresh.timeOfDay = deriveTimeOfDay(new Date());
    await this.createEpisode(fresh);
    return;
  }
  const days = (ep.days || []).filter((d) => d.date !== day.date);
  // keep day 1 as it was when the first other day is added
  const k0 = dayKey(ep.start);
  if (!days.length && day.date !== k0) days.push({ date: k0, pain: ep.painMax || 0, symptoms: ep.symptoms.slice(), headLocation: (ep.headLocation || []).slice(), relief: [], notes: '' });
  days.push(day);
  days.sort((a, b) => a.date.localeCompare(b.date));
  const start = day.date < k0 ? date : ep.start;
  let end = ep.end;
  if (ended) end = date;
  else if (end && dayKey(end) < day.date) end = date; // a later day extends a finished migraine
  const next = Object.assign({}, ep, {
    start, end, days,
    medications: ep.medications.filter((m) => medDayKey(m, ep) !== day.date).concat(meds),
    painMax: Math.max(...days.map((d) => d.pain || 0)),
    symptoms: uniq(ep.symptoms.concat(...days.map((d) => d.symptoms))),
    headLocation: uniq((ep.headLocation || []).concat(...days.map((d) => d.headLocation || []))),
    relief: uniq(ep.relief.concat(...days.map((d) => d.relief || []))),
  });
  if (end && !ep.end && dayKey(end) === dayKey(new Date())) next.timeOfDayEnd = next.timeOfDayEnd || deriveTimeOfDay(new Date());
  next.painAvg = ep.avgAuto ? autoPainAvg(next) : ep.painAvg;
  await this.updateEpisode(ep.file, next);
};
/** Migraine started: one tap starts an episode today, then the day window opens to add pain and symptoms */
MigraineTrackerPlugin.prototype.migraineStarted = async function () {
  const now = new Date();
  const going = this.getEpisodes().filter((e) => !e.end).sort((a, b) => b.start - a.start)[0];
  if (going) {
    new Notice('A migraine is already in progress since ' + fmtDate(going.start) + '. Log today’s pain and symptoms.');
    new MigraineDayModal(this, now).open();
    return;
  }
  await this.createEpisode({
    start: startOfDay(now), end: null, type: '', attackLocation: '', timeOfDay: deriveTimeOfDay(now), timeOfDayEnd: '',
    painMax: 0, painAvg: 0, symptoms: [], triggers: [], relief: [], medications: [], headLocation: [], notes: '', days: [], avgAuto: true,
  });
  new Notice('Migraine start logged for today. Add how it feels now.');
  window.setTimeout(() => new MigraineDayModal(this, now, { title: 'Migraine started · ' + fmtDate(now) }).open(), 300);
};
