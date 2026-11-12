/* ================================================================== */
/* General notes, records without an exact date, and PDF reports       */
/* ================================================================== */
const KK = KitModule;
const NOTE_ENTRY = 'health-note', MISSED_ENTRY = 'missed-event';
const NOTE_LABELS = { general: 'General', period: 'Period', migraine: 'Migraine', visits: 'Doctor visits', bp: 'Blood pressure', illness: 'Sickness', meds: 'Medications', a1c: 'A1C' };
const MISSED_KEYS = ['period', 'migraine'];
const MISSED_WORD = { period: ['period', 'periods'], migraine: ['migraine', 'migraines'] };
const REPORT_TITLES = { period: 'Period', migraine: 'Migraine', visits: 'Doctor visits', bp: 'Blood pressure', illness: 'Sickness', meds: 'Medications', a1c: 'A1C' };

function parseNote(file, fm) {
  if (!fm || String(fm.entry || '').toLowerCase() !== NOTE_ENTRY) return null;
  const tracker = NOTE_LABELS[fm.tracker] ? String(fm.tracker) : 'general';
  return { file, tracker, date: KK.normDate(fm.date) || '', title: KK.str(fm.title), text: KK.str(fm.note) };
}
function parseMissed(file, fm) {
  if (!fm || String(fm.entry || '').toLowerCase() !== MISSED_ENTRY) return null;
  const tracker = String(fm.tracker || '');
  if (!MISSED_KEYS.includes(tracker)) return null;
  const month = /^\d{4}-\d{2}$/.test(String(fm.month || '').trim()) ? String(fm.month).trim() : '';
  const from = KK.normDate(fm.from), to = KK.normDate(fm.to);
  const mode = month ? 'month' : from ? 'range' : 'unknown';
  const count = Math.max(1, Math.round(KK.num(fm.count) || 1));
  return {
    file, tracker, mode, month, from, to: to || from, roughly: KK.str(fm.roughly), count,
    severity: KK.str(fm.severity), type: KK.str(fm.type), lengthDays: KK.num(fm.length_days), notes: KK.str(fm.notes),
  };
}
const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return KK.MONTHS_LONG[mo - 1] + ' ' + y; };
function whenLabel(r) {
  let t = r.mode === 'month' ? monthLabel(r.month) : r.mode === 'range' ? (r.from === r.to ? KK.fmtKey(r.from) : KK.fmtKey(r.from) + ' – ' + KK.fmtKey(r.to)) : 'Date unknown';
  if (r.roughly) t += r.mode === 'unknown' ? ': ' + r.roughly : ' (' + r.roughly + ')';
  return t;
}
const missedSpan = (r) => (r.mode === 'month' ? [r.month + '-01', KK.keyOf(new Date(Number(r.month.slice(0, 4)), Number(r.month.slice(5)), 0))] : r.mode === 'range' ? [r.from, r.to] : null);
const missedSortKey = (r) => (r.mode === 'month' ? r.month + '-01' : r.mode === 'range' ? r.from : '0000');
function missedInRange(r, from, to) {
  const sp = missedSpan(r);
  if (!sp) return true; // no date at all: always listed, clearly marked
  return (!from || sp[1] >= from) && (!to || sp[0] <= to);
}
const missedDetails = (r) => { const t = [r.type, r.severity ? r.severity.toLowerCase() : '', r.lengthDays ? 'about ' + KK.plural(r.lengthDays, 'day') + ' long' : '', r.notes].filter(Boolean).join('. '); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; };

/* ---------------- Modals ---------------- */
class NoteModal extends KK.FormModal {
  constructor(host, tracker, note) { super(host); this.host = host; this.tracker = tracker || 'general'; this.existing = note || null; }
  onOpen() {
    const h = this.host, n = this.existing || { date: KK.todayKey(), title: '', text: '', tracker: this.tracker };
    this.begin(this.existing ? 'Edit note' : 'Add a note');
    const sec = this.section('Note', 'notebook-pen');
    const row = this.row(sec);
    this.dateIn = this.field(row, 'Date', 'date', n.date);
    this.titleIn = this.field(row, 'Title (optional)', 'text', n.title, { placeholder: 'e.g. Started a new job' });
    const opts = Object.keys(NOTE_LABELS).filter((k) => k === 'general' || h.isActive(k) || k === n.tracker);
    this.aboutC = this.chips(sec, 'About', opts.map((k) => NOTE_LABELS[k]), NOTE_LABELS[n.tracker], true, { allowCustom: false });
    this.textIn = this.area(sec, 'Note', n.text, 'Anything worth remembering that isn’t part of a log entry: changes in routine, stress, travel, things your doctor said, questions to ask…', 8);
    this.footer({
      file: this.existing && this.existing.file,
      onDelete: this.existing ? async () => { await h.trashFile(this.existing.file); h.refreshModule(this.existing.tracker); } : null,
      deleteTitle: 'Delete this note?',
      saveText: this.existing ? 'Save changes' : 'Save note',
      onSave: () => this.save(),
    });
    window.setTimeout(() => { if (this.textIn.focus) this.textIn.focus(); }, 30);
  }
  async save() {
    const h = this.host;
    const text = this.textIn.value.trim(), date = KK.normDate(this.dateIn.value) || KK.todayKey();
    if (!text) { new Notice('Write something in the note first.'); return; }
    const label = this.aboutC.value() || NOTE_LABELS[this.tracker];
    const tracker = Object.keys(NOTE_LABELS).find((k) => NOTE_LABELS[k] === label) || 'general';
    const fm = { entry: NOTE_ENTRY, tracker, date, title: this.titleIn.value.trim(), note: text, tags: ['health-note'] };
    if (this.existing) await h.updateEntry(this.existing.file, fm);
    else await h.createEntry(h.notesFolder() + '/Notes/' + NOTE_LABELS[tracker], date + ' ' + (fm.title || 'Note'), fm);
    if (this.existing && this.existing.tracker !== tracker) h.refreshModule(this.existing.tracker);
    h.refreshModule(tracker);
    new Notice('Note saved.');
    this.close();
  }
}

