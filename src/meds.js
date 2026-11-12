/* Medications: what you take now, schedule, refills, history and a printable medication list. */
const K = KitModule;
const { Notice, PluginSettingTab, Setting, setIcon, Menu } = require('obsidian');

const VIEW_TYPE = 'medications-dashboard';
const ENTRY = 'medication';
const AS_NEEDED = 'As needed';
const DEFAULT_SETTINGS = {
  folder: 'Medications',
  allergies: '',
  reportName: '',
  refillWarnDays: 7,
  forms: ['Tablet', 'Capsule', 'Liquid', 'Injection', 'Inhaler', 'Nasal spray', 'Cream or gel', 'Drops', 'Patch', 'Other'],
  kinds: ['Prescription', 'Over the counter', 'Supplement'],
  schedules: ['Once a day', 'Twice a day', 'Three times a day', 'Four times a day', 'Every other day', 'Once a week', AS_NEEDED, 'Other'],
  times: ['Morning', 'Midday', 'Evening', 'Bedtime'],
  purposes: ['Migraine prevention', 'Migraine relief', 'Period pain', 'Blood pressure', 'Pain', 'Allergy', 'Sleep', 'Mood', 'Contraception', 'Vitamin or supplement', 'Other'],
  prescribers: [],
  pharmacies: [],
  stopReasons: ['Finished the course', 'Side effects', 'Not working well enough', 'Doctor’s advice', 'Switched to another medication', 'No longer needed', 'Other'],
};
const LIST_KEYS = ['forms', 'kinds', 'schedules', 'times', 'purposes', 'prescribers', 'pharmacies', 'stopReasons'];

function parse(file, fm) {
  if (!fm || String(fm.entry || '').toLowerCase() !== ENTRY) return null;
  const name = K.str(fm.name);
  if (!name) return null;
  return {
    file, path: file ? file.path : '', name, strength: K.str(fm.strength), form: K.str(fm.form), kind: K.str(fm.kind),
    dose: K.str(fm.dose), schedule: K.str(fm.schedule), times: K.asArray(fm.times), instructions: K.str(fm.instructions),
    purposes: K.asArray(fm.purpose), prescriber: K.str(fm.prescriber), pharmacy: K.str(fm.pharmacy),
    started: K.normDate(fm.started), stopped: K.normDate(fm.stopped), stopReason: K.str(fm.stop_reason),
    refill: K.normDate(fm.refill_date), sideEffects: K.str(fm.side_effects), notes: K.str(fm.notes),
  };
}
const isCurrent = (m, today) => !m.stopped || m.stopped > (today || K.todayKey());
const isAsNeeded = (m) => m.schedule === AS_NEEDED;
const title = (m) => [m.name, m.strength].filter(Boolean).join(' ');
const howTo = (m) => [m.dose, m.schedule ? m.schedule.toLowerCase() : '', m.times.length ? '(' + m.times.join(', ').toLowerCase() + ')' : ''].filter(Boolean).join(' ');
const byName = (a, b) => a.name.localeCompare(b.name);

