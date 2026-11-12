/*
 * Doctor Visits: log appointments as Markdown notes (YAML frontmatter) and
 * see upcoming visits, follow-ups and visit history on a dashboard.
 */
const obsidian = require('obsidian');
const {
  Plugin, ItemView, Modal, Notice, PluginSettingTab, Setting, TFile, normalizePath, stringifyYaml, setIcon,
} = obsidian;
const ChipSelect = MigraineModule._internals.ChipSelect;

const VIEW_TYPE = 'doctor-visits-dashboard';
const ENTRY = 'doctor-visit';
const DEFAULT_SETTINGS = {
  folder: 'Doctor Visits',
  showStatusBar: true,
  historyView: 'cards', // cards | grid | list
  clinics: [],
  doctors: [],
  specialties: ['General practice', 'Neurology', 'Gynecology', 'Endocrinology', 'Headache clinic', 'Pain clinic',
    'Physiotherapy', 'Psychology / counselling', 'Dermatology', 'Dentist', 'Optometry', 'Other'],
  reasons: ['Check-up', 'Follow-up', 'Migraine / headaches', 'Period / menstrual concerns', 'New symptom',
    'Test results', 'Prescription renewal', 'Referral', 'Vaccination', 'Other'],
  visitTypes: ['In person', 'Video', 'Phone'],
  topics: ['Migraine', 'Period', 'General health', 'Mental health', 'Other'],
  tests: ['Blood test', 'Urine test', 'Hormone panel', 'MRI', 'CT scan', 'Ultrasound', 'X-ray', 'ECG', 'Referral'],
};
const LIST_KEYS = ['clinics', 'doctors', 'specialties', 'reasons', 'visitTypes', 'topics', 'tests'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;

/* Dates are 'YYYY-MM-DD' strings (local calendar days) */
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayKey = () => keyOf(new Date());
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDaysKey = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / DAY_MS);
function normDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return keyOf(v);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v).trim());
  return m ? m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) : '';
}
function normTime(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v >= 0 && v < 1440) return pad(Math.floor(v / 60)) + ':' + pad(v % 60); // YAML 1.1 sexagesimal
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v).trim());
  return m ? pad(+m[1]) + ':' + m[2] : '';
}
const fmtKey = (k) => { const d = parseKey(k); return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); };
const fmtKeyLong = (k) => { const d = parseKey(k); return DOW[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
function relDays(k, today) {
  const n = daysBetween(today, k);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? 'in ' + plural(n, 'day') : plural(-n, 'day') + ' ago';
}
function asArray(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== '').map((x) => String(x).trim()).filter(Boolean);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}
const str = (v) => (v == null ? '' : String(v).trim());
const linesOf = (v) => asArray(Array.isArray(v) ? v : String(v || '').split('\n'));

function parseVisit(file, fm) {
  if (!fm || String(fm.entry || '').toLowerCase() !== ENTRY) return null;
  const date = normDate(fm.date);
  if (!date) return null;
  return {
    file, path: file ? file.path : '', date, time: normTime(fm.time),
    clinic: str(fm.clinic), doctor: str(fm.doctor), specialty: str(fm.specialty), type: str(fm.visit_type),
    reason: str(fm.reason), related: asArray(fm.related),
    questions: str(fm.questions), discussed: str(fm.discussed), outcome: str(fm.outcome), nextSteps: str(fm.next_steps),
    tests: asArray(fm.tests), medChanges: linesOf(fm.med_changes), followUp: normDate(fm.follow_up), cost: str(fm.cost),
  };
}
function visitToFrontmatter(v) {
  return {
    entry: ENTRY, date: v.date, time: v.time, clinic: v.clinic, doctor: v.doctor, specialty: v.specialty,
    visit_type: v.type, reason: v.reason, related: v.related, questions: v.questions, discussed: v.discussed,
    outcome: v.outcome, next_steps: v.nextSteps, tests: v.tests, med_changes: v.medChanges, follow_up: v.followUp,
    cost: v.cost, tags: ['doctor-visit'],
  };
}
const isEmpty = (x) => x == null || x === '' || (Array.isArray(x) && !x.length);
const hasNotes = (v) => !!(v.discussed || v.outcome || v.nextSteps || v.tests.length || v.medChanges.length);
const isUpcoming = (v, today) => v.date > today || (v.date === today && !hasNotes(v));
const sortAsc = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
const who = (v) => [v.doctor, v.clinic].filter(Boolean).join(' · ') || 'Visit';

/* Follow-ups asked for at a past visit that no later visit has covered yet */
function followUpsDue(visits, today) {
  const out = [];
  for (const v of visits) {
    if (!v.followUp || isUpcoming(v, today)) continue;
    const same = (w) => (v.doctor ? w.doctor === v.doctor : v.clinic ? w.clinic === v.clinic : true);
    const covered = visits.some((w) => w !== v && w.date > v.date && same(w));
    if (!covered) out.push(v);
  }
  return out.sort((a, b) => a.followUp.localeCompare(b.followUp));
}

/* ------------------------------------------------------------------ */
/* Log / edit modal                                                    */
/* ------------------------------------------------------------------ */
class VisitModal extends Modal {
  constructor(plugin, visit, opts = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.existing = visit || null;
    const pre = opts.prefill || {};
    this.v = visit ? Object.assign({}, visit, { related: visit.related.slice(), tests: visit.tests.slice(), medChanges: visit.medChanges.slice() }) : Object.assign({
      date: opts.date || todayKey(), time: '', clinic: '', doctor: '', specialty: '', type: plugin.settings.visitTypes[0] || '',
      reason: '', related: [], questions: '', discussed: '', outcome: '', nextSteps: '', tests: [], medChanges: [], followUp: '', cost: '',
    }, pre);
  }

  section(title, icon) {
    const sec = this.contentEl.createDiv({ cls: 'mt-section' });
    const h = sec.createDiv({ cls: 'mt-section-title' });
    setIcon(h.createSpan({ cls: 'mt-section-icon' }), icon);
    h.createSpan({ text: title });
    return sec;
  }
  label(parent, text, help) {
    const l = parent.createDiv({ cls: 'mt-label', text });
    if (help) l.createSpan({ cls: 'dv-label-help', text: ' · ' + help });
    return l;
  }
  area(parent, label, value, placeholder, rows) {
    this.label(parent, label);
    const ta = parent.createEl('textarea', { cls: 'dv-textarea', attr: { rows: String(rows || 3), placeholder: placeholder || '' } });
    ta.value = value || '';
    return ta;
  }

  onOpen() {
    const v = this.v;
    // Offer everything already used in visit notes, even if it was never added to a list
    const known = this.plugin.getVisits();
    const s = Object.assign({}, this.plugin.settings);
    const merge = (key, field) => { s[key] = s[key].slice(); for (const x of known) if (x[field] && !s[key].includes(x[field])) s[key].push(x[field]); };
    merge('doctors', 'doctor'); merge('clinics', 'clinic'); merge('specialties', 'specialty'); merge('reasons', 'reason');
    this.modalEl.addClass('mt-modal', 'dv-modal');
    this.titleEl.setText(this.existing ? 'Edit doctor visit' : 'Log doctor visit');

    const when = this.section('When', 'calendar');
    const row = when.createDiv({ cls: 'dv-row' });
    const f1 = row.createDiv({ cls: 'mt-field' });
    f1.createDiv({ cls: 'mt-label', text: 'Date' });
    this.dateInput = f1.createEl('input', { type: 'date' });
    this.dateInput.value = v.date;
    const f2 = row.createDiv({ cls: 'mt-field' });
    f2.createDiv({ cls: 'mt-label', text: 'Time (optional)' });
    this.timeInput = f2.createEl('input', { type: 'time' });
    this.timeInput.value = v.time;
    this.whenHelp = when.createDiv({ cls: 'mt-help' });
    const updHelp = () => {
      const d = normDate(this.dateInput.value);
      this.whenHelp.setText(!d ? '' : d > todayKey() ? 'Upcoming visit: add questions to ask now and the notes after the visit.' : '');
    };
    this.dateInput.addEventListener('change', updHelp);
    updHelp();
    this.label(when, 'Type of visit');
    this.typeChips = new ChipSelect(when, { options: s.visitTypes, selected: v.type ? [v.type] : [], single: true });

    const whoSec = this.section('Who', 'user');
    this.label(whoSec, 'Doctor or clinician');
    this.doctorChips = new ChipSelect(whoSec, {
      options: s.doctors, selected: v.doctor ? [v.doctor] : [], single: true,
      onChange: (vals) => this.fillFromDoctor(vals[0]),
    });
    this.label(whoSec, 'Clinic, practice or hospital');
    this.clinicChips = new ChipSelect(whoSec, { options: s.clinics, selected: v.clinic ? [v.clinic] : [], single: true });
    this.label(whoSec, 'Specialty');
    this.specChips = new ChipSelect(whoSec, { options: s.specialties, selected: v.specialty ? [v.specialty] : [], single: true });

    const why = this.section('Why', 'help-circle');
    this.label(why, 'Reason for visit');
    this.reasonChips = new ChipSelect(why, { options: s.reasons, selected: v.reason ? [v.reason] : [], single: true });
    this.label(why, 'Related to');
    this.topicChips = new ChipSelect(why, { options: s.topics, selected: v.related });
    this.questionsEl = this.area(why, 'Questions to ask', v.questions, 'Write down what you want to ask or mention, one per line.', 3);

    const what = this.section('What happened', 'clipboard-list');
    this.discussedEl = this.area(what, 'What was discussed', v.discussed, 'Symptoms you described, what the doctor examined or explained, answers to your questions…', 5);
    this.outcomeEl = this.area(what, 'Diagnosis or results', v.outcome, 'Diagnosis, test results, the doctor’s assessment…', 3);
    this.nextEl = this.area(what, 'Next steps and advice', v.nextSteps, 'Things to do, lifestyle advice, what to watch for…', 3);
    this.label(what, 'Tests or referrals ordered');
    this.testChips = new ChipSelect(what, { options: s.tests, selected: v.tests });
    this.medsEl = this.area(what, 'Medication changes', v.medChanges.join('\n'), 'One per line, for example "Start topiramate 25 mg at night".', 3);
    const tracked = this.plugin.medOptions ? this.plugin.medOptions() : [];
    if (tracked.length) {
      const q = what.createDiv({ cls: 'dv-medpick' });
      q.createSpan({ cls: 'mt-help', text: 'Your medications (tap to add a line): ' });
      for (const name of tracked) {
        const b = q.createEl('button', { cls: 'mt-chip', text: name, attr: { type: 'button' } });
        b.onclick = () => { const cur = this.medsEl.value.replace(/\s+$/, ''); this.medsEl.value = (cur ? cur + '\n' : '') + name + ' '; this.medsEl.focus(); };
      }
    }

    const fu = this.section('Follow-up', 'calendar-clock');
    const frow = fu.createDiv({ cls: 'dv-row' });
    const f3 = frow.createDiv({ cls: 'mt-field' });
    f3.createDiv({ cls: 'mt-label', text: 'Follow-up by' });
    this.followInput = f3.createEl('input', { type: 'date' });
    this.followInput.value = v.followUp;
    const quick = frow.createDiv({ cls: 'dv-quick' });
    for (const [label, days] of [['2 weeks', 14], ['1 month', 30], ['3 months', 91], ['6 months', 182], ['Clear', 0]]) {
      const b = quick.createEl('button', { cls: 'mt-chip', text: label, attr: { type: 'button' } });
      b.onclick = () => { const base = normDate(this.dateInput.value) || todayKey(); this.followInput.value = days ? addDaysKey(base, days) : ''; };
    }
    const f4 = frow.createDiv({ cls: 'mt-field dv-cost' });
    f4.createDiv({ cls: 'mt-label', text: 'Cost (optional)' });
    this.costInput = f4.createEl('input', { type: 'text', attr: { placeholder: 'e.g. 4 500 kr' } });
    this.costInput.value = v.cost;

    const foot = this.contentEl.createDiv({ cls: 'mt-footer dv-footer' });
    if (this.existing) {
      foot.createEl('button', { text: 'Delete', cls: 'mod-warning' }).onclick = () => this.confirmDelete();
      foot.createEl('button', { text: 'Open note' }).onclick = () => { this.close(); this.app.workspace.getLeaf('tab').openFile(this.existing.file); };
    }
    foot.createDiv({ cls: 'mt-spacer' });
    foot.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
    foot.createEl('button', { text: this.existing ? 'Save changes' : 'Save visit', cls: 'mod-cta' }).onclick = () => this.save();
  }

  fillFromDoctor(doctor) {
    if (!doctor) return;
    const mine = this.plugin.getVisits().filter((x) => x.doctor === doctor).sort(sortAsc);
    const latest = (field) => { const x = mine.filter((w) => w[field]).pop(); return x ? x[field] : ''; };
    if (!this.clinicChips.value() && latest('clinic')) this.clinicChips.setSingle(latest('clinic'));
    if (!this.specChips.value() && latest('specialty')) this.specChips.setSingle(latest('specialty'));
  }

  collect() {
    const date = normDate(this.dateInput.value);
    if (!date) { new Notice('Please choose the date of the visit.'); return null; }
    const followUp = normDate(this.followInput.value);
    if (followUp && followUp < date) { new Notice('The follow-up date is before the visit.'); return null; }
    return {
      date, time: normTime(this.timeInput.value), type: this.typeChips.value(),
      doctor: this.doctorChips.value(), clinic: this.clinicChips.value(), specialty: this.specChips.value(),
      reason: this.reasonChips.value(), related: this.topicChips.values(), questions: this.questionsEl.value.trim(),
      discussed: this.discussedEl.value.trim(), outcome: this.outcomeEl.value.trim(), nextSteps: this.nextEl.value.trim(),
      tests: this.testChips.values(), medChanges: linesOf(this.medsEl.value), followUp, cost: this.costInput.value.trim(),
    };
  }

  async save() {
    const v = this.collect();
    if (!v) return;
    if (!v.doctor && !v.clinic) { new Notice('Add a doctor or a clinic so you can find this visit later.'); return; }
    try {
      const s = this.plugin.settings;
      const remember = (key, values) => { for (const x of values) if (x && !s[key].includes(x)) s[key].push(x); };
      remember('doctors', [v.doctor]); remember('clinics', [v.clinic]); remember('specialties', [v.specialty]);
      remember('reasons', [v.reason]); remember('visitTypes', [v.type]); remember('topics', v.related); remember('tests', v.tests);
      await this.plugin.saveSettings();
      if (this.existing) await this.plugin.updateVisit(this.existing.file, v);
      else await this.plugin.createVisit(v);
      new Notice(this.existing ? 'Visit updated.' : 'Visit saved.');
      this.close();
    } catch (err) {
      console.error('[Doctor Visits]', err);
      new Notice('Couldn’t save the visit: ' + err.message);
    }
  }

  confirmDelete() {
    const m = new Modal(this.app);
    m.titleEl.setText('Delete this visit?');
    m.contentEl.createEl('p', { text: 'The note “' + this.existing.file.basename + '” will be moved to the trash.' });
    const row = m.contentEl.createDiv({ cls: 'mt-footer' });
    row.createDiv({ cls: 'mt-spacer' });
    row.createEl('button', { text: 'Cancel' }).onclick = () => m.close();
    row.createEl('button', { text: 'Delete', cls: 'mod-warning' }).onclick = async () => {
      if (this.app.fileManager.trashFile) await this.app.fileManager.trashFile(this.existing.file);
      else await this.app.vault.trash(this.existing.file, true);
      new Notice('Visit moved to trash.');
      m.close();
      this.close();
    };
    m.open();
  }

  onClose() { this.contentEl.empty(); }
}

/* ------------------------------------------------------------------ */
/* Dashboard renderer                                                  */
/* ------------------------------------------------------------------ */
class VisitsRenderer {
  constructor(plugin, el) {
    this.plugin = plugin;
    this.el = el;
    this.filter = { doctor: '', topic: '', q: '', year: '' };
    this.showAll = false;
  }

  render() {
    const p = this.plugin, el = this.el;
    el.empty();
    el.addClass('dv-dashboard');
    const today = todayKey();
    const all = p.getVisits().sort(sortAsc);
    const upcoming = all.filter((v) => isUpcoming(v, today));
    const past = all.filter((v) => !isUpcoming(v, today)).reverse();
    const due = followUpsDue(all, today);

    const head = el.createDiv({ cls: 'dv-header' });
    const tw = head.createDiv();
    tw.createEl('h2', { text: 'Doctor visits' });
    tw.createDiv({ cls: 'dv-sub', text: plural(all.length, 'visit') + ' logged' });
    const actions = head.createDiv({ cls: 'dv-actions' });
    const btn = (icon, text, fn, cta) => {
      const b = actions.createEl('button', { cls: 'dv-btn' + (cta ? ' mod-cta' : '') });
      setIcon(b.createSpan({ cls: 'dv-btn-icon' }), icon);
      b.createSpan({ text });
      b.onclick = fn;
    };
    btn('download', 'CSV', () => p.exportCsv());
    if (p.openReport) btn('file-text', 'Doctor report', () => p.openReport());
    btn('plus', 'Log visit', () => new VisitModal(p).open(), true);

    if (!all.length) {
      const empty = el.createDiv({ cls: 'dv-card dv-empty' });
      setIcon(empty.createDiv({ cls: 'dv-empty-icon' }), 'stethoscope');
      empty.createEl('h3', { text: 'No visits logged yet' });
      empty.createEl('p', { text: 'Log past appointments or add an upcoming one. You can note the clinic and doctor, the reason, questions to ask, what was discussed, results, medication changes and when to follow up.' });
      empty.createEl('button', { text: 'Log a visit', cls: 'mod-cta' }).onclick = () => new VisitModal(p).open();
      return;
    }

    /* Tiles */
    const tiles = el.createDiv({ cls: 'dv-tiles' });
    const tile = (label, value, sub, cls) => {
      const t = tiles.createDiv({ cls: 'dv-tile' + (cls ? ' ' + cls : '') });
      t.createDiv({ cls: 'dv-tile-label', text: label });
      t.createDiv({ cls: 'dv-tile-value', text: value });
      if (sub) t.createDiv({ cls: 'dv-tile-sub', text: sub });
    };
    const next = upcoming[0];
    tile('Next visit', next ? relDays(next.date, today).replace(/^./, (c) => c.toUpperCase()) : 'None booked', next ? fmtKey(next.date) + (next.time ? ' · ' + next.time : '') + ' · ' + who(next) : 'Add an upcoming visit to see it here', next ? 'is-accent' : '');
    const last = past[0];
    tile('Last visit', last ? relDays(last.date, today).replace(/^./, (c) => c.toUpperCase()) : '–', last ? fmtKey(last.date) + ' · ' + who(last) : '');
    const yearAgo = addDaysKey(today, -365);
    const lastYear = past.filter((v) => v.date > yearAgo);
    tile('Visits · last 12 months', String(lastYear.length), ((n) => n + (n === 1 ? ' doctor or clinic' : ' doctors or clinics'))(new Set(lastYear.map((v) => v.doctor || v.clinic)).size));
    const overdue = due.filter((v) => v.followUp < today).length;
    tile('Follow-ups to book', String(due.length), overdue ? overdue + ' overdue' : due.length ? 'Next by ' + fmtKey(due[0].followUp) : 'Nothing pending', overdue ? 'is-warn' : '');

    /* Upcoming */
    if (upcoming.length) {
      el.createDiv({ cls: 'dv-section-heading', text: 'Upcoming' });
      for (const v of upcoming) this.visitCard(el, v, today, true, past);
    }

    /* Follow-ups */
    if (due.length) {
      el.createDiv({ cls: 'dv-section-heading', text: 'Follow-ups to book' });
      const box = el.createDiv({ cls: 'dv-card dv-due' });
      for (const v of due) {
        const r = box.createDiv({ cls: 'dv-due-row' + (v.followUp < today ? ' is-overdue' : '') });
        const t = r.createDiv({ cls: 'dv-due-text' });
        t.createDiv({ cls: 'dv-due-title', text: who(v) + (v.reason ? ' · ' + v.reason : '') });
        t.createDiv({ cls: 'dv-muted', text: 'Follow up by ' + fmtKey(v.followUp) + ' (' + relDays(v.followUp, today) + ') · asked on ' + fmtKey(v.date) });
        const b = r.createEl('button', { text: 'Add visit' });
        b.onclick = () => new VisitModal(p, null, {
          date: v.followUp >= today ? v.followUp : today,
          prefill: { doctor: v.doctor, clinic: v.clinic, specialty: v.specialty, reason: p.settings.reasons.includes('Follow-up') ? 'Follow-up' : v.reason, related: v.related.slice() },
        }).open();
      }
    }

    /* History */
    const hist = el.createDiv({ cls: 'dv-section-heading dv-hist-head' });
    hist.createSpan({ text: 'Visit history' });
    // Cards (default), grid or list
    const views = hist.createDiv({ cls: 'dv-views', attr: { role: 'group', 'aria-label': 'History view' } });
    const VIEWS = [['cards', 'rows-3', 'Cards'], ['grid', 'layout-grid', 'Grid'], ['list', 'list', 'List']];
    const curView = () => (VIEWS.some((x) => x[0] === this.plugin.settings.historyView) ? this.plugin.settings.historyView : 'cards');
    for (const [id, icon, label] of VIEWS) {
      const b = views.createEl('button', { cls: 'clickable-icon dv-view-btn' + (curView() === id ? ' is-active' : ''), attr: { 'aria-label': label + ' view', 'aria-pressed': String(curView() === id) } });
      setIcon(b, icon);
      b.onclick = async () => {
        this.plugin.settings.historyView = id; await this.plugin.saveSettings();
        for (const x of views.children) { const on = x === b; x.toggleClass('is-active', on); x.setAttribute('aria-pressed', String(on)); }
        this.renderHistory(listEl, past, today);
      };
    }
    const filters = el.createDiv({ cls: 'dv-filters' });
    const search = filters.createEl('input', { type: 'search', attr: { placeholder: 'Search notes, results, medications…', 'aria-label': 'Search visits' } });
    search.value = this.filter.q;
    search.addEventListener('input', () => { this.filter.q = search.value; this.renderHistory(listEl, past, today); });
    const sel = (label, options, key) => {
      const s = filters.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label } });
      s.createEl('option', { text: label, attr: { value: '' } });
      for (const o of options) s.createEl('option', { text: o, attr: { value: o } });
      s.value = this.filter[key];
      s.onchange = () => { this.filter[key] = s.value; this.renderHistory(listEl, past, today); };
    };
    sel('All years', [...new Set(past.map((v) => v.date.slice(0, 4)))].sort().reverse(), 'year');
    sel('All doctors and clinics', [...new Set(past.map((v) => v.doctor || v.clinic))].sort(), 'doctor');
    sel('All topics', [...new Set(past.flatMap((v) => v.related))].sort(), 'topic');
    const listEl = el.createDiv({ cls: 'dv-history' });
    this.renderHistory(listEl, past, today);

    /* Care team */
    this.renderTeam(el, all, today);
  }

  renderHistory(listEl, past, today) {
    listEl.empty();
    const f = this.filter, q = f.q.trim().toLowerCase();
    const shown = past.filter((v) => {
      if (f.year && v.date.slice(0, 4) !== f.year) return false;
      if (f.doctor && (v.doctor || v.clinic) !== f.doctor) return false;
      if (f.topic && !v.related.includes(f.topic)) return false;
      if (q) {
        const hay = [v.doctor, v.clinic, v.specialty, v.reason, v.questions, v.discussed, v.outcome, v.nextSteps, ...v.tests, ...v.medChanges, ...v.related].join('\n').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (!shown.length) { listEl.createDiv({ cls: 'dv-muted dv-pad', text: past.length ? 'No visits match these filters.' : 'No past visits yet.' }); return; }
    const view = ['grid', 'list'].includes(this.plugin.settings.historyView) ? this.plugin.settings.historyView : 'cards';
    const limit = this.showAll || f.year ? shown.length : view === 'cards' ? 10 : 30;
    listEl.className = 'dv-history is-' + view;
    let year = null, box = listEl;
    if (view === 'list') {
      const t = listEl.createEl('table', { cls: 'dv-list' });
      const hr = t.createEl('thead').createEl('tr');
      for (const h of ['Date', 'Reason', 'Doctor · clinic', 'Type', 'Result', 'Follow-up', '']) hr.createEl('th', { text: h });
      box = t.createEl('tbody');
    }
    shown.slice(0, limit).forEach((v) => {
      const y = v.date.slice(0, 4);
      if (y !== year) {
        year = y;
        if (view === 'list') box.createEl('tr', { cls: 'dv-list-year' }).createEl('td', { text: y, attr: { colspan: '7' } });
        else { listEl.createDiv({ cls: 'dv-year', text: y }); if (view === 'grid') box = listEl.createDiv({ cls: 'dv-grid' }); }
      }
      if (view === 'cards') this.visitCard(listEl, v, today, false, null);
      else if (view === 'grid') this.visitTile(box, v);
      else this.visitRow(box, v);
    });
    if (shown.length > limit) {
      const more = listEl.createEl('button', { cls: 'dv-more', text: 'Show all ' + shown.length + ' visits' });
      more.onclick = () => { this.showAll = true; this.renderHistory(listEl, past, today); };
    }
  }

  /** Compact tile for the grid view; click to edit, the icon opens the note */
  visitTile(parent, v) {
    const p = this.plugin, d = parseKey(v.date);
    const t = parent.createDiv({ cls: 'dv-tile', attr: { tabindex: '0', role: 'button', 'aria-label': 'Edit visit: ' + (v.reason || 'Visit') + ', ' + fmtKey(v.date) } });
    const top = t.createDiv({ cls: 'dv-tile-top' });
    top.createDiv({ cls: 'dv-tile-date', text: MONTHS[d.getMonth()] + ' ' + d.getDate() + (v.time ? ' · ' + v.time : '') });
    const open = top.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Open note' } });
    setIcon(open, 'file-text');
    open.onclick = (e) => { e.stopPropagation(); p.app.workspace.getLeaf('tab').openFile(v.file); };
    t.createDiv({ cls: 'dv-tile-reason', text: v.reason || 'Visit' });
    t.createDiv({ cls: 'dv-tile-who', text: [v.doctor, v.clinic].filter(Boolean).join(' · ') || ' ' });
    const res = v.outcome || v.nextSteps || v.discussed;
    if (res) t.createDiv({ cls: 'dv-tile-res', text: res });
    const tags = t.createDiv({ cls: 'dv-tile-tags' });
    if (v.type) tags.createSpan({ cls: 'dv-badge', text: v.type });
    for (const r of v.related.slice(0, 2)) tags.createSpan({ cls: 'dv-tag', text: r });
    if (v.followUp) tags.createSpan({ cls: 'dv-badge', text: 'Follow up ' + fmtKey(v.followUp) });
    const edit = () => new VisitModal(p, v).open();
    t.onclick = edit;
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(); } });
  }
  /** One row in the list view */
  visitRow(tbody, v) {
    const p = this.plugin;
    const tr = tbody.createEl('tr', { cls: 'dv-list-row', attr: { tabindex: '0', title: 'Click to edit' } });
    tr.createEl('td', { cls: 'dv-nowrap', text: fmtKey(v.date) + (v.time ? ' ' + v.time : '') });
    tr.createEl('td', { cls: 'dv-list-reason', text: v.reason || 'Visit' });
    tr.createEl('td', { text: [v.doctor, v.clinic].filter(Boolean).join(' · ') });
    tr.createEl('td', { cls: 'dv-nowrap', text: v.type || '' });
    tr.createEl('td', { cls: 'dv-list-res', text: v.outcome || v.nextSteps || '' });
    tr.createEl('td', { cls: 'dv-nowrap', text: v.followUp ? fmtKey(v.followUp) : '' });
    const c = tr.createEl('td', { cls: 'dv-list-tools' });
    const open = c.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Open note' } });
    setIcon(open, 'file-text');
    open.onclick = (e) => { e.stopPropagation(); p.app.workspace.getLeaf('tab').openFile(v.file); };
    const edit = () => new VisitModal(p, v).open();
    tr.onclick = edit;
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') edit(); });
  }

  visitCard(parent, v, today, upcoming, past) {
    const p = this.plugin;
    const card = parent.createDiv({ cls: 'dv-card dv-visit' + (upcoming ? ' is-upcoming' : '') });
    const date = card.createDiv({ cls: 'dv-date' });
    const d = parseKey(v.date);
    date.createDiv({ cls: 'dv-date-mon', text: MONTHS[d.getMonth()] });
    date.createDiv({ cls: 'dv-date-day', text: String(d.getDate()) });
    date.createDiv({ cls: 'dv-date-dow', text: DOW[d.getDay()] });
    const body = card.createDiv({ cls: 'dv-body' });
    const top = body.createDiv({ cls: 'dv-top' });
    const title = top.createDiv({ cls: 'dv-title' });
    title.createSpan({ cls: 'dv-reason', text: v.reason || 'Visit' });
    if (v.type) title.createSpan({ cls: 'dv-badge', text: v.type });
    if (upcoming) title.createSpan({ cls: 'dv-badge is-accent', text: relDays(v.date, today) });
    const tools = top.createDiv({ cls: 'dv-tools' });
    const edit = tools.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': upcoming ? 'Edit or add notes' : 'Edit visit' } });
    setIcon(edit, 'pencil');
    edit.onclick = () => new VisitModal(p, v).open();
    const open = tools.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Open note' } });
    setIcon(open, 'file-text');
    open.onclick = () => p.app.workspace.getLeaf('tab').openFile(v.file);

    body.createDiv({ cls: 'dv-who', text: [v.doctor, v.clinic, v.specialty].filter(Boolean).join(' · ') + (v.time ? ' · ' + v.time : '') });
    if (v.related.length) {
      const tags = body.createDiv({ cls: 'dv-tags' });
      for (const t of v.related) tags.createSpan({ cls: 'dv-tag', text: t });
    }
    const field = (label, text, cls) => {
      if (!text) return;
      const f = body.createDiv({ cls: 'dv-field' + (cls ? ' ' + cls : '') });
      f.createDiv({ cls: 'dv-field-label', text: label });
      f.createDiv({ cls: 'dv-field-text', text });
    };
    if (upcoming) {
      field('Questions to ask', v.questions, 'dv-questions');
      const prev = this.prevDate(v);
      const from = prev || addDaysKey(today, -90);
      const groups = p.sinceGroups ? p.sinceGroups(from, today) : null;
      const since = !groups && p.sinceSummary ? p.sinceSummary(from, today) : null;
      if (groups && groups.length) {
        // One small block per tracker, in your tab order
        const f = body.createDiv({ cls: 'dv-field dv-since' });
        f.createDiv({ cls: 'dv-field-label', text: prev ? 'Since your last visit (' + fmtKey(prev) + ')' : 'Last 90 days' });
        const grid = f.createDiv({ cls: 'dv-since-grid' });
        for (const g of groups) {
          const b = grid.createDiv({ cls: 'dv-since-group dv-since-' + g.key + (g.empty ? ' is-empty' : '') });
          const h = b.createDiv({ cls: 'dv-since-head' });
          setIcon(h.createSpan({ cls: 'dv-since-icon' }), g.icon);
          h.createSpan({ text: g.label });
          const ul = b.createEl('ul');
          for (const line of g.lines) ul.createEl('li', { text: line });
        }
      } else if (since && since.length) {
        const f = body.createDiv({ cls: 'dv-field dv-since' });
        f.createDiv({ cls: 'dv-field-label', text: prev ? 'Since your last visit (' + fmtKey(prev) + ')' : 'Last 90 days' });
        const ul = f.createEl('ul');
        for (const line of since) ul.createEl('li', { text: line });
      }
      if (!v.questions) body.createDiv({ cls: 'dv-muted dv-small', text: 'Tip: add the questions you want to ask with the pencil button.' });
    } else {
      field('Discussed', v.discussed);
      field('Diagnosis or results', v.outcome);
      field('Next steps', v.nextSteps);
      if (v.tests.length) field('Tests or referrals', v.tests.join(', '));
      if (v.medChanges.length) field('Medication changes', v.medChanges.join('\n'));
      if (v.questions && !v.discussed) field('Questions to ask', v.questions);
      if (!hasNotes(v)) body.createDiv({ cls: 'dv-muted dv-small', text: 'No notes yet. Use the pencil to add what was discussed.' });
    }
    const meta = [];
    if (v.followUp) meta.push('Follow up by ' + fmtKey(v.followUp));
    if (v.cost) meta.push('Cost: ' + v.cost);
    if (meta.length) body.createDiv({ cls: 'dv-meta', text: meta.join(' · ') });
  }

  prevDate(v) {
    const today = todayKey();
    const prev = this.plugin.getVisits().filter((w) => w.date < v.date && !isUpcoming(w, today)).sort(sortAsc).pop();
    return prev ? prev.date : '';
  }

  renderTeam(el, all, today) {
    const map = new Map();
    for (const v of all) {
      const k = v.doctor || v.clinic;
      const r = map.get(k) || { name: v.doctor || '', clinic: v.clinic, specialty: v.specialty, count: 0, last: '', next: '' };
      if (!isUpcoming(v, today)) { r.count++; if (v.date > r.last) { r.last = v.date; if (v.clinic) r.clinic = v.clinic; if (v.specialty) r.specialty = v.specialty; } }
      else if (!r.next || v.date < r.next) r.next = v.date;
      map.set(k, r);
    }
    if (!map.size) return;
    el.createDiv({ cls: 'dv-section-heading', text: 'Your care team' });
    const box = el.createDiv({ cls: 'dv-card dv-team' });
    const t = box.createEl('table', { cls: 'dv-table' });
    const hr = t.createEl('thead').createEl('tr');
    for (const h of ['Doctor', 'Clinic', 'Specialty', 'Visits', 'Last', 'Next']) hr.createEl('th', { text: h });
    const tb = t.createEl('tbody');
    for (const r of [...map.values()].sort((a, b) => (b.last || '').localeCompare(a.last || ''))) {
      const tr = tb.createEl('tr');
      tr.createEl('td', { text: r.name || '–' });
      tr.createEl('td', { text: r.clinic || '–' });
      tr.createEl('td', { text: r.specialty || '–' });
      tr.createEl('td', { text: String(r.count) });
      tr.createEl('td', { text: r.last ? fmtKey(r.last) : '–' });
      tr.createEl('td', { text: r.next ? fmtKey(r.next) : '–' });
    }
  }
}