class MissedModal extends KK.FormModal {
  constructor(host, tracker, rec) { super(host); this.host = host; this.tracker = tracker; this.existing = rec || null; }
  onOpen() {
    const h = this.host, k = this.tracker, [one, many] = MISSED_WORD[k];
    const r = this.existing || { mode: 'month', month: KK.todayKey().slice(0, 7), from: '', to: '', roughly: '', count: 1, severity: '', type: '', lengthDays: null, notes: '' };
    this.begin((this.existing ? 'Edit ' : 'Log a missed ') + one + ' (no exact date)');
    this.contentEl.createDiv({ cls: 'mt-help hd-x-help', text: 'For a ' + one + ' you know happened but didn’t log at the time. It is listed on the dashboard and can go in your doctor report, but it is never counted in statistics, charts or the calendar.' });
    const when = this.section('When', 'calendar-search');
    const modes = { month: 'In a month', range: 'Between two dates', unknown: 'I’m not sure' };
    this.modes = modes;
    this.modeC = this.chips(when, 'When did it happen?', Object.values(modes), modes[r.mode], true, { allowCustom: false, onChange: () => upd() });
    const mRow = this.row(when);
    this.monthIn = this.field(mRow, 'Month', 'month', r.month || KK.todayKey().slice(0, 7), { max: KK.todayKey().slice(0, 7) });
    const rRow = this.row(when);
    this.fromIn = this.field(rRow, 'From', 'date', r.from);
    this.toIn = this.field(rRow, 'To', 'date', r.to);
    const tRow = this.row(when);
    this.roughIn = this.field(tRow, 'Roughly when (optional)', 'text', r.roughly, { placeholder: 'e.g. early in the month, around Christmas, last winter' });
    const upd = () => {
      const mode = Object.keys(modes).find((x) => modes[x] === this.modeC.value()) || 'month';
      mRow.toggleClass('hk-hidden', mode !== 'month');
      rRow.toggleClass('hk-hidden', mode !== 'range');
    };
    upd();
    const what = this.section('What you remember', k === 'migraine' ? 'brain' : 'droplet');
    const cRow = this.row(what);
    this.countIn = this.field(cRow, 'How many ' + many, 'number', r.count, { min: '1', max: '60', step: '1' });
    if (k === 'migraine') {
      const mig = h.migraine;
      this.typeC = this.chips(what, 'Type (if you know)', mig ? mig.settings.types : [], r.type, true);
      this.sevC = this.chips(what, 'Pain (if you remember)', ['Very mild', 'Mild', 'Moderate', 'Severe', 'Very severe'], r.severity, true, { allowCustom: false });
    } else {
      this.lenIn = this.field(cRow, 'How long, in days (optional)', 'number', r.lengthDays, { min: '1', max: '15', step: '1' });
      this.sevC = this.chips(what, 'Flow (if you remember)', ['Light', 'Medium', 'Heavy'], r.severity, true, { allowCustom: false });
    }
    this.notesIn = this.area(what, 'Notes', r.notes, 'Anything else you remember.', 3);
    this.footer({
      file: this.existing && this.existing.file,
      onDelete: this.existing ? async () => { await h.trashFile(this.existing.file); h.refreshModule(k); } : null,
      deleteTitle: 'Delete this record?',
      saveText: this.existing ? 'Save changes' : 'Save',
      onSave: () => this.save(modes),
    });
  }
  async save(modes) {
    modes = modes || this.modes;
    const h = this.host, k = this.tracker;
    const mode = Object.keys(modes).find((x) => modes[x] === this.modeC.value()) || 'month';
    const fm = { entry: MISSED_ENTRY, tracker: k, month: '', from: '', to: '', roughly: this.roughIn.value.trim(), count: Math.max(1, Math.round(KK.num(this.countIn.value) || 1)),
      severity: this.sevC.value(), type: this.typeC ? this.typeC.value() : '', length_days: this.lenIn ? KK.num(this.lenIn.value) : null, notes: this.notesIn.value.trim(), tags: ['missed-' + k] };
    if (mode === 'month') {
      const m = String(this.monthIn.value || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) { new Notice('Choose the month.'); return; }
      if (m > KK.todayKey().slice(0, 7)) { new Notice('That month is in the future.'); return; }
      fm.month = m;
    } else if (mode === 'range') {
      const f = KK.normDate(this.fromIn.value), t = KK.normDate(this.toIn.value) || f;
      if (!f) { new Notice('Choose at least the first date.'); return; }
      if (t < f) { new Notice('The second date is before the first.'); return; }
      fm.from = f; fm.to = t;
    } else if (!fm.roughly && !fm.notes) { new Notice('Add roughly when it happened, or a note, so you can recognise it later.'); return; }
    const base = (k === 'migraine' ? 'Missed migraine ' : 'Missed period ') + (fm.month || fm.from || 'date unknown');
    if (this.existing) await h.updateEntry(this.existing.file, fm);
    else await h.createEntry(h.notesFolder() + '/Missed records', base, fm);
    h.refreshModule(k);
    new Notice('Saved. It won’t be counted in your statistics.');
    this.close();
  }
}

/* ---------------- Dashboard sections ---------------- */
function xCard(parent, icon, title, sub, btnText, onBtn, cls, key) {
  const card = parent.createDiv({ cls: 'hd-x-card' + (cls ? ' ' + cls : ''), attr: key ? { 'data-key': key } : {} });
  const head = card.createDiv({ cls: 'hd-x-head' });
  if (key) setIcon(head.createSpan({ cls: 'hd-grip', attr: { title: 'Drag to move', 'aria-hidden': 'true' } }), 'grip-vertical');
  setIcon(head.createSpan({ cls: 'hd-x-icon' }), icon);
  const tt = head.createDiv({ cls: 'hd-x-titles' });
  tt.createEl('h4', { text: title });
  if (sub) tt.createDiv({ cls: 'hd-x-sub', text: sub });
  if (btnText) {
    const b = head.createEl('button', { cls: 'hd-x-btn' });
    setIcon(b.createSpan({ cls: 'hd-btn-icon' }), 'plus');
    b.createSpan({ text: btnText });
    b.onclick = onBtn;
  }
  return card;
}