/* ---------------- Modals ---------------- */
class MedModal extends K.FormModal {
  constructor(plugin, med, opts = {}) {
    super(plugin);
    this.existing = med || null;
    this.m = med ? Object.assign({}, med) : Object.assign({ name: '', strength: '', form: 'Tablet', kind: 'Prescription', dose: '', schedule: 'Once a day', times: [], instructions: '', purposes: [], prescriber: '', pharmacy: '', started: K.todayKey(), stopped: '', stopReason: '', refill: '', sideEffects: '', notes: '' }, opts.prefill || {});
  }
  onOpen() {
    const p = this.plugin, s = p.settings, m = this.m;
    this.begin(this.existing ? 'Edit medication' : 'Add medication');
    const what = this.section('Medication', 'pill');
    const r1 = this.row(what);
    this.nameIn = this.field(r1, 'Name', 'text', m.name, { placeholder: 'e.g. Topiramate' });
    this.strIn = this.field(r1, 'Strength', 'text', m.strength, { placeholder: 'e.g. 25 mg' });
    this.formC = this.chips(what, 'Form', s.forms, m.form, true);
    this.kindC = this.chips(what, 'Type', s.kinds, m.kind, true);
    this.purpC = this.chips(what, 'What it’s for', s.purposes, m.purposes);

    const how = this.section('How you take it', 'clock');
    const r2 = this.row(how);
    this.doseIn = this.field(r2, 'Dose', 'text', m.dose, { placeholder: 'e.g. 1 tablet' });
    this.instrIn = this.field(r2, 'Instructions', 'text', m.instructions, { placeholder: 'e.g. With food' });
    this.schedC = this.chips(how, 'How often', s.schedules, m.schedule, true, { onChange: () => upd() });
    this.timesWrap = how.createDiv();
    this.timesC = this.chips(this.timesWrap, 'Time of day', s.times, m.times);
    const upd = () => this.timesWrap.toggleClass('hk-dim', this.schedC.value() === AS_NEEDED);
    upd();

    const who = this.section('Prescription and refills', 'clipboard-list');
    const docs = s.prescribers.slice();
    for (const d of (p.prescriberOptions ? p.prescriberOptions() : [])) if (!docs.includes(d)) docs.push(d);
    this.presC = this.chips(who, 'Prescribed or recommended by', docs, m.prescriber, true);
    this.pharmC = this.chips(who, 'Pharmacy', s.pharmacies, m.pharmacy, true);
    const r3 = this.row(who);
    this.refillIn = this.field(r3, 'Next refill due', 'date', m.refill);
    const q = r3.createDiv({ cls: 'hk-quick' });
    for (const [t, d] of [['+30 days', 30], ['+60 days', 60], ['+90 days', 90], ['None', 0]]) q.createEl('button', { cls: 'mt-chip', text: t, attr: { type: 'button' } }).onclick = () => { this.refillIn.value = d ? K.addDaysKey(K.todayKey(), d) : ''; };

    const when = this.section('Dates', 'calendar');
    const r4 = this.row(when);
    this.startIn = this.field(r4, 'Started', 'date', m.started);
    this.stopIn = this.field(r4, 'Stopped (leave empty if you still take it)', 'date', m.stopped);
    this.reasonWrap = when.createDiv();
    this.reasonC = this.chips(this.reasonWrap, 'Why it was stopped', s.stopReasons, m.stopReason, true);
    const upd2 = () => this.reasonWrap.toggleClass('hk-hidden', !this.stopIn.value);
    this.stopIn.addEventListener('change', upd2); this.stopIn.addEventListener('input', upd2); upd2();

    const notes = this.section('Notes', 'sticky-note');
    this.sideIn = this.area(notes, 'Side effects', m.sideEffects, 'Anything you’ve noticed.', 2);
    this.notesIn = this.area(notes, 'Notes', m.notes, 'Optional', 2);

    this.footer({
      file: this.existing && this.existing.file,
      onDelete: this.existing ? async () => { await p.trash(this.existing.file); new Notice('Medication moved to trash.'); } : null,
      deleteTitle: 'Delete this medication? (To keep it in your history, set a stop date instead.)',
      saveText: this.existing ? 'Save changes' : 'Add medication',
      onSave: () => this.save(),
    });
    window.setTimeout(() => { if (!this.existing && this.nameIn.focus) this.nameIn.focus(); }, 30);
  }
  async save() {
    const p = this.plugin;
    const name = this.nameIn.value.trim();
    if (!name) { new Notice('Enter the name of the medication.'); return; }
    const started = K.normDate(this.startIn.value), stopped = K.normDate(this.stopIn.value);
    if (started && stopped && stopped < started) { new Notice('The stop date is before the start date.'); return; }
    const v = {
      entry: ENTRY, name, strength: this.strIn.value.trim(), form: this.formC.value(), kind: this.kindC.value(), dose: this.doseIn.value.trim(),
      schedule: this.schedC.value(), times: this.schedC.value() === AS_NEEDED ? [] : this.timesC.values(), instructions: this.instrIn.value.trim(),
      purpose: this.purpC.values(), prescriber: this.presC.value(), pharmacy: this.pharmC.value(), started, stopped,
      stop_reason: stopped ? this.reasonC.value() : '', refill_date: stopped ? '' : K.normDate(this.refillIn.value),
      side_effects: this.sideIn.value.trim(), notes: this.notesIn.value.trim(), tags: ['medication'],
    };
    p.remember('forms', [v.form]); p.remember('kinds', [v.kind]); p.remember('schedules', [v.schedule]); p.remember('times', v.times);
    p.remember('purposes', v.purpose); p.remember('pharmacies', [v.pharmacy]); p.remember('stopReasons', [v.stop_reason]);
    if (v.prescriber && !(p.prescriberOptions && p.prescriberOptions().includes(v.prescriber))) p.remember('prescribers', [v.prescriber]);
    await p.saveSettings();
    if (this.existing) await p.updateNote(this.existing.file, v);
    else await p.createNote(p.settings.folder, [name, v.strength].filter(Boolean).join(' '), v, '# ' + [name, v.strength].filter(Boolean).join(' ') + '\n\n');
    new Notice(this.existing ? 'Medication updated.' : name + ' added.');
    this.close();
  }
}