class VisitsView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Doctor visits'; }
  getIcon() { return 'stethoscope'; }
  async onOpen() { this.renderer = new VisitsRenderer(this.plugin, this.contentEl); this.plugin.renderers.add(this.renderer); this.renderer.render(); }
  async onClose() { this.plugin.renderers.delete(this.renderer); }
}

class VisitsSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const c = this.containerEl, p = this.plugin, s = p.settings;
    c.empty();
    new Setting(c).setName('Visit folder').setDesc('New visit notes are created here. Visits are found anywhere in the vault by their "entry: doctor-visit" property.')
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.folder).setValue(s.folder).onChange(async (v) => { s.folder = v.trim() || DEFAULT_SETTINGS.folder; await p.saveSettings(); }));
    new Setting(c).setName('Show the next visit in the status bar').setDesc('Shown when a visit is within the next 14 days.')
      .addToggle((t) => t.setValue(s.showStatusBar).onChange(async (v) => { s.showStatusBar = v; await p.saveSettings(); p.updateStatusBar(); }));
    new Setting(c).setName('Choice lists').setHeading();
    c.createEl('p', { cls: 'setting-item-description', text: 'Clinics, doctors, specialties, reasons, visit types, topics and tests are edited under Settings → Health Dashboard → Selectors.' });
  }
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */
class DoctorVisitsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.renderers = new Set();
    this.registerView(VIEW_TYPE, (leaf) => new VisitsView(leaf, this));
    this.addRibbonIcon('stethoscope', 'Doctor visits', () => this.activateView());
    this.addCommand({ id: 'log-visit', name: 'Log a visit', callback: () => new VisitModal(this).open() });
    this.addCommand({ id: 'open-dashboard', name: 'Open dashboard', callback: () => this.activateView() });
    this.addCommand({
      id: 'edit-current-visit', name: 'Edit this visit',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const v = f && this.visitFromFile(f);
        if (!v) return false;
        if (!checking) new VisitModal(this, v).open();
        return true;
      },
    });
    this.addCommand({ id: 'export-csv', name: 'Export visits to CSV', callback: () => this.exportCsv() });
    this.addCommand({ id: 'pdf-report', name: 'Create PDF report for doctor', checkCallback: (checking) => { if (!this.openReport) return false; if (!checking) this.openReport(); return true; } });
    this.addSettingTab(new VisitsSettingTab(this.app, this));

    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('dv-status');
    this.statusEl.onclick = () => this.activateView();
    const refresh = (f) => { if (!f || (f.extension === 'md')) this.requestRefresh(); };
    this.registerEvent(this.app.metadataCache.on('changed', refresh));
    this.registerEvent(this.app.vault.on('delete', refresh));
    this.registerEvent(this.app.vault.on('rename', refresh));
    this.app.workspace.onLayoutReady(() => this.requestRefresh());
    this.registerInterval(window.setInterval(() => this.updateStatusBar(), 30 * 60 * 1000));
  }
  onunload() { if (this._timer) window.clearTimeout(this._timer); }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) || {});
    for (const k of LIST_KEYS) this.settings[k] = Array.isArray(this.settings[k]) ? this.settings[k].slice() : DEFAULT_SETTINGS[k].slice();
  }
  async saveSettings() { await this.saveData(this.settings); this.requestRefresh(); }

  requestRefresh() {
    if (this._timer) window.clearTimeout(this._timer);
    this._timer = window.setTimeout(() => {
      for (const r of this.renderers) { try { r.render(); } catch (e) { console.error('Doctor visits render failed', e); } }
      this.updateStatusBar();
      if (this.onRefresh) this.onRefresh();
    }, 250);
  }

  visitFromFile(file) {
    if (!(file instanceof TFile) || file.extension !== 'md') return null;
    const c = this.app.metadataCache.getFileCache(file);
    return parseVisit(file, c && c.frontmatter);
  }
  getVisits() {
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) { const v = this.visitFromFile(f); if (v) out.push(v); }
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

  async createVisit(v) {
    const folder = normalizePath(this.settings.folder || DEFAULT_SETTINGS.folder);
    await this.ensureFolder(folder);
    const name = (v.date + ' ' + (v.doctor || v.clinic || 'Visit')).replace(/[\\/:*?"<>|#^[\]]/g, '-').trim();
    let path = normalizePath(folder + '/' + name + '.md');
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(folder + '/' + name + ' (' + i + ').md');
    const fm = visitToFrontmatter(v);
    for (const k of Object.keys(fm)) if (isEmpty(fm[k])) delete fm[k];
    const body = '# ' + (v.reason || 'Doctor visit') + ' · ' + fmtKey(v.date) + '\n\n' +
      '> Logged with Health Dashboard. Use **Doctor Visits: Edit this visit** from the command palette to change the details, or write extra notes below.\n\n';
    return this.app.vault.create(path, '---\n' + stringifyYaml(fm) + '---\n\n' + body);
  }

  async updateVisit(file, v) {
    const data = visitToFrontmatter(v);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      for (const [k, val] of Object.entries(data)) { if (isEmpty(val)) delete fm[k]; else fm[k] = val; }
    });
  }

  async activateView() {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) { leaf = ws.getLeaf('tab'); await leaf.setViewState({ type: VIEW_TYPE, active: true }); }
    ws.revealLeaf(leaf);
  }

  updateStatusBar() {
    if (!this.statusEl) return;
    const today = todayKey();
    const next = this.settings.showStatusBar ? this.getVisits().filter((v) => isUpcoming(v, today)).sort(sortAsc)[0] : null;
    if (!next || daysBetween(today, next.date) > 14) { this.statusEl.setText(''); this.statusEl.hide(); return; }
    this.statusEl.show();
    this.statusEl.setText('Doctor visit ' + relDays(next.date, today));
    this.statusEl.setAttr('aria-label', who(next) + ' · ' + fmtKey(next.date) + (next.time ? ' ' + next.time : ''));
  }

  async exportCsv() {
    const visits = this.getVisits().sort(sortAsc);
    if (!visits.length) { new Notice('No visits to export yet.'); return; }
    const esc = (x) => { const s = String(x == null ? '' : x); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['date', 'time', 'type', 'doctor', 'clinic', 'specialty', 'reason', 'related', 'questions', 'discussed', 'diagnosis_or_results', 'next_steps', 'tests', 'medication_changes', 'follow_up', 'cost']];
    for (const v of visits) rows.push([v.date, v.time, v.type, v.doctor, v.clinic, v.specialty, v.reason, v.related.join('; '), v.questions, v.discussed, v.outcome, v.nextSteps, v.tests.join('; '), v.medChanges.join('; '), v.followUp, v.cost]);
    const folder = normalizePath(this.settings.folder || DEFAULT_SETTINGS.folder);
    await this.ensureFolder(folder);
    const path = normalizePath(folder + '/Doctor visits export ' + todayKey() + '.csv');
    const csv = rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await this.app.vault.modify(existing, csv); else await this.app.vault.create(path, csv);
    new Notice('Exported ' + visits.length + ' visits to ' + path);
  }
}

module.exports = DoctorVisitsPlugin;
module.exports._internals = {
  VIEW_TYPE, DEFAULT_SETTINGS, VisitModal, addDaysKey, parseKey, VisitsRenderer, parseVisit, followUpsDue, isUpcoming, todayKey, fmtKey, relDays, who, sortAsc, asArray, normDate,
};