const ExtrasMethods = {
  notesFolder() { return obsidian.normalizePath(this.settings.notesFolder || 'Health Notes'); },
  scanEntries(parse) {
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const c = this.app.metadataCache.getFileCache(f);
      const r = c && c.frontmatter ? parse(f, c.frontmatter) : null;
      if (r) out.push(r);
    }
    return out;
  },
  getNotes(tracker) { return this.scanEntries(parseNote).filter((n) => !tracker || n.tracker === tracker).sort((a, b) => (b.date + b.file.path).localeCompare(a.date + a.file.path)); },
  getMissed(tracker) { return this.scanEntries(parseMissed).filter((r) => !tracker || r.tracker === tracker).sort((a, b) => missedSortKey(b).localeCompare(missedSortKey(a))); },
  async ensureFolderPath(path) {
    const parts = obsidian.normalizePath(path).split('/');
    let cur = '';
    for (const part of parts) { cur = cur ? cur + '/' + part : part; if (!this.app.vault.getAbstractFileByPath(cur)) { try { await this.app.vault.createFolder(cur); } catch (e) { /* exists */ } } }
  },
  async createEntry(folder, base, fm) {
    folder = obsidian.normalizePath(folder);
    await this.ensureFolderPath(folder);
    const name = KK.safeName(base);
    let path = obsidian.normalizePath(folder + '/' + name + '.md');
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = obsidian.normalizePath(folder + '/' + name + ' (' + i + ').md');
    const clean = {};
    for (const [k, v] of Object.entries(fm)) if (!KK.isEmpty(v)) clean[k] = v;
    return this.app.vault.create(path, '---\n' + obsidian.stringifyYaml(clean) + '---\n');
  },
  async updateEntry(file, fm) {
    await this.app.fileManager.processFrontMatter(file, (x) => { for (const [k, v] of Object.entries(fm)) { if (KK.isEmpty(v)) delete x[k]; else x[k] = v; } });
  },
  async trashFile(file) {
    if (this.app.fileManager.trashFile) await this.app.fileManager.trashFile(file); else await this.app.vault.trash(file, true);
  },
  /** Re-draw a tracker's dashboards (its own view and the Health dashboard) */
  refreshModule(key) {
    window.setTimeout(() => {
      const mod = key && key !== 'general' ? this[key] : null;
      if (mod) {
        if (mod.refreshViews) mod.refreshViews();
        else if (mod.requestRefresh) mod.requestRefresh();
      }
      this.refreshHub();
    }, 150);
  },

  /** Appended to every tracker dashboard */
  renderExtras(key, el) {
    if (!el || !el.createDiv) return;
    const wrap = el.createDiv({ cls: 'hd-extras' });
    if (MISSED_KEYS.includes(key)) this.renderMissed(wrap, key);
    this.renderNotes(wrap, key);
  },
  renderMissed(parent, key) {
    const [one, many] = MISSED_WORD[key];
    const recs = this.getMissed(key);
    const total = recs.reduce((s, r) => s + r.count, 0);
    const card = xCard(parent, 'calendar-search', K_cap(many) + ' without an exact date',
      recs.length ? KK.plural(total, one) + ' you logged later. Not counted in statistics, charts or the calendar.' : 'Missed one? Log it here with the month or a rough time. It won’t affect your statistics.',
      'Add missed ' + one, () => new MissedModal(this, key).open(), 'hd-x-missed');
    if (!recs.length) return;
    const list = card.createDiv({ cls: 'hd-x-list' });
    for (const r of recs) {
      const row = list.createDiv({ cls: 'hd-x-row' });
      const main = row.createDiv({ cls: 'hd-x-main' });
      const top = main.createDiv({ cls: 'hd-x-when' });
      top.createSpan({ text: whenLabel(r) });
      top.createSpan({ cls: 'hd-x-count', text: KK.plural(r.count, one, many) });
      const d = missedDetails(r);
      if (d) main.createDiv({ cls: 'hd-x-text', text: d });
      const ed = row.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit' } });
      setIcon(ed, 'pencil');
      ed.onclick = () => new MissedModal(this, key, r).open();
    }
  },
  renderNotes(parent, key, opts = {}) {
    const notes = this.getNotes(key);
    const label = NOTE_LABELS[key];
    const card = xCard(parent, 'notebook-pen', key === 'general' ? 'Notes' : label + ' notes',
      notes.length ? KK.plural(notes.length, 'note') : (key === 'general' ? 'General notes about your health, outside any one tracker.' : 'Notes about your ' + label.toLowerCase() + ' that aren’t part of a log entry.'),
      'Add note', () => new NoteModal(this, key).open(), 'hd-x-notes' + (opts.cls ? ' ' + opts.cls : ''), opts.key);
    if (!notes.length) return card;
    this._notesOpen = this._notesOpen || new Set();
    const showAll = this._notesOpen.has(key);
    const list = card.createDiv({ cls: 'hd-x-list' });
    for (const n of showAll ? notes : notes.slice(0, opts.limit || 4)) {
      const row = list.createDiv({ cls: 'hd-x-row' });
      const main = row.createDiv({ cls: 'hd-x-main' });
      const top = main.createDiv({ cls: 'hd-x-when' });
      top.createSpan({ text: n.date ? KK.fmtKey(n.date) : 'No date' });
      if (n.title) top.createSpan({ cls: 'hd-x-title', text: n.title });
      main.createDiv({ cls: 'hd-x-text hd-x-clamp', text: n.text });
      const ed = row.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit note' } });
      setIcon(ed, 'pencil');
      ed.onclick = () => new NoteModal(this, key, n).open();
    }
    if (notes.length > (opts.limit || 4)) {
      const more = card.createEl('button', { cls: 'hd-x-more', text: showAll ? 'Show fewer' : 'Show all ' + notes.length + ' notes' });
      more.onclick = () => { if (showAll) this._notesOpen.delete(key); else this._notesOpen.add(key); this.refreshModule(key); };
    }
    return card;
  },

  /** Report sections for a tracker: records without an exact date, and general notes */
  reportExtras(key, o) {
    const out = [];
    if (o.includeMissed && MISSED_KEYS.includes(key)) {
      const [one, many] = MISSED_WORD[key];
      const recs = this.getMissed(key).filter((r) => missedInRange(r, o.from, o.to)).reverse();
      if (recs.length) {
        out.push({
          title: K_cap(many) + ' without an exact date',
          intro: KK.plural(recs.reduce((s, r) => s + r.count, 0), one) + ' logged later without an exact date. They are not included in any figures, charts or tables above.',
          cols: [{ label: 'When', w: 0.3 }, { label: 'How many', w: 0.14 }, { label: 'Details', w: 0.56 }],
          rows: recs.map((r) => [whenLabel(r), String(r.count), missedDetails(r) || '–']),
        });
      }
    }
    if (o.includeNotes) {
      const notes = this.getNotes(key).filter((n) => !n.date || ((!o.from || n.date >= o.from) && (!o.to || n.date <= o.to))).reverse();
      if (notes.length) {
        out.push({
          title: key === 'general' ? 'General notes' : 'Notes',
          cols: [{ label: 'Date', w: 0.17 }, { label: 'Note', w: 0.83 }],
          rows: notes.map((n) => [n.date ? KK.fmtKey(n.date) : '–', (n.title ? n.title + ': ' : '') + n.text]),
        });
      }
    }
    return out;
  },

  openVisitsReport() {
    const vis = this.visits;
    new KK.ReportOptionsModal(vis, {
      title: 'Doctor visits report', defaultRange: '365',
      toggles: [['includeLog', 'Include what was discussed at each visit', true]],
      build: async (o) => {
        const bytes = buildVisitsReport(this, o);
        const folder = obsidian.normalizePath((vis.settings.folder || 'Doctor Visits') + '/Reports');
        await this.ensureFolderPath(folder);
        const path = obsidian.normalizePath(folder + '/Doctor visits report ' + (o.from || 'all') + ' to ' + o.to + '.pdf');
        const file = await writeBinary(this.app, path, bytes);
        new Notice('Report saved to ' + path);
        return file;
      },
    }).open();
  },
  openHealthReport() { new HealthReportModal(this).open(); },
};
const K_cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
async function writeBinary(app, path, bytes) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof obsidian.TFile) { await app.vault.modifyBinary(existing, buf); return existing; }
  return app.vault.createBinary(path, buf);
}