class StopModal extends K.FormModal {
  constructor(plugin, med) { super(plugin); this.med = med; }
  onOpen() {
    const s = this.plugin.settings;
    this.begin('Stop ' + title(this.med));
    const sec = this.section('Stopping', 'circle-stop');
    const r = this.row(sec);
    this.dateIn = this.field(r, 'Last day taken', 'date', K.todayKey());
    this.reasonC = this.chips(sec, 'Why', s.stopReasons, '', true);
    this.noteIn = this.area(sec, 'Note (optional)', '', 'Added to the medication’s notes.', 2);
    this.footer({ saveText: 'Stop medication', onSave: () => this.save() });
  }
  async save() {
    const p = this.plugin, d = K.normDate(this.dateIn.value);
    if (!d) { new Notice('Choose a date.'); return; }
    const reason = this.reasonC.value();
    p.remember('stopReasons', [reason]); await p.saveSettings();
    const extra = this.noteIn.value.trim();
    await p.updateNote(this.med.file, { stopped: d, stop_reason: reason, refill_date: '', notes: [this.med.notes, extra ? K.fmtKey(d) + ': ' + extra : ''].filter(Boolean).join('\n') });
    new Notice(title(this.med) + ' moved to past medications.');
    this.close();
  }
}

/* ---------------- Dashboard ---------------- */
class MedsRenderer {
  constructor(plugin, el) { this.plugin = plugin; this.el = el; this.q = ''; }
  render() {
    const p = this.plugin, s = p.settings, el = this.el;
    el.empty(); el.addClass('hk-dashboard', 'med-dashboard');
    const all = p.getRecords();
    const today = K.todayKey();
    const cur = all.filter((m) => isCurrent(m, today)).sort(byName);
    const past = all.filter((m) => !isCurrent(m, today)).sort((a, b) => b.stopped.localeCompare(a.stopped));
    K.header(el, 'Medications', K.plural(cur.length, 'current medication') + ' · ' + K.plural(past.length, 'past medication'), [
      { icon: 'download', text: 'CSV', onClick: () => p.exportCsv() },
      { icon: 'printer', text: 'Print medication list', onClick: () => p.printList() },
      { icon: 'plus', text: 'Add medication', cta: true, onClick: () => new MedModal(p).open() },
    ]);
    if (s.allergies) {
      const b = el.createDiv({ cls: 'hk-banner' });
      setIcon(b.createSpan({ cls: 'hk-btn-icon' }), 'shield-alert');
      b.createSpan({ text: 'Allergies and intolerances: ' + s.allergies });
    }
    if (!all.length) {
      K.emptyState(el, 'pill', 'No medications yet', 'Add the medications, supplements and as-needed medicines you take. You’ll get a daily schedule, refill reminders, a history of what you’ve stopped and why, and a medication list you can print for appointments.', 'Add medication', () => new MedModal(p).open());
      return;
    }
    const sched = cur.filter((m) => !isAsNeeded(m)), prn = cur.filter(isAsNeeded);
    const warn = Number(s.refillWarnDays) || 7;
    const due = cur.filter((m) => m.refill && K.daysBetween(today, m.refill) <= warn).sort((a, b) => a.refill.localeCompare(b.refill));
    const d90 = K.addDaysKey(today, -90);
    const tile = K.tiles(el);
    tile('Taking now', String(cur.length), sched.length + ' scheduled · ' + prn.length + ' as needed');
    tile('Refills due', String(due.length), due.length ? 'Next: ' + title(due[0]) + ' ' + K.relDays(due[0].refill, today) : 'Within ' + K.plural(warn, 'day'), due.some((m) => m.refill < today) ? 'is-warn' : due.length ? 'is-accent' : '');
    tile('Started · last 90 days', String(all.filter((m) => m.started && m.started > d90 && m.started <= today).length), '');
    tile('Stopped · last 90 days', String(past.filter((m) => m.stopped > d90).length), '');

    if (due.length) {
      el.createDiv({ cls: 'hk-section-heading', text: 'Refills' });
      const box = el.createDiv({ cls: 'hk-card med-due' });
      for (const m of due) {
        const r = box.createDiv({ cls: 'med-due-row' + (m.refill < today ? ' is-overdue' : '') });
        const t = r.createDiv({ cls: 'med-due-text' });
        t.createDiv({ cls: 'med-due-title', text: title(m) });
        t.createDiv({ cls: 'hk-muted', text: 'Refill ' + (m.refill < today ? 'overdue since ' : 'due ') + K.fmtKey(m.refill) + ' (' + K.relDays(m.refill, today) + ')' + (m.pharmacy ? ' · ' + m.pharmacy : '') });
        r.createEl('button', { text: 'Refilled…' }).onclick = (evt) => this.refillMenu(evt, m);
      }
    }

    if (sched.length) {
      el.createDiv({ cls: 'hk-section-heading', text: 'Daily schedule' });
      const box = el.createDiv({ cls: 'hk-card med-schedule' });
      const cols = s.times.filter((t) => sched.some((m) => m.times.includes(t)));
      const untimed = sched.filter((m) => !m.times.length);
      for (const t of cols.concat(untimed.length ? ['No time set'] : [])) {
        const col = box.createDiv({ cls: 'med-col' });
        col.createDiv({ cls: 'med-col-title', text: t });
        for (const m of t === 'No time set' ? untimed : sched.filter((x) => x.times.includes(t))) {
          const it = col.createDiv({ cls: 'med-col-item' });
          it.createDiv({ cls: 'med-col-name', text: title(m) });
          it.createDiv({ cls: 'hk-muted', text: [m.dose, m.schedule !== 'Once a day' ? m.schedule.toLowerCase() : '', m.instructions].filter(Boolean).join(' · ') });
        }
      }
    }

    const filterRow = el.createDiv({ cls: 'hk-filters' });
    const search = filterRow.createEl('input', { type: 'search', attr: { placeholder: 'Search medications…', 'aria-label': 'Search medications' } });
    search.value = this.q;
    const lists = el.createDiv();
    const draw = () => {
      lists.empty();
      const q = this.q.trim().toLowerCase();
      const hit = (m) => !q || [m.name, m.strength, m.purposes.join(' '), m.prescriber, m.notes, m.sideEffects].join(' ').toLowerCase().includes(q);
      const section = (label, list) => {
        if (!list.length) return;
        lists.createDiv({ cls: 'hk-section-heading', text: label + ' (' + list.length + ')' });
        const g = lists.createDiv({ cls: 'med-cards' });
        for (const m of list) this.medCard(g, m, today);
      };
      section('Scheduled', sched.filter(hit));
      section('As needed', prn.filter(hit));
      const pf = past.filter(hit);
      if (pf.length) {
        lists.createDiv({ cls: 'hk-section-heading', text: 'Past medications (' + pf.length + ')' });
        const box = lists.createDiv({ cls: 'hk-card hk-table-card' });
        const t = box.createEl('table', { cls: 'hk-table' });
        const hr = t.createEl('thead').createEl('tr');
        for (const h of ['Medication', 'For', 'Taken', 'How long', 'Why stopped', '']) hr.createEl('th', { text: h });
        const tb = t.createEl('tbody');
        for (const m of pf) {
          const tr = tb.createEl('tr');
          tr.createEl('td', { text: title(m) });
          tr.createEl('td', { text: m.purposes.join(', ') || '–' });
          tr.createEl('td', { text: (m.started ? K.fmtKey(m.started) : '?') + ' – ' + K.fmtKey(m.stopped) });
          tr.createEl('td', { text: m.started ? K.durationText(K.daysBetween(m.started, m.stopped) + 1) : '–' });
          tr.createEl('td', { text: m.stopReason || '–' });
          const td = tr.createEl('td', { cls: 'hk-td-tools' });
          const ed = td.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit' } }); setIcon(ed, 'pencil'); ed.onclick = () => new MedModal(p, m).open();
          const rs = td.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Start again' } }); setIcon(rs, 'rotate-ccw');
          rs.onclick = () => new MedModal(p, null, { prefill: { name: m.name, strength: m.strength, form: m.form, kind: m.kind, dose: m.dose, schedule: m.schedule, times: m.times.slice(), instructions: m.instructions, purposes: m.purposes.slice(), prescriber: m.prescriber, pharmacy: m.pharmacy } }).open();
        }
      }
      if (!lists.children.length) lists.createDiv({ cls: 'hk-muted hk-pad', text: 'No medications match.' });
    };
    search.addEventListener('input', () => { this.q = search.value; draw(); });
    draw();
  }
  medCard(parent, m, today) {
    const p = this.plugin;
    const c = parent.createDiv({ cls: 'hk-card med-card' });
    const top = c.createDiv({ cls: 'med-top' });
    const t = top.createDiv({ cls: 'med-title' });
    t.createSpan({ cls: 'med-name', text: m.name });
    if (m.strength) t.createSpan({ cls: 'med-strength', text: m.strength });
    const tools = top.createDiv({ cls: 'med-tools' });
    const ed = tools.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit' } }); setIcon(ed, 'pencil'); ed.onclick = () => new MedModal(p, m).open();
    const st = tools.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Stop taking' } }); setIcon(st, 'circle-stop'); st.onclick = () => new StopModal(p, m).open();
    const badges = c.createDiv({ cls: 'med-badges' });
    for (const b of [m.kind, m.form]) if (b) badges.createSpan({ cls: 'med-badge', text: b });
    if (m.started && m.started > today) badges.createSpan({ cls: 'med-badge is-accent', text: 'Starts ' + K.fmtKey(m.started) });
    if (m.stopped) badges.createSpan({ cls: 'med-badge is-warn', text: 'Until ' + K.fmtKey(m.stopped) });
    const line = (label, text) => { if (!text) return; const r = c.createDiv({ cls: 'med-line' }); r.createSpan({ cls: 'med-line-label', text: label }); r.createSpan({ text }); };
    line('Take', [howTo(m), m.instructions].filter(Boolean).join(' · '));
    line('For', m.purposes.join(', '));
    line('From', [m.prescriber, m.pharmacy].filter(Boolean).join(' · '));
    if (m.started && m.started <= today) line('Since', K.fmtKey(m.started) + ' (' + K.durationText(K.daysBetween(m.started, today) + 1) + ')');
    if (m.refill) line('Refill', K.fmtKey(m.refill) + ' (' + K.relDays(m.refill, today) + ')');
    line('Side effects', m.sideEffects);
    line('Notes', m.notes);
  }
  refillMenu(evt, m) {
    const p = this.plugin;
    const menu = new Menu();
    for (const d of [30, 60, 90]) menu.addItem((it) => it.setTitle('Next refill in ' + d + ' days (' + K.fmtKey(K.addDaysKey(K.todayKey(), d)) + ')').setIcon('calendar-plus').onClick(() => p.updateNote(m.file, { refill_date: K.addDaysKey(K.todayKey(), d) })));
    menu.addItem((it) => it.setTitle('Pick a date…').setIcon('calendar').onClick(() => new MedModal(p, m).open()));
    menu.addItem((it) => it.setTitle('No more refills').setIcon('x').onClick(() => p.updateNote(m.file, { refill_date: '' })));
    menu.showAtMouseEvent(evt);
  }
}