/* ---------------- Doctor visits report ---------------- */
function buildVisitsReport(host, o) {
  const vis = host.visits;
  const all = vis.getVisits().sort(V.sortAsc);
  const today = V.todayKey();
  const to = o.to || today;
  const from = o.from || (all.length ? all[0].date : to);
  const past = all.filter((v) => !V.isUpcoming(v, today) && v.date >= from && v.date <= to);
  const upcoming = all.filter((v) => V.isUpcoming(v, today));
  const due = V.followUpsDue(all, today);
  const range = KK.fmtKey(from) + ' – ' + KK.fmtKey(to);
  const R = new KK.Report('Doctor visits report', range, '#1f8a8a');
  R.cover([o.name ? 'Name: ' + o.name : '', 'Period: ' + range, 'Created ' + KK.fmtKey(today)]);
  R.heading('Summary');
  R.stats([
    ['Visits in period', String(past.length), KK.plural(new Set(past.map((v) => v.doctor || v.clinic)).size, 'doctor or clinic', 'doctors or clinics')],
    ['Next visit', upcoming[0] ? KK.fmtKey(upcoming[0].date) : 'None booked', upcoming[0] ? V.who(upcoming[0]) : ''],
    ['Follow-ups to book', String(due.length), due.filter((v) => v.followUp < today).length ? due.filter((v) => v.followUp < today).length + ' overdue' : ''],
  ]);
  if (upcoming.length) {
    R.heading('Upcoming visits');
    R.table([{ label: 'Date', w: 0.16 }, { label: 'With', w: 0.28, wrap: true }, { label: 'Reason', w: 0.18, wrap: true }, { label: 'Questions to ask', w: 0.38, wrap: true }],
      upcoming.map((v) => [KK.fmtKey(v.date) + (v.time ? ' ' + v.time : ''), [v.doctor, v.clinic].filter(Boolean).join(', '), v.reason || '–', v.questions || '–']));
  }
  if (due.length) {
    R.heading('Follow-ups to book');
    R.table([{ label: 'Follow up by', w: 0.2 }, { label: 'With', w: 0.4, wrap: true }, { label: 'From the visit on', w: 0.4 }],
      due.map((v) => [KK.fmtKey(v.followUp), [v.doctor, v.clinic].filter(Boolean).join(', '), KK.fmtKey(v.date) + (v.reason ? ' · ' + v.reason : '')]),
      { cellColor: (ri, ci) => (ci === 0 && due[ri].followUp < today ? KK.RC.warn : null), boldColored: true });
  }
  R.heading('Visit history', past.length ? 'Oldest first.' : '');
  if (!past.length) R.para('No visits in this period.', { color: KK.RC.muted });
  else if (o.includeLog !== false) {
    R.table([{ label: 'Date', w: 0.14 }, { label: 'With', w: 0.2, wrap: true }, { label: 'Reason', w: 0.14, wrap: true }, { label: 'Discussed, results and next steps', w: 0.52, wrap: true }],
      past.map((v) => [KK.fmtKey(v.date), [v.doctor, v.clinic, v.specialty].filter(Boolean).join(', '), v.reason || '–',
        [v.discussed, v.outcome ? 'Result: ' + v.outcome : '', v.nextSteps ? 'Next: ' + v.nextSteps : '', v.tests.length ? 'Tests: ' + v.tests.join(', ') : '', v.medChanges.length ? 'Medication: ' + v.medChanges.join('; ') : '', v.followUp ? 'Follow up by ' + KK.fmtKey(v.followUp) : ''].filter(Boolean).join('. ') || '–']), { size: 8 });
  } else R.table([{ label: 'Date', w: 0.2 }, { label: 'With', w: 0.5, wrap: true }, { label: 'Reason', w: 0.3, wrap: true }], past.map((v) => [KK.fmtKey(v.date), [v.doctor, v.clinic].filter(Boolean).join(', '), v.reason || '–']));
  // care team
  const team = new Map();
  for (const v of all) { const k = v.doctor || v.clinic; const t = team.get(k) || { name: v.doctor, clinic: v.clinic, specialty: v.specialty, n: 0, last: '' }; if (!V.isUpcoming(v, today)) { t.n++; if (v.date > t.last) t.last = v.date; } if (v.specialty) t.specialty = v.specialty; team.set(k, t); }
  if (team.size) {
    R.heading('Care team');
    R.table([{ label: 'Doctor', w: 0.28, wrap: true }, { label: 'Clinic', w: 0.28, wrap: true }, { label: 'Specialty', w: 0.2, wrap: true }, { label: 'Visits', w: 0.08, align: 'right' }, { label: 'Last', w: 0.16 }],
      [...team.values()].map((t) => [t.name || '–', t.clinic || '–', t.specialty || '–', String(t.n), t.last ? KK.fmtKey(t.last) : '–']));
  }
  if (o.notes) { R.heading('Questions and notes'); R.para(o.notes); }
  R.extraSections(host.reportExtras('visits', { from, to, includeNotes: o.includeGenNotes !== false, includeMissed: false }));
  R.footerAll('Doctor visits report · self-reported');
  return R.output();
}

/* ---------------- Overview (health summary) report ---------------- */
function summaryItems(host, key) {
  const tk = KK.todayKey();
  if (key === 'period' && host.period) {
    const a = host.period.getAnalysis();
    if (!a.last) return [['Period', 'No periods logged', '']];
    const next = a.ongoing ? a.futureStarts[0] : a.nextStart;
    return [
      ['Last period started', P.fmtDate(a.last.start), a.ongoing ? 'ongoing, day ' + (a.today - a.last.start + 1) : ''],
      ['Average cycle', a.avgCycle ? KK.round(a.avgCycle, 1) + ' days' : '–', a.recent.length ? 'last ' + KK.plural(a.recent.length, 'cycle') : ''],
      ['Next period (predicted)', host.period.settings.showPredictions && next ? P.fmtDate(next) : '–', ''],
    ];
  }
  if (key === 'migraine' && host.migraine) {
    const eps = host.migraine.getEpisodes();
    if (!eps.length) return [['Migraine', 'No migraines logged', '']];
    const s30 = M.computeStats(eps, '30', new Date(), host.migraine.settings), s90 = M.computeStats(eps, '90', new Date(), host.migraine.settings);
    return [
      ['Migraine days · 30 days', String(s30.migraineDays), KK.plural(s30.count, 'episode')],
      ['Episodes · 90 days', String(s90.count), s90.avgPainMax != null ? 'average peak pain ' + KK.round(s90.avgPainMax, 1) + '/' + M.getPainMax() : ''],
      ['Acute-medication days · 30 days', String(s30.medDays30), s30.overuse ? 'above the overuse alert' : ''],
    ];
  }
  if (key === 'visits' && host.visits) {
    const all = host.visits.getVisits().sort(V.sortAsc);
    const next = all.find((v) => V.isUpcoming(v, tk)), last = all.filter((v) => !V.isUpcoming(v, tk)).pop();
    return [
      ['Next visit', next ? KK.fmtKey(next.date) : 'None booked', next ? V.who(next) : ''],
      ['Last visit', last ? KK.fmtKey(last.date) : '–', last ? V.who(last) : ''],
      ['Follow-ups to book', String(V.followUpsDue(all, tk).length), ''],
    ];
  }
  if (key === 'bp' && host.bp) {
    const all = host.bp.getRecords().slice().sort(B.sortAsc);
    if (!all.length) return [['Blood pressure', 'No readings', '']];
    const L = all[all.length - 1], s30 = host.bp.stats(KK.addDaysKey(tk, -29), tk);
    return [
      ['Latest reading', B.fmtBP(L) + ' mmHg', host.bp.classify(L).label + ' · ' + KK.fmtKey(L.date)],
      ['Average · 30 days', s30.avg ? B.fmtBP(s30.avg) : '–', s30.n ? KK.plural(s30.n, 'reading') : ''],
      ['Below ' + s30.target.join('/'), s30.n ? Math.round((100 * s30.atTarget) / s30.n) + '%' : '–', 'last 30 days'],
    ];
  }
  if (key === 'illness' && host.illness) {
    const st = host.illness.stats(KK.addDaysKey(tk, -364), tk);
    const on = host.illness.ongoing()[0];
    return [
      ['Right now', on ? 'Sick · day ' + I.lengthDays(on, tk) : 'Well', on ? on.type : ''],
      ['Sick days · 12 months', String(st.sickDays), KK.plural(st.count, 'time') + ' sick'],
      ['Most common', st.types.length ? st.types[0][0] : '–', ''],
    ];
  }
  if (key === 'meds' && host.meds) {
    const cur = host.meds.current();
    const due = host.meds.refillsDue();
    return [
      ['Taking now', String(cur.length), cur.filter((m) => m.schedule === 'As needed').length + ' as needed'],
      ['Refills due', String(due.length), due.length ? D.title(due[0]) + ' ' + KK.relDays(due[0].refill, tk) : ''],
    ];
  }
  if (key === 'a1c' && host.a1c) {
    const st = host.a1c.stats();
    if (!st.latest) return [['A1C', 'No results', '']];
    return [
      ['Latest A1C', st.latest.pct.toFixed(1) + '% · ' + A.toMmol(st.latest.pct) + ' mmol/mol', A.classify(st.latest.pct).label + ' · ' + KK.fmtKey(st.latest.date)],
      ['Change', st.change == null ? '–' : (st.change > 0 ? '+' : '') + st.change.toFixed(1) + ' points', st.prev ? 'since ' + KK.fmtKey(st.prev.date) : ''],
      ['Next test', st.nextDue ? KK.fmtKey(st.nextDue) : '–', ''],
    ];
  }
  return [];
}
function buildOverviewReport(host, o, contents) {
  const tk = KK.todayKey();
  const R = new KK.Report('Health summary', 'as of ' + KK.fmtKey(tk), '#7852ee');
  R.cover([o.name ? 'Name: ' + o.name : '', 'Created ' + KK.fmtKey(tk), o.rangeText ? 'Report period: ' + o.rangeText : '']);
  if (contents && contents.length) {
    R.heading('Contents');
    R.table([{ label: 'Section', w: 0.8 }, { label: 'Page', w: 0.2, align: 'right' }], contents.map((c) => [c.title, String(c.page)]));
  }
  const keys = o.order.filter((k) => host[k]);
  if (!keys.length) R.para('No trackers are turned on.', { color: KK.RC.muted });
  for (const k of keys) {
    const items = summaryItems(host, k);
    if (!items.length) continue;
    R.heading(REPORT_TITLES[k]);
    R.stats(items);
    if (k === 'meds' && host.meds && host.meds.current().length) {
      R.table([{ label: 'Medication', w: 0.32, wrap: true }, { label: 'How', w: 0.38, wrap: true }, { label: 'For', w: 0.3, wrap: true }], host.meds.currentRows().map((x) => [x.name, x.schedule, x.purpose]), { size: 8.5 });
    }
    if (MISSED_KEYS.includes(k) && o.includeMissed) {
      const n = host.getMissed(k).reduce((s, r) => s + r.count, 0);
      if (n) R.para('Plus ' + KK.plural(n, MISSED_WORD[k][0]) + ' logged without an exact date (not counted above).', { size: 8.5, color: KK.RC.muted });
    }
  }
  if (o.allergies && host.meds && host.meds.settings.allergies) R.note('Allergies and intolerances: ' + host.meds.settings.allergies, true);
  if (cycleShown(host)) writeCycleLink(R, host);
  if (o.notes) { R.heading('Questions and notes for my doctor'); R.para(o.notes); }
  R.extraSections(host.reportExtras('general', { from: o.from, to: o.to, includeNotes: o.includeGenNotes !== false, includeMissed: false }));
  R.footerAll('Health summary · self-reported data from Health Dashboard for Obsidian · not a diagnosis');
  return R.output();
}