/* ---------------- Printable list ---------------- */
function buildList(plugin, o) {
  const s = plugin.settings, today = K.todayKey();
  const all = plugin.getRecords();
  const cur = all.filter((m) => isCurrent(m, today)).sort(byName);
  const R = new K.Report('Medication list', 'as of ' + K.fmtKey(today), '#2c6fbb');
  R.cover([o.name ? 'Name: ' + o.name : '', 'As of ' + K.fmtKey(today), K.plural(cur.length, 'current medication')]);
  R.note('Allergies and intolerances: ' + (s.allergies || 'none recorded'), !!s.allergies);
  const cols = [{ label: 'Medication', w: 0.24, wrap: true }, { label: 'How to take', w: 0.3, wrap: true }, { label: 'For', w: 0.18, wrap: true }, { label: 'Prescriber', w: 0.15, wrap: true }, { label: 'Since', w: 0.13 }];
  const row = (m) => [[title(m), m.form].filter(Boolean).join(', '), [howTo(m), m.instructions].filter(Boolean).join('. '), m.purposes.join(', '), m.prescriber, m.started ? K.fmtKey(m.started) : ''];
  const sched = cur.filter((m) => !isAsNeeded(m)), prn = cur.filter(isAsNeeded);
  R.heading('Taken regularly');
  if (sched.length) R.table(cols, sched.map(row)); else R.para('None.', { color: K.RC.muted });
  R.heading('Taken as needed');
  if (prn.length) R.table(cols, prn.map(row)); else R.para('None.', { color: K.RC.muted });
  if (o.includePast) {
    const yearAgo = K.addDaysKey(today, -365);
    const past = all.filter((m) => !isCurrent(m, today) && m.stopped >= yearAgo).sort((a, b) => b.stopped.localeCompare(a.stopped));
    if (past.length) {
      R.heading('Stopped in the last 12 months');
      R.table([{ label: 'Medication', w: 0.3, wrap: true }, { label: 'Taken', w: 0.3 }, { label: 'Why stopped', w: 0.4, wrap: true }],
        past.map((m) => [title(m), (m.started ? K.fmtKey(m.started) : '?') + ' – ' + K.fmtKey(m.stopped), (/^side effects$/i.test(m.stopReason) && m.sideEffects ? 'Side effects: ' + m.sideEffects : [m.stopReason, m.sideEffects ? 'Side effects: ' + m.sideEffects : ''].filter(Boolean).join('. '))]));
    }
  }
  if (o.includeSide) {
    const se = cur.filter((m) => m.sideEffects);
    if (se.length) { R.heading('Side effects noticed'); for (const m of se) R.para(title(m) + ': ' + m.sideEffects, { size: 9.5 }); }
  }
  if (o.notes) { R.heading('Questions and notes'); R.para(o.notes); }
  if (plugin.reportExtras) R.extraSections(plugin.reportExtras({ from: '', to: today, includeNotes: o.includeGenNotes !== false, includeMissed: false }));
  R.footerAll('Medication list · keep it up to date and bring it to appointments');
  return R.output();
}

class MedsSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const c = this.containerEl, p = this.plugin, s = p.settings;
    c.empty();
    new Setting(c).setName('Folder').setDesc('One note per medication. The printable list is saved in "<folder>/Reports".')
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.folder).setValue(s.folder).onChange(async (v) => { s.folder = v.trim() || DEFAULT_SETTINGS.folder; await p.saveSettings(); }));
    new Setting(c).setName('Allergies and intolerances').setDesc('Shown on the dashboard and at the top of the printed medication list.')
      .addTextArea((t) => t.setPlaceholder('e.g. Penicillin (rash)').setValue(s.allergies || '').onChange(async (v) => { s.allergies = v.trim(); await p.saveSettings(); }));
    new Setting(c).setName('Refill reminder').setDesc('Show a refill as due this many days ahead.')
      .addSlider((sl) => sl.setLimits(1, 21, 1).setValue(Number(s.refillWarnDays) || 7).setDynamicTooltip().onChange(async (v) => { s.refillWarnDays = v; await p.saveSettings(); }));
    new Setting(c).setName('Choice lists').setHeading();
    c.createEl('p', { cls: 'setting-item-description', text: 'Forms, types, schedules, times, purposes, prescribers, pharmacies and stop reasons are edited under Settings → Health Dashboard → Selectors.' });
  }
}