/* The Overview's "Migraines and your cycle" chart, when it is shown on the Overview */
function cycleShown(host) {
  const s = host.settings, on = (k) => host.isActive(k) && s.overview[k] && host[k];
  return !!(s.showCycleLink && on('period') && on('migraine'));
}
function writeCycleLink(R, host) {
  const a = host.period.getAnalysis(), eps = host.migraine.getEpisodes();
  const cd = cycleLinkData(a, eps);
  const saved = R.accent;
  R.heading('Migraines and your cycle', 'When migraines started, counted from day 1 of the nearest period (day 1 = first day of bleeding). Shaded: day -2 to day +3, the window used for menstrual migraine.', 200);
  if (!cd.hasData || !cd.eligible) {
    R.para(!cd.hasData ? 'Needs logged periods and migraines.' : 'None of the migraines fall in the dates covered by the period logs yet.', { size: 9, color: KK.RC.muted });
    return;
  }
  const items = [['Started around period day 1', cd.inWin + ' of ' + cd.eligible + ' (' + cd.pct + '%)', 'about ' + cd.chance + '% expected by chance']];
  if (cd.covered.length) items.push(['Periods with a migraine nearby', cd.hit + ' of ' + cd.covered.length, 'day -2 to day +3']);
  R.stats(items, 2);
  const mig = KK.MI.hexRgb('#4a9a2e'), soft = KK.MI.hexRgb('#bcdcae');
  R.bars(cd.counts.map((c, i) => {
    const off = i - cd.R, inW = off >= WIN_LO && off <= WIN_HI;
    return { label: off === 0 ? 'Day 1' : off % 5 !== 0 ? '' : off > 0 ? 'Day ' + (off + 1) : off + 'd', value: c, color: inW ? mig : soft };
  }), { height: 130, maxLabels: 21, step: 1, xBand: { from: cd.R + WIN_LO, to: cd.R + WIN_HI, color: [0.95, 0.89, 0.91] },
    legend: [['Shaded: day -2 to day +3', [0.93, 0.84, 0.87]], ['Started in the window', mig], ['Started outside it', soft]] });
  R.accent = saved;
  const extra = cd.outside ? KK.plural(cd.outside, 'migraine') + ' started more than ' + cd.R + ' days from a period start and are not drawn. ' : '';
  if (cd.pattern) R.note(extra + 'Migraines started in this window in at least 2 of every 3 cycles. Doctors look for this pattern when considering menstrually related migraine. This is not a diagnosis.');
  else R.para(extra + 'This is a pattern view, not a diagnosis.', { size: 8.5, color: KK.RC.muted });
}

/* ---------------- Merging PDFs (all reports are simple, uncompressed PDFs) ---------------- */
function pdfToString(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s; }
function parsePdf(bytes) {
  const s = pdfToString(bytes);
  const objs = new Map();
  const re = /(\d+) 0 obj\n/g;
  let m;
  while ((m = re.exec(s))) {
    const id = Number(m[1]), start = re.lastIndex;
    const lm = /^<< \/Length (\d+) >>\nstream\n/.exec(s.slice(start, start + 40));
    if (lm) {
      const ss = start + lm[0].length, len = Number(lm[1]);
      objs.set(id, { dict: '<< /Length ' + len + ' >>', stream: s.slice(ss, ss + len) });
      re.lastIndex = s.indexOf('endobj', ss + len) + 6;
    } else {
      const end = s.indexOf('\nendobj', start);
      objs.set(id, { dict: s.slice(start, end) });
      re.lastIndex = end + 7;
    }
  }
  const trailer = s.slice(s.lastIndexOf('trailer'));
  const root = Number(/\/Root (\d+) 0 R/.exec(trailer)[1]);
  const pagesId = Number(/\/Pages (\d+) 0 R/.exec(objs.get(root).dict)[1]);
  const kids = [...objs.get(pagesId).dict.matchAll(/(\d+) 0 R/g)].map((x) => Number(x[1]));
  return { objs, kids };
}
const pdfStr = (t) => '(' + String(t).replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, (c) => '\\' + c) + ')';
/** parts: [{ title, bytes }] → one PDF with a bookmark for each part */
function mergePdfs(parts, title) {
  const out = [null, null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const add = (o) => { out.push(o); return out.length; };
  const allKids = [], firstPage = [];
  for (const part of parts) {
    const { objs, kids } = parsePdf(part.bytes);
    const map = new Map();
    for (const [id, o] of objs) {
      if (/\/BaseFont \/Helvetica-Bold/.test(o.dict)) map.set(id, 4);
      else if (/\/BaseFont \/Helvetica\b/.test(o.dict)) map.set(id, 3);
    }
    // contents first, then pages
    for (const kid of kids) {
      const pd = objs.get(kid).dict;
      const cid = Number(/\/Contents (\d+) 0 R/.exec(pd)[1]);
      if (!map.has(cid)) { const c = objs.get(cid); map.set(cid, add(c.dict + '\nstream\n' + c.stream + '\nendstream')); }
    }
    kids.forEach((kid, i) => {
      const pd = objs.get(kid).dict.replace(/\/Parent \d+ 0 R/, '/Parent 2 0 R').replace(/(\d+) 0 R/g, (x, n) => (map.has(Number(n)) ? map.get(Number(n)) + ' 0 R' : x));
      const pid = add(pd);
      allKids.push(pid);
      if (i === 0) firstPage.push(pid);
    });
  }
  out[1] = '<< /Type /Pages /Kids [' + allKids.map((k) => k + ' 0 R').join(' ') + '] /Count ' + allKids.length + ' >>';
  // bookmarks
  const outlineRoot = add(null);
  const itemIds = parts.map(() => add(null));
  parts.forEach((p, i) => {
    out[itemIds[i] - 1] = '<< /Title ' + pdfStr(p.title) + ' /Parent ' + outlineRoot + ' 0 R' + (i ? ' /Prev ' + itemIds[i - 1] + ' 0 R' : '') + (i < parts.length - 1 ? ' /Next ' + itemIds[i + 1] + ' 0 R' : '') + ' /Dest [' + firstPage[i] + ' 0 R /Fit] >>';
  });
  out[outlineRoot - 1] = '<< /Type /Outlines /First ' + itemIds[0] + ' 0 R /Last ' + itemIds[itemIds.length - 1] + ' 0 R /Count ' + parts.length + ' >>';
  out[0] = '<< /Type /Catalog /Pages 2 0 R /Outlines ' + outlineRoot + ' 0 R /PageMode /UseOutlines >>';
  const info = add('<< /Title ' + pdfStr(title) + ' /Producer (Health Dashboard for Obsidian) >>');
  let s = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  out.forEach((o, i) => { offsets.push(s.length); s += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = s.length;
  s += 'xref\n0 ' + (out.length + 1) + '\n0000000000 65535 f \n';
  for (const off of offsets) s += String(off).padStart(10, '0') + ' 00000 n \n';
  s += 'trailer\n<< /Size ' + (out.length + 1) + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return { bytes, pageCount: allKids.length };
}
const pageCountOf = (bytes) => (pdfToString(bytes).match(/\/Type \/Page /g) || []).length;

/* ---------------- One report from all dashboards ---------------- */
function buildPart(host, key, o) {
  const name = o.name, today = KK.todayKey();
  const to = o.to || today;
  if (key === 'period') {
    const a = host.period.getAnalysis();
    const toD = P.toDayNum(to);
    const fromD = o.from ? P.toDayNum(o.from) : (a.entries[0] ? a.entries[0].day : toD);
    return buildPeriodReport(host.period, { from: fromD, to: toD, name, includeLog: o.includeLog, includeNotes: o.includeLog, includeGenNotes: o.includeGenNotes, includeMissed: o.includeMissed });
  }
  if (key === 'migraine') {
    const eps = host.migraine.getEpisodes();
    const [ty, tm, td] = to.split('-').map(Number);
    let from;
    if (o.from) { const [y, m, d] = o.from.split('-').map(Number); from = new Date(y, m - 1, d); }
    else from = eps.length ? eps.reduce((mn, e) => (e.start < mn ? e.start : mn), eps[0].start) : new Date(ty, tm - 1, td);
    return buildMigraineReport(host.migraine, { from, to: new Date(ty, tm - 1, td), name, includeLog: o.includeLog, questions: '', includeGenNotes: o.includeGenNotes, includeMissed: o.includeMissed });
  }
  const common = { from: o.from, to, name, notes: '', includeLog: o.includeLog, includeMeds: true, includeGenNotes: o.includeGenNotes, includePast: true, includeSide: true };
  if (key === 'visits') return buildVisitsReport(host, common);
  if (key === 'bp') return B.buildReport(host.bp, common);
  if (key === 'illness') return I.buildReport(host.illness, common);
  if (key === 'meds') return D.buildList(host.meds, common);
  if (key === 'a1c') return A.buildReport(host.a1c, common);
  return null;
}

class HealthReportModal extends KK.FormModal {
  constructor(host) { super(host); this.host = host; }
  onOpen() {
    const h = this.host, s = h.settings;
    this.begin('Health report for your doctor');
    this.contentEl.createDiv({ cls: 'mt-help hd-x-help', text: 'One PDF with a health summary first, then a report from each tracker you choose, in your order. The PDF has bookmarks so your doctor can jump to each part.' });
    const sec = this.section('Report', 'file-text');
    const r1 = this.row(sec);
    this.nameIn = this.field(r1, 'Name on report', 'text', s.userName || '', { placeholder: 'Set your name in Health Dashboard settings' });
    const ranges = [['90', 'Last 3 months'], ['180', 'Last 6 months'], ['365', 'Last 12 months'], ['all', 'All data'], ['custom', 'Custom dates']];
    this.range = this.chips(sec, 'Period', ranges.map((r) => r[1]), 'Last 6 months', true, { allowCustom: false, onChange: () => tog() });
    const cr = this.row(sec);
    this.fromIn = this.field(cr, 'From', 'date', KK.addDaysKey(KK.todayKey(), -179));
    this.toIn = this.field(cr, 'To', 'date', KK.todayKey());
    const tog = () => cr.toggleClass('hk-hidden', this.range.value() !== 'Custom dates');
    tog();

    const parts = this.section('Sections', 'list-ordered');
    parts.createDiv({ cls: 'mt-help', text: 'Drag to change the order. Untick a tracker to leave it out.' });
    const list = parts.createDiv({ cls: 'hd-rep-list' });
    const fixed = list.createDiv({ cls: 'hd-rep-item is-fixed' });
    setIcon(fixed.createSpan({ cls: 'hd-rep-icon' }), 'layout-dashboard');
    fixed.createSpan({ cls: 'hd-rep-name', text: 'Health summary (Overview)' });
    fixed.createSpan({ cls: 'hd-rep-hint', text: 'always first' });
    this.checks = {};
    const order = (s.reportOrder || s.tabOrder).filter((k) => h.isActive(k) && h[k]);
    for (const k of order) {
      const it = list.createDiv({ cls: 'hd-rep-item hd-rep-sortable', attr: { 'data-key': k } });
      setIcon(it.createSpan({ cls: 'hd-grip', attr: { 'aria-hidden': 'true' } }), 'grip-vertical');
      const lab = it.createEl('label', { cls: 'hd-rep-check' });
      const cb = lab.createEl('input', { type: 'checkbox' });
      cb.checked = !(s.reportSkip || []).includes(k);
      lab.appendText(' ' + REPORT_TITLES[k]);
      this.checks[k] = cb;
    }
    this.list = list;
    makeSortable(list, { itemClass: 'hd-rep-sortable', allowControls: false, onSort: (keys) => { this.order = keys; } });
    this.order = order;

    const opt = this.section('Include', 'check-square');
    const tg = (label, def) => { const l = opt.createEl('label', { cls: 'hk-check hd-rep-opt' }); const c = l.createEl('input', { type: 'checkbox' }); c.checked = def; l.appendText(' ' + label); return c; };
    this.cLog = tg('Detailed logs (every period day, episode, reading and visit)', true);
    this.cMissed = tg('Periods and migraines without an exact date', true);
    this.cNotes = tg('General notes', true);
    this.notesIn = this.area(opt, 'Questions or notes for your doctor (optional)', '', 'Printed in the health summary.', 3);
    this.footer({ saveText: 'Create PDF', onSave: () => this.go(ranges) });
  }
  currentOrder() {
    const keys = this.list.querySelectorAll ? Array.from(this.list.children).filter((c) => c.getAttribute && c.getAttribute('data-key')).map((c) => c.getAttribute('data-key')) : this.order;
    return keys.length ? keys : this.order;
  }
  async go(ranges) {
    const h = this.host, s = h.settings;
    const label = this.range.value();
    const code = (ranges.find((r) => r[1] === label) || ranges[1])[0];
    const today = KK.todayKey();
    let from = '', to = today;
    if (code === 'custom') { from = KK.normDate(this.fromIn.value); to = KK.normDate(this.toIn.value); if (!from || !to || from > to) { new Notice('Choose a valid date range.'); return; } }
    else if (code !== 'all') from = KK.addDaysKey(today, -(Number(code) - 1));
    const order = this.currentOrder();
    const chosen = order.filter((k) => this.checks[k] && this.checks[k].checked);
    // remember the order and choices
    s.reportOrder = order.concat((s.reportOrder || s.tabOrder).filter((k) => !order.includes(k)));
    s.reportSkip = order.filter((k) => !chosen.includes(k));
    await h.saveHub();
    const o = { from, to, name: this.nameIn.value.trim(), includeLog: this.cLog.checked, includeMissed: this.cMissed.checked, includeGenNotes: this.cNotes.checked, notes: this.notesIn.value.trim(), order: chosen, allergies: true,
      rangeText: (from ? KK.fmtKey(from) : 'all data') + ' – ' + KK.fmtKey(to) };
    try {
      const file = await h.createHealthReport(o);
      this.close();
      if (file) await this.app.workspace.getLeaf('tab').openFile(file);
    } catch (e) {
      console.error('Health report failed', e);
      new Notice('The report could not be created: ' + e.message);
    }
  }
}

Object.assign(ExtrasMethods, {
  /** Build every chosen report, then one PDF: summary first, trackers in the chosen order */
  buildHealthReport(o) {
    const parts = [];
    APPENDIX.combined = true; // one appendix for the whole report, at the end
    try {
      for (const k of o.order) {
        if (!this[k]) continue;
        const bytes = buildPart(this, k, o);
        if (bytes) parts.push({ key: k, title: REPORT_TITLES[k], bytes, pages: pageCountOf(bytes) });
      }
      const ap = buildAppendixPdf(this, (cycleShown(this) ? ['overview'] : []).concat(o.order.filter((k) => this[k])), o);
      parts.push({ key: 'appendix', title: 'Appendix', bytes: ap, pages: pageCountOf(ap) });
    } finally { APPENDIX.combined = false; }
    // the summary lists the page each section starts on, so build it twice: once to count its pages
    const contents = (summaryPages) => { let page = summaryPages + 1; return parts.map((p) => { const c = { title: p.title, page }; page += p.pages; return c; }); };
    APPENDIX.combined = true;
    let summary, sp;
    try {
      summary = buildOverviewReport(this, o, contents(1));
      sp = pageCountOf(summary);
      if (sp !== 1) summary = buildOverviewReport(this, o, contents(sp));
    } finally { APPENDIX.combined = false; }
    const all = [{ title: 'Health summary', bytes: summary }].concat(parts);
    return mergePdfs(all, 'Health report ' + KK.todayKey());
  },
  async createHealthReport(o) {
    const { bytes, pageCount } = this.buildHealthReport(o);
    const folder = obsidian.normalizePath(this.notesFolder() + '/Reports');
    await this.ensureFolderPath(folder);
    const path = obsidian.normalizePath(folder + '/Health report ' + KK.todayKey() + '.pdf');
    const file = await writeBinary(this.app, path, bytes);
    new Notice('Health report saved to ' + path + ' (' + KK.plural(pageCount, 'page') + ').');
    return file;
  },
});
Object.assign(HealthDashboardPlugin.prototype, ExtrasMethods);

/* Show notes (and records without an exact date) at the end of every tracker dashboard */
function addExtrasAfterRender(Cls, rootOf) {
  if (!Cls || Cls.prototype.__hdExtras) return;
  const orig = Cls.prototype.render;
  Cls.prototype.render = function (...args) {
    const r = orig.apply(this, args);
    const after = () => {
      try { const p = this.plugin; const root = rootOf(this); if (p && p.renderExtras && root) p.renderExtras(root); if (root) { normalizeHeader(root); addExpanders(root, p && p.app); } }
      catch (e) { console.error('Health Dashboard: notes section failed', e); }
    };
    if (r && typeof r.then === 'function') return r.then((v) => { after(); return v; });
    after();
    return r;
  };
  Cls.prototype.__hdExtras = true;
}
addExtrasAfterRender(P.DashboardRenderer, (t) => t.el);
addExtrasAfterRender(M.DashboardView, (t) => t.rootEl || (t.containerEl && t.containerEl.children[1]));
addExtrasAfterRender(V.VisitsRenderer, (t) => t.el);
addExtrasAfterRender(B.BPRenderer, (t) => t.el);
addExtrasAfterRender(I.IllnessRenderer, (t) => t.el);
addExtrasAfterRender(D.MedsRenderer, (t) => t.el);
addExtrasAfterRender(A.A1CRenderer, (t) => t.el);

module.exports._extras = { parseNote, parseMissed, whenLabel, missedInRange, mergePdfs, parsePdf, pageCountOf, buildVisitsReport, buildOverviewReport, NoteModal, MissedModal, HealthReportModal };