class MedicationsPlugin extends K.TrackerPlugin {
  async onload() {
    this.cfg = { viewType: VIEW_TYPE, title: 'Medications', icon: 'pill', defaults: DEFAULT_SETTINGS, listKeys: LIST_KEYS, Renderer: MedsRenderer, parse };
    await this.setup();
    this.addCommand({ id: 'add-medication', name: 'Add medication', callback: () => new MedModal(this).open() });
    this.addCommand({ id: 'print-list', name: 'Print medication list (PDF)', callback: () => this.printList() });
    this.addCommand({
      id: 'edit-current', name: 'Edit this medication',
      checkCallback: (checking) => { const f = this.app.workspace.getActiveFile(); const m = f && this.recordFromFile(f); if (!m) return false; if (!checking) new MedModal(this, m).open(); return true; },
    });
    this.addSettingTab(new MedsSettingTab(this.app, this));
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('med-status');
    this.statusEl.onclick = () => this.activateView();
  }
  current() { const t = K.todayKey(); return this.getRecords().filter((m) => isCurrent(m, t)).sort(byName); }
  currentNames() { return [...new Set(this.current().map((m) => m.name))]; }
  info(name) {
    const n = String(name || '').toLowerCase();
    const m = this.current().find((x) => x.name.toLowerCase() === n);
    return m ? { strength: m.strength, dose: m.dose, schedule: m.schedule } : null;
  }
  currentRows() { return this.current().map((m) => ({ name: title(m), schedule: [howTo(m), m.instructions].filter(Boolean).join('. '), purpose: m.purposes.join(', ') })); }
  changesBetween(fromKey, toKey) {
    const all = this.getRecords();
    return {
      started: all.filter((m) => m.started && m.started > fromKey && m.started <= toKey).map(title),
      stopped: all.filter((m) => m.stopped && m.stopped > fromKey && m.stopped <= toKey).map((m) => title(m) + (m.stopReason ? ' (' + m.stopReason.toLowerCase() + ')' : '')),
    };
  }
  refillsDue() { const t = K.todayKey(), w = Number(this.settings.refillWarnDays) || 7; return this.current().filter((m) => m.refill && K.daysBetween(t, m.refill) <= w).sort((a, b) => a.refill.localeCompare(b.refill)); }
  afterRefresh() {
    if (!this.statusEl) return;
    const due = this.refillsDue();
    if (!due.length) { this.statusEl.setText(''); this.statusEl.hide(); return; }
    this.statusEl.show();
    this.statusEl.setText(due.length === 1 ? 'Refill ' + due[0].name + ' ' + K.relDays(due[0].refill) : due.length + ' refills due');
  }
  printList() {
    new K.ReportOptionsModal(this, {
      title: 'Print medication list', defaultRange: '365', noRange: true,
      toggles: [['includePast', 'Include medications stopped in the last 12 months', true], ['includeSide', 'Include side effects', true]],
      build: async (o) => {
        const { file, path } = await this.writeFile(this.settings.folder + '/Reports', 'Medication list ' + K.todayKey() + '.pdf', buildList(this, o), true);
        new Notice('Medication list saved to ' + path);
        return file;
      },
    }).open();
  }
  async exportCsv() {
    const rows = [['name', 'strength', 'form', 'type', 'dose', 'schedule', 'times', 'instructions', 'for', 'prescriber', 'pharmacy', 'started', 'stopped', 'stop_reason', 'next_refill', 'side_effects', 'notes']];
    for (const m of this.getRecords().sort(byName)) rows.push([m.name, m.strength, m.form, m.kind, m.dose, m.schedule, m.times.join('; '), m.instructions, m.purposes.join('; '), m.prescriber, m.pharmacy, m.started, m.stopped, m.stopReason, m.refill, m.sideEffects, m.notes]);
    await this.exportRows(this.settings.folder, 'Medications export', rows);
  }
}

module.exports = MedicationsPlugin;
module.exports._internals = { VIEW_TYPE, DEFAULT_SETTINGS, MedModal, StopModal, MedsRenderer, Renderer: MedsRenderer, parse, isCurrent, buildList, title };
