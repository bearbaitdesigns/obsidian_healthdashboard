'use strict';

/*
 * Migraine Tracker — an Obsidian plugin
 * Each episode is stored as a Markdown note with YAML frontmatter, so your
 * data stays in your vault as plain text and works with Properties, search,
 * Dataview, Bases, etc.
 */

const obsidian = require('obsidian');
const {
  Plugin, ItemView, Modal, Notice, PluginSettingTab, Setting, TFile, Menu,
  normalizePath, stringifyYaml, setIcon,
} = obsidian;

const VIEW_TYPE = 'migraine-tracker-dashboard';
const ENTRY_MARKER = 'migraine';

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const TIME_OF_DAY = [
  { value: 'Morning', hint: '5 am – 12 pm' },
  { value: 'Afternoon', hint: '12 – 5 pm' },
  { value: 'Evening', hint: '5 – 9 pm' },
  { value: 'Night', hint: '9 pm – 5 am' },
  { value: 'Woke up with it', hint: '' },
];

/** Top of the pain scale (5 by default; 10 optional in settings). */
let PAIN_MAX = 5;
function painLabel(v) {
  if (!v) return 'None';
  const r = v / PAIN_MAX;
  return r <= 0.4 ? 'Mild' : r <= 0.6 ? 'Moderate' : 'Severe';
}

/** Options for when an attack ended (same layout as the start, with an end-specific last option). */
const TIME_OF_DAY_END = [
  ...TIME_OF_DAY.slice(0, 4),
  { value: 'Gone after sleep', hint: '' },
];

const MED_EFFECTS = ['Not sure', 'No relief', 'Some relief', 'Full relief'];

const DEFAULT_SETTINGS = {
  folder: 'Migraine Log',
  weekStart: 'sunday',
  defaultRange: '90',
  overuseThreshold: 10,
  painScale: 5,
  reportName: '',
  showStatusBar: true,
  types: [
    'Migraine without aura', 'Migraine with aura', 'Menstrual migraine',
    'Vestibular migraine', 'Chronic migraine', 'Hemiplegic migraine',
    'Tension-type headache', 'Cluster headache', 'Other',
  ],
  attackLocations: [
    'Home', 'Work', 'School', 'Outdoors', 'Car / commute', 'Store / errands',
    'Restaurant', 'Gym', 'Traveling', 'Other',
  ],
  symptoms: [
    'Nausea', 'Vomiting', 'Light sensitivity', 'Sound sensitivity',
    'Smell sensitivity', 'Visual aura', 'Blurred vision', 'Dizziness / vertigo',
    'Numbness / tingling', 'Throbbing pain', 'Neck stiffness', 'Brain fog',
    'Fatigue', 'Difficulty speaking', 'Irritability', 'Yawning', 'Food cravings',
  ],
  triggers: [
    'Stress', 'Poor sleep', 'Too much sleep', 'Skipped meal', 'Dehydration',
    'Caffeine', 'Caffeine withdrawal', 'Alcohol', 'Weather change',
    'Bright lights', 'Loud noise', 'Strong smells', 'Screen time',
    'Hormonal / menstrual', 'Physical exertion', 'Travel',
    'Let-down after stress', 'Chocolate', 'Aged cheese', 'Processed meats',
  ],
  reliefs: [
    'Rest', 'Sleep', 'Dark room', 'Quiet room', 'Cold compress', 'Heat pack',
    'Hydration', 'Caffeine', 'Food', 'Massage', 'Shower / bath', 'Fresh air',
    'Meditation / breathing', 'Acupressure',
  ],
  medications: [
    'Ibuprofen', 'Acetaminophen', 'Naproxen', 'Aspirin', 'Excedrin',
    'Sumatriptan', 'Rizatriptan', 'Zolmitriptan', 'Eletriptan',
    'Ubrogepant', 'Rimegepant', 'Ondansetron', 'Metoclopramide',
  ],
  headLocations: [
    'Left side', 'Right side', 'Both sides', 'Forehead', 'Left temple',
    'Right temple', 'Behind left eye', 'Behind right eye', 'Top of head',
    'Back of head', 'Neck', 'Jaw / face', 'Whole head',
  ],
};

const LIST_SETTINGS = [
  ['types', 'Migraine types'],
  ['attackLocations', 'Where attacks happen'],
  ['symptoms', 'Symptoms'],
  ['triggers', 'Possible causes / triggers'],
  ['reliefs', 'Relief methods'],
  ['medications', 'Medications'],
  ['headLocations', 'Headache locations'],
];

/* ------------------------------------------------------------------ */
/* Date helpers (native Date, local time)                              */
/* ------------------------------------------------------------------ */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;

const pad = (n) => String(n).padStart(2, '0');

function parseDT(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  const m = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  return isNaN(d) ? null : d;
}
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
const fmtDate = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const toDateValue = (d) => dayKey(d);
const fmtShort = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
/** Calendar days from a to b, inclusive of both (dates only). */
const spanDays = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS) + 1;
function fmtDays(n) {
  if (n == null) return '—';
  if (Number.isInteger(n)) return `${n} day${n === 1 ? '' : 's'}`;
  return `${n.toFixed(1)} days`;
}
function deriveTimeOfDay(d) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Night';
}

/* ------------------------------------------------------------------ */
/* Episode model                                                       */
/* ------------------------------------------------------------------ */

function asArray(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== '').map((x) => String(x).trim()).filter(Boolean);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}
function asPain(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(PAIN_MAX, Math.round(n))) : null;
}

function medToString(m) {
  return [m.name, m.dose || '', m.date || '', m.time || '', m.effect || ''].map((s) => String(s).replace(/\|/g, '/').trim()).join(' | ');
}
function parseMed(s) {
  if (s && typeof s === 'object') {
    return { name: String(s.name || ''), dose: String(s.dose || ''), date: String(s.date || ''), time: String(s.time || ''), effect: String(s.effect || '') };
  }
  const parts = String(s).split('|').map((p) => p.trim());
  if (parts.length >= 5) return { name: parts[0], dose: parts[1], date: parts[2], time: parts[3], effect: parts[4] };
  return { name: parts[0] || '', dose: parts[1] || '', date: '', time: parts[2] || '', effect: parts[3] || '' };
}
/** Day a medication was taken (falls back to the episode's start date). */
function medDayKey(m, ep) {
  const d = parseDT(m.date);
  return d ? dayKey(d) : dayKey(ep.start);
}

function parseEpisode(file, fm) {
  if (!fm || String(fm.entry || '').toLowerCase() !== ENTRY_MARKER) return null;
  const rawStart = parseDT(fm.start);
  if (!rawStart) return null;
  const start = startOfDay(rawStart);
  const rawEnd = parseDT(fm.end);
  let end = rawEnd ? startOfDay(rawEnd) : null;
  if (end && end < start) end = null;
  return {
    file,
    path: file ? file.path : '',
    start,
    end,
    type: fm.type ? String(fm.type) : '',
    attackLocation: fm.attack_location ? String(fm.attack_location) : '',
    timeOfDay: fm.time_of_day ? String(fm.time_of_day) : (rawStart.getHours() || rawStart.getMinutes() ? deriveTimeOfDay(rawStart) : ''),
    timeOfDayEnd: fm.time_of_day_end ? String(fm.time_of_day_end) : (rawEnd && (rawEnd.getHours() || rawEnd.getMinutes()) ? deriveTimeOfDay(rawEnd) : ''),
    painMax: asPain(fm.pain_max),
    painAvg: asPain(fm.pain_avg),
    symptoms: asArray(fm.symptoms),
    triggers: asArray(fm.triggers),
    relief: asArray(fm.relief),
    medications: asArray(fm.medications).map(parseMed).filter((m) => m.name),
    headLocation: asArray(fm.head_location),
    notes: fm.notes ? String(fm.notes) : '',
  };
}

function episodeToFrontmatter(ep) {
  return {
    entry: ENTRY_MARKER,
    start: toDateValue(ep.start),
    end: ep.end ? toDateValue(ep.end) : '',
    type: ep.type || '',
    attack_location: ep.attackLocation || '',
    time_of_day: ep.timeOfDay || '',
    time_of_day_end: ep.end ? ep.timeOfDayEnd || '' : '',
    pain_max: ep.painMax ?? 0,
    pain_avg: ep.painAvg ?? 0,
    symptoms: ep.symptoms,
    triggers: ep.triggers,
    relief: ep.relief,
    medications: ep.medications.map(medToString),
    head_location: ep.headLocation,
    notes: ep.notes || '',
    tags: ['migraine'],
  };
}

const effectiveEnd = (ep, now) => ep.end || now;
const durationDays = (ep) => (ep.end ? spanDays(ep.start, ep.end) : null);

/** Calendar days an episode touches (capped at 31 to guard against runaway open episodes). */
function episodeDayKeys(ep, now) {
  const keys = [];
  let d = startOfDay(ep.start);
  const last = startOfDay(effectiveEnd(ep, now));
  for (let i = 0; d <= last && i < 31; i++, d = addDays(d, 1)) keys.push(dayKey(d));
  return keys;
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

function tally(lists) {
  const map = new Map();
  for (const list of lists) for (const v of new Set(list)) map.set(v, (map.get(v) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function rangeStartFor(range, now, episodes) {
  if (range === 'all') {
    if (!episodes.length) return startOfDay(now);
    return startOfDay(episodes.reduce((min, e) => (e.start < min ? e.start : min), episodes[0].start));
  }
  return startOfDay(addDays(now, -(Number(range) - 1)));
}

function computeStats(allEpisodes, range, now, settings, fromDate) {
  const rStart = range === 'custom' ? startOfDay(fromDate) : rangeStartFor(range, now, allEpisodes);
  const eps = allEpisodes.filter((e) => e.start >= rStart && e.start <= now).sort((a, b) => b.start - a.start);
  const spanDays = Math.max(1, Math.round((startOfDay(now) - rStart) / DAY_MS) + 1);

  const migraineDays = new Set();
  const rKey = dayKey(rStart);
  for (const e of eps) for (const k of episodeDayKeys(e, now)) if (k >= rKey) migraineDays.add(k);

  const durations = eps.map(durationDays).filter((d) => d != null);
  const painMax = eps.map((e) => e.painMax).filter((p) => p != null && p > 0);
  const painAvg = eps.map((e) => e.painAvg).filter((p) => p != null && p > 0);

  // Days since the most recent episode ended (across all data)
  const sorted = [...allEpisodes].sort((a, b) => b.start - a.start);
  const ongoing = allEpisodes.filter((e) => !e.end);
  let daysSince = null;
  if (sorted.length && !ongoing.length) {
    const lastEnd = sorted.reduce((mx, e) => (e.end > mx ? e.end : mx), sorted[0].end);
    daysSince = Math.max(0, Math.round((startOfDay(now) - startOfDay(lastEnd)) / DAY_MS));
  }

  // Acute-medication days in the last 30 days (all data, independent of range)
  const medStart = dayKey(addDays(startOfDay(now), -29));
  const medDays = new Set();
  for (const e of allEpisodes) {
    for (const m of e.medications) {
      const k = medDayKey(m, e);
      if (k >= medStart && k <= dayKey(now)) medDays.add(k);
    }
  }

  // Unique days with acute medication inside the period
  const medDaysRange = new Set(eps.flatMap((e) => e.medications.map((m) => medDayKey(m, e))));

  // Medication usage and how often it helped
  const medMap = new Map();
  for (const e of eps) {
    const seen = new Set();
    for (const m of e.medications) {
      const key = m.name;
      const rec = medMap.get(key) || { name: key, episodes: 0, rated: 0, helped: 0, days: new Set(), doses: new Map() };
      if (!seen.has(key)) { rec.episodes++; seen.add(key); }
      rec.days.add(medDayKey(m, e));
      if (m.dose) rec.doses.set(m.dose, (rec.doses.get(m.dose) || 0) + 1);
      if (m.effect && m.effect !== 'Not sure') {
        rec.rated++;
        if (m.effect === 'Some relief' || m.effect === 'Full relief') rec.helped++;
      }
      medMap.set(key, rec);
    }
  }

  // Weekday distribution (by start)
  const dow = [0, 0, 0, 0, 0, 0, 0];
  for (const e of eps) dow[e.start.getDay()]++;
  const dowOrder = settings.weekStart === 'monday' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

  // Time of day
  const todMap = new Map(TIME_OF_DAY.map((t) => [t.value, 0]));
  for (const e of eps) if (e.timeOfDay) todMap.set(e.timeOfDay, (todMap.get(e.timeOfDay) || 0) + 1);
  const todEndMap = new Map(TIME_OF_DAY_END.map((t) => [t.value, 0]));
  for (const e of eps) if (e.end && e.timeOfDayEnd) todEndMap.set(e.timeOfDayEnd, (todEndMap.get(e.timeOfDayEnd) || 0) + 1);
  const endedCount = eps.filter((e) => e.end).length;

  // Max pain histogram
  const painHist = Array.from({ length: PAIN_MAX }, () => 0);
  for (const p of painMax) painHist[p - 1]++;

  // Last 12 months (always)
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth(), label: MONTHS[d.getMonth()], episodes: 0, days: new Set() });
  }
  for (const e of allEpisodes) {
    const mo = months.find((x) => x.y === e.start.getFullYear() && x.m === e.start.getMonth());
    if (mo) mo.episodes++;
    for (const k of episodeDayKeys(e, now)) {
      const [y, m] = k.split('-').map(Number);
      const mo2 = months.find((x) => x.y === y && x.m === m - 1);
      if (mo2) mo2.days.add(k);
    }
  }

  return {
    range, rangeStart: rStart, spanDays,
    episodes: eps,
    count: eps.length,
    migraineDays: migraineDays.size,
    migraineDayPct: migraineDays.size / spanDays,
    perMonth: eps.length / (spanDays / 30.44),
    avgDuration: mean(durations),
    longest: durations.length ? Math.max(...durations) : null,
    avgPainMax: mean(painMax),
    avgPainAvg: mean(painAvg),
    daysSince,
    ongoing,
    medDays30: medDays.size,
    medDaysRange: medDaysRange.size,
    overuse: medDays.size >= settings.overuseThreshold,
    types: tally(eps.map((e) => (e.type ? [e.type] : []))),
    attackLocations: tally(eps.map((e) => (e.attackLocation ? [e.attackLocation] : []))),
    symptoms: tally(eps.map((e) => e.symptoms)),
    triggers: tally(eps.map((e) => e.triggers)),
    relief: tally(eps.map((e) => e.relief)),
    headLocation: tally(eps.map((e) => e.headLocation)),
    medications: [...medMap.values()].sort((a, b) => b.episodes - a.episodes || a.name.localeCompare(b.name)),
    timeOfDay: [...todMap.entries()],
    timeOfDayEnd: [...todEndMap.entries()],
    endedCount,
    weekday: dowOrder.map((i) => [DOW[i], dow[i]]),
    painHist,
    months: months.map((m) => ({ label: m.label, year: m.y, episodes: m.episodes, days: m.days.size })),
  };
}

function painColor(p, alpha) {
  // yellow (low) -> orange -> red (high)
  const t = Math.max(0, Math.min(1, (Math.max(1, p) - 1) / Math.max(1, PAIN_MAX - 1)));
  const hue = Math.round(52 - t * 52);
  const a = alpha != null ? alpha : 0.36 + t * 0.6;
  return `hsla(${hue}, 85%, 52%, ${a.toFixed(2)})`;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function episodesToCsv(episodes) {
  const header = ['Start date', 'End date', 'Duration (days)', 'Type', 'Where', 'Time of day started', 'Time of day ended', 'Max pain', 'Average pain',
    'Headache location', 'Symptoms', 'Possible causes', 'Relief', 'Medications', 'Notes', 'Note'];
  const rows = [...episodes].sort((a, b) => a.start - b.start).map((e) => [
    toDateValue(e.start),
    e.end ? toDateValue(e.end) : 'ongoing',
    e.end ? durationDays(e) : '',
    e.type, e.attackLocation, e.timeOfDay, e.end ? e.timeOfDayEnd : '', e.painMax ?? '', e.painAvg ?? '',
    e.headLocation.join('; '), e.symptoms.join('; '), e.triggers.join('; '), e.relief.join('; '),
    e.medications.map((m) => [m.name, m.dose, m.date && `on ${m.date}`, m.time && `at ${m.time}`, m.effect && `(${m.effect})`].filter(Boolean).join(' ')).join('; '),
    e.notes, e.path,
  ]);
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
}

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */

class ChipSelect {
  constructor(parent, { options, selected, single = false, allowCustom = true, hints = {}, onChange }) {
    this.options = [...options];
    this.selected = new Set(selected || []);
    for (const s of this.selected) if (!this.options.includes(s)) this.options.push(s);
    this.single = single;
    this.allowCustom = allowCustom;
    this.hints = hints;
    this.onChange = onChange;
    this.added = new Set();
    this.el = parent.createDiv({ cls: 'mt-chips' });
    this.render();
  }

  render() {
    this.el.empty();
    for (const opt of this.options) {
      const chip = this.el.createEl('button', { cls: 'mt-chip', attr: { type: 'button' } });
      chip.createSpan({ text: opt });
      if (this.hints[opt]) chip.createSpan({ cls: 'mt-chip-hint', text: this.hints[opt] });
      if (this.selected.has(opt)) chip.addClass('is-selected');
      chip.setAttr('aria-pressed', String(this.selected.has(opt)));
      chip.onclick = () => this.toggle(opt);
    }
    if (this.allowCustom) {
      const wrap = this.el.createDiv({ cls: 'mt-chip-add' });
      const input = wrap.createEl('input', { type: 'text', attr: { placeholder: 'Add other…' } });
      const add = () => {
        const v = input.value.trim();
        if (!v) return;
        if (!this.options.includes(v)) { this.options.push(v); this.added.add(v); }
        if (this.single) this.selected.clear();
        this.selected.add(v);
        this.render();
        this.onChange && this.onChange(this.values());
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      const btn = wrap.createEl('button', { cls: 'mt-chip-add-btn', attr: { type: 'button', 'aria-label': 'Add' } });
      setIcon(btn, 'plus');
      btn.onclick = add;
    }
  }

  toggle(opt) {
    if (this.selected.has(opt)) this.selected.delete(opt);
    else {
      if (this.single) this.selected.clear();
      this.selected.add(opt);
    }
    this.render();
    this.onChange && this.onChange(this.values());
  }

  setSingle(v) { this.selected = new Set(v ? [v] : []); if (v && !this.options.includes(v)) this.options.push(v); this.render(); }
  values() { return this.options.filter((o) => this.selected.has(o)); }
  value() { return this.values()[0] || ''; }
}

/* ------------------------------------------------------------------ */
/* Log / edit modal                                                    */
/* ------------------------------------------------------------------ */

class EpisodeModal extends Modal {
  constructor(plugin, episode, opts = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.existing = episode || null;
    const now = new Date();
    const start = opts.date || (episode ? episode.start : now);
    this.ep = episode ? { ...episode, medications: episode.medications.map((m) => ({ ...m })) } : {
      start: startOfDay(start), end: null, type: '', attackLocation: '', timeOfDay: '', timeOfDayEnd: '',
      painMax: Math.ceil(PAIN_MAX * 0.6), painAvg: Math.ceil(PAIN_MAX * 0.4), symptoms: [], triggers: [], relief: [], medications: [], headLocation: [], notes: '',
    };
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    const s = this.plugin.settings;
    modalEl.addClass('mt-modal');
    contentEl.empty();
    this.titleEl.setText(this.existing ? 'Edit migraine episode' : 'Log a migraine');

    /* When */
    const when = this.section('When', 'clock');
    const grid = when.createDiv({ cls: 'mt-grid-2' });
    const startField = this.field(grid, 'Started');
    this.startInput = startField.createEl('input', { type: 'date', cls: 'mt-input' });
    this.startInput.value = toDateValue(this.ep.start);

    const endField = this.field(grid, 'Ended');
    const endRow = endField.createDiv({ cls: 'mt-row' });
    this.endInput = endRow.createEl('input', { type: 'date', cls: 'mt-input' });
    if (this.ep.end) this.endInput.value = toDateValue(this.ep.end);
    const nowBtn = endRow.createEl('button', { text: 'Today', cls: 'mt-small-btn', attr: { type: 'button' } });
    nowBtn.onclick = () => { this.endInput.value = toDateValue(new Date()); this.updateDuration(); };
    endField.createDiv({ cls: 'mt-help', text: 'Leave empty if it’s still going.' });

    this.durationEl = when.createDiv({ cls: 'mt-duration' });
    this.startInput.addEventListener('change', () => {
      const prev = this.lastStart;
      this.lastStart = this.startInput.value;
      // Medication dates that still match the old start date follow it
      for (const r of this.medRowEls) if (!r.date.value || r.date.value === prev) r.date.value = this.startInput.value;
      this.updateDuration();
    });
    this.lastStart = this.startInput.value;
    this.endInput.addEventListener('change', () => this.updateDuration());

    this.label(when, 'Time of day it started');
    this.todChips = new ChipSelect(when, {
      options: TIME_OF_DAY.map((t) => t.value),
      hints: Object.fromEntries(TIME_OF_DAY.map((t) => [t.value, t.hint])),
      selected: this.ep.timeOfDay ? [this.ep.timeOfDay] : [],
      single: true, allowCustom: false,
    });

    this.label(when, 'Time of day it ended');
    this.todEndChips = new ChipSelect(when, {
      options: TIME_OF_DAY_END.map((t) => t.value),
      hints: Object.fromEntries(TIME_OF_DAY_END.map((t) => [t.value, t.hint])),
      selected: this.ep.timeOfDayEnd ? [this.ep.timeOfDayEnd] : [],
      single: true, allowCustom: false,
      onChange: (v) => {
        // Picking an end time on an open episode fills in today as the end date
        if (v.length && !this.endInput.value) { this.endInput.value = toDateValue(new Date()); this.updateDuration(); }
      },
    });
    this.todEndHelp = when.createDiv({ cls: 'mt-help' });

    /* Type & place */
    const kind = this.section('Type and place', 'tag');
    this.label(kind, 'Migraine type');
    this.typeChips = new ChipSelect(kind, { options: s.types, selected: this.ep.type ? [this.ep.type] : [], single: true });
    this.label(kind, 'Where were you when it started?');
    this.whereChips = new ChipSelect(kind, { options: s.attackLocations, selected: this.ep.attackLocation ? [this.ep.attackLocation] : [], single: true });

    /* Pain */
    const pain = this.section('Pain', 'activity');
    // Average can't exceed maximum: picking one nudges the other if needed
    this.maxPain = this.painSelector(pain, 'Maximum pain', this.ep.painMax ?? Math.ceil(PAIN_MAX * 0.6), (v) => {
      if (this.avgPain && this.avgPain.get() > v) this.avgPain.set(v);
    });
    this.avgPain = this.painSelector(pain, 'Average pain', this.ep.painAvg ?? Math.ceil(PAIN_MAX * 0.4), (v) => {
      if (this.maxPain.get() < v) this.maxPain.set(v);
    });
    this.label(pain, 'Where was the headache?');
    this.headChips = new ChipSelect(pain, { options: s.headLocations, selected: this.ep.headLocation });

    /* Symptoms */
    const sym = this.section('Symptoms', 'thermometer');
    this.symChips = new ChipSelect(sym, { options: s.symptoms, selected: this.ep.symptoms });

    /* Triggers */
    const trig = this.section('Possible causes', 'zap');
    this.trigChips = new ChipSelect(trig, { options: s.triggers, selected: this.ep.triggers });

    /* Relief */
    const rel = this.section('Relief tried', 'heart-handshake');
    this.reliefChips = new ChipSelect(rel, { options: s.reliefs, selected: this.ep.relief });

    /* Medications */
    const meds = this.section('Medications taken', 'pill');
    this.medListId = `mt-meds-${Date.now()}`;
    const dl = meds.createEl('datalist', { attr: { id: this.medListId } });
    for (const m of s.medications) dl.createEl('option', { attr: { value: m } });
    this.medRows = meds.createDiv({ cls: 'mt-med-rows' });
    this.medRowEls = [];
    for (const m of this.ep.medications) this.addMedRow(m);
    const addMed = meds.createEl('button', { cls: 'mt-add-med', attr: { type: 'button' } });
    setIcon(addMed.createSpan(), 'plus');
    addMed.createSpan({ text: 'Add medication' });
    addMed.onclick = () => this.addMedRow({ name: '', dose: '', date: this.startInput.value || toDateValue(new Date()), time: '', effect: 'Not sure' }, true);

    /* Notes */
    const notes = this.section('Notes', 'pencil');
    this.notesInput = notes.createEl('textarea', { cls: 'mt-textarea', attr: { rows: 3, placeholder: 'Anything else worth remembering…' } });
    this.notesInput.value = this.ep.notes || '';

    /* Footer */
    const footer = contentEl.createDiv({ cls: 'mt-footer' });
    if (this.existing) {
      const del = footer.createEl('button', { text: 'Delete', cls: 'mod-warning', attr: { type: 'button' } });
      del.onclick = () => this.confirmDelete();
    }
    footer.createDiv({ cls: 'mt-spacer' });
    const cancel = footer.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
    cancel.onclick = () => this.close();
    const save = footer.createEl('button', { text: this.existing ? 'Save changes' : 'Save episode', cls: 'mod-cta', attr: { type: 'button' } });
    save.onclick = () => this.save();

    this.updateDuration();
  }

  section(title, icon) {
    const sec = this.contentEl.createDiv({ cls: 'mt-section' });
    const h = sec.createDiv({ cls: 'mt-section-title' });
    setIcon(h.createSpan({ cls: 'mt-section-icon' }), icon);
    h.createSpan({ text: title });
    return sec;
  }
  field(parent, label) {
    const f = parent.createDiv({ cls: 'mt-field' });
    f.createEl('label', { text: label, cls: 'mt-label' });
    return f;
  }
  label(parent, text) { parent.createDiv({ cls: 'mt-label', text }); }

  /** A row of buttons 0…PAIN_MAX; the chosen level is filled with its pain colour. */
  painSelector(parent, label, value, onPick) {
    const row = parent.createDiv({ cls: 'mt-pain-row' });
    row.createDiv({ cls: 'mt-label', text: label });
    const group = row.createDiv({ cls: 'mt-pain-select', attr: { role: 'radiogroup', 'aria-label': label } });
    const word = row.createDiv({ cls: 'mt-pain-word' });
    const btns = [];
    let current = 0;
    const set = (v) => {
      current = Math.max(0, Math.min(PAIN_MAX, v));
      btns.forEach((b, i) => {
        const on = i === current;
        b.toggleClass('is-selected', on);
        b.setAttr('aria-checked', String(on));
        b.style.background = on ? (i > 0 ? painColor(i, 0.9) : 'var(--background-modifier-border)') : '';
      });
      word.setText(painLabel(current));
    };
    for (let i = 0; i <= PAIN_MAX; i++) {
      const b = group.createEl('button', { cls: 'mt-pain-opt', text: String(i), attr: { type: 'button', role: 'radio', title: `${i} – ${painLabel(i)}` } });
      b.onclick = () => { set(i); onPick && onPick(i); };
      btns.push(b);
    }
    set(value);
    return { get: () => current, set };
  }

  addMedRow(m, focus) {
    const row = this.medRows.createDiv({ cls: 'mt-med-row' });
    const name = row.createEl('input', { type: 'text', cls: 'mt-input mt-med-name', attr: { placeholder: 'Medication', list: this.medListId } });
    name.value = m.name || '';
    const dose = row.createEl('input', { type: 'text', cls: 'mt-input mt-med-dose', attr: { placeholder: 'Dose' } });
    dose.value = m.dose || '';
    const date = row.createEl('input', { type: 'date', cls: 'mt-input mt-med-date', attr: { 'aria-label': 'Date taken', title: 'Date taken' } });
    date.value = (parseDT(m.date) && m.date) || this.startInput.value || '';
    const time = row.createEl('input', { type: 'time', cls: 'mt-input mt-med-time', attr: { 'aria-label': 'Time taken', title: 'Time taken (optional)' } });
    time.value = m.time || '';
    const effect = row.createEl('select', { cls: 'dropdown mt-med-effect', attr: { 'aria-label': 'Did it help?' } });
    for (const e of MED_EFFECTS) effect.createEl('option', { text: e, attr: { value: e } });
    effect.value = MED_EFFECTS.includes(m.effect) ? m.effect : 'Not sure';
    const rm = row.createEl('button', { cls: 'mt-icon-btn', attr: { type: 'button', 'aria-label': 'Remove' } });
    setIcon(rm, 'x');
    const rec = { row, name, dose, date, time, effect };
    rm.onclick = () => { row.remove(); this.medRowEls = this.medRowEls.filter((r) => r !== rec); };
    this.medRowEls.push(rec);
    if (focus) name.focus();
  }

  updateDuration() {
    if (this.todEndHelp) this.todEndHelp.setText(this.endInput.value ? '' : 'Leave empty while it’s still going.');
    const st = parseDT(this.startInput.value);
    const en = parseDT(this.endInput.value);
    this.durationEl.removeClass('is-error');
    if (!st) { this.durationEl.setText(''); return; }
    if (!en) { this.durationEl.setText(`Ongoing — day ${Math.max(1, spanDays(st, new Date()))}`); return; }
    if (en < st) { this.durationEl.setText('The end date is before the start date.'); this.durationEl.addClass('is-error'); return; }
    this.durationEl.setText(`Duration: ${fmtDays(spanDays(st, en))}`);
  }

  collect() {
    const start = parseDT(this.startInput.value);
    if (!start) { new Notice('Please set the date the migraine started.'); return null; }
    const end = parseDT(this.endInput.value);
    if (end && end < start) { new Notice('The end date can’t be before the start date.'); return null; }
    let painMax = this.maxPain.get();
    let painAvg = this.avgPain.get();
    if (painAvg > painMax) painAvg = painMax;
    return {
      start, end,
      type: this.typeChips.value(),
      attackLocation: this.whereChips.value(),
      timeOfDay: this.todChips.value(),
      timeOfDayEnd: end ? this.todEndChips.value() : '',
      painMax, painAvg,
      headLocation: this.headChips.values(),
      symptoms: this.symChips.values(),
      triggers: this.trigChips.values(),
      relief: this.reliefChips.values(),
      medications: this.medRowEls
        .map((r) => ({ name: r.name.value.trim(), dose: r.dose.value.trim(), date: r.date.value, time: r.time.value, effect: r.effect.value }))
        .filter((m) => m.name),
      notes: this.notesInput.value.trim(),
    };
  }

  async save() {
    const ep = this.collect();
    if (!ep) return;
    try {
      // Remember new custom options for next time
      const s = this.plugin.settings;
      const remember = (key, values) => { for (const v of values) if (v && !s[key].includes(v)) s[key].push(v); };
      remember('types', [ep.type]);
      remember('attackLocations', [ep.attackLocation]);
      remember('headLocations', ep.headLocation);
      remember('symptoms', ep.symptoms);
      remember('triggers', ep.triggers);
      remember('reliefs', ep.relief);
      remember('medications', ep.medications.map((m) => m.name));
      await this.plugin.saveSettings();

      if (this.existing && this.existing.file) {
        await this.plugin.updateEpisode(this.existing.file, ep);
        new Notice('Migraine episode updated.');
      } else {
        await this.plugin.createEpisode(ep);
        new Notice('Migraine episode saved.');
      }
      this.close();
    } catch (err) {
      console.error('[Migraine Tracker]', err);
      new Notice(`Couldn't save the episode: ${err.message}`);
    }
  }

  confirmDelete() {
    const m = new Modal(this.app);
    m.titleEl.setText('Delete this episode?');
    m.contentEl.createEl('p', { text: `The note “${this.existing.file.basename}” will be moved to the trash.` });
    const row = m.contentEl.createDiv({ cls: 'mt-footer' });
    row.createDiv({ cls: 'mt-spacer' });
    row.createEl('button', { text: 'Cancel' }).onclick = () => m.close();
    const del = row.createEl('button', { text: 'Delete', cls: 'mod-warning' });
    del.onclick = async () => {
      await this.app.vault.trash(this.existing.file, true);
      new Notice('Episode moved to trash.');
      m.close();
      this.close();
    };
    m.open();
  }

  onClose() { this.contentEl.empty(); }
}

/* ------------------------------------------------------------------ */
/* Dashboard view                                                      */
/* ------------------------------------------------------------------ */

class DashboardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.range = plugin.settings.defaultRange || '90';
    const now = new Date();
    this.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    this.showAll = false;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Migraine dashboard'; }
  getIcon() { return 'brain'; }
  async onOpen() { this.render(); }
  async onClose() {}

  render() {
    const root = this.containerEl.children[1];
    const scroll = root.scrollTop;
    root.empty();
    root.addClass('mt-dashboard');

    const now = new Date();
    const all = this.plugin.getEpisodes();
    const st = computeStats(all, this.range, now, this.plugin.settings);

    /* Header */
    const header = root.createDiv({ cls: 'mt-dash-header' });
    const titleWrap = header.createDiv();
    titleWrap.createEl('h2', { text: 'Migraine dashboard', cls: 'mt-dash-title' });
    titleWrap.createDiv({ cls: 'mt-dash-sub', text: `${all.length} episode${all.length === 1 ? '' : 's'} logged` });
    const actions = header.createDiv({ cls: 'mt-dash-actions' });
    const rangeSel = actions.createEl('select', { cls: 'dropdown' });
    for (const [v, t] of [['30', 'Last 30 days'], ['90', 'Last 90 days'], ['180', 'Last 6 months'], ['365', 'Last 12 months'], ['all', 'All time']]) {
      rangeSel.createEl('option', { text: t, attr: { value: v } });
    }
    rangeSel.value = this.range;
    rangeSel.onchange = () => { this.range = rangeSel.value; this.render(); };
    const exportBtn = actions.createEl('button', { cls: 'mt-btn', attr: { 'aria-label': 'Export all episodes to CSV' } });
    setIcon(exportBtn.createSpan(), 'download');
    exportBtn.createSpan({ text: 'CSV' });
    exportBtn.onclick = () => this.plugin.exportCsv();
    const pdfBtn = actions.createEl('button', { cls: 'mt-btn', attr: { 'aria-label': 'Create a PDF report for your doctor' } });
    setIcon(pdfBtn.createSpan(), 'file-text');
    pdfBtn.createSpan({ text: 'Doctor report' });
    pdfBtn.onclick = () => new ReportModal(this.plugin).open();
    const logBtn = actions.createEl('button', { cls: 'mod-cta mt-btn' });
    setIcon(logBtn.createSpan(), 'plus');
    logBtn.createSpan({ text: 'Log migraine' });
    logBtn.onclick = () => new EpisodeModal(this.plugin).open();

    /* Ongoing banner */
    for (const ep of st.ongoing) {
      const b = root.createDiv({ cls: 'mt-banner' });
      setIcon(b.createSpan({ cls: 'mt-banner-icon' }), 'alarm-clock');
      b.createSpan({ text: `Migraine in progress since ${fmtDate(ep.start)} — day ${spanDays(ep.start, now)}.` });
      b.createDiv({ cls: 'mt-spacer' });
      const endBtn = b.createEl('button', { text: 'End now', cls: 'mod-cta' });
      endBtn.onclick = () => this.plugin.endEpisode(ep);
      const editBtn = b.createEl('button', { text: 'Edit' });
      editBtn.onclick = () => new EpisodeModal(this.plugin, ep).open();
    }

    if (!all.length) {
      const empty = root.createDiv({ cls: 'mt-empty' });
      setIcon(empty.createDiv({ cls: 'mt-empty-icon' }), 'brain');
      empty.createEl('h3', { text: 'No migraines logged yet' });
      empty.createEl('p', { text: 'Log your first episode and this dashboard will start showing your patterns: frequency, pain, common triggers, what helps, and a calendar.' });
      const b = empty.createEl('button', { text: 'Log a migraine', cls: 'mod-cta' });
      b.onclick = () => new EpisodeModal(this.plugin).open();
      return;
    }

    /* Stat tiles */
    const tiles = root.createDiv({ cls: 'mt-tiles' });
    const tile = (label, value, sub, cls) => {
      const t = tiles.createDiv({ cls: `mt-tile ${cls || ''}` });
      t.createDiv({ cls: 'mt-tile-label', text: label });
      t.createDiv({ cls: 'mt-tile-value', text: value });
      if (sub) t.createDiv({ cls: 'mt-tile-sub', text: sub });
      return t;
    };
    tile('Episodes', String(st.count), `${st.perMonth.toFixed(1)} per month`);
    tile('Migraine days', String(st.migraineDays), `${Math.round(st.migraineDayPct * 100)}% of ${st.spanDays} days`);
    tile('Avg duration', fmtDays(st.avgDuration), st.longest != null ? `Longest ${fmtDays(st.longest)}` : 'No completed episodes');
    tile('Avg max pain', st.avgPainMax != null ? `${st.avgPainMax.toFixed(1)}/${PAIN_MAX}` : '—',
      st.avgPainAvg != null ? `Avg pain ${st.avgPainAvg.toFixed(1)}/${PAIN_MAX}` : '');
    tile('Migraine-free', st.ongoing.length ? 'Ongoing' : st.daysSince != null ? `${st.daysSince} day${st.daysSince === 1 ? '' : 's'}` : '—',
      st.ongoing.length ? 'An episode is in progress' : 'since the last episode ended');
    const medTile = tile('Acute-med days', String(st.medDays30), 'in the last 30 days', st.overuse ? 'is-warning' : '');
    if (st.overuse) medTile.setAttr('title', `${st.medDays30} days with acute medication in the last 30 days. Frequent use of acute medication can lead to medication-overuse headache — worth discussing with your doctor.`);

    if (st.overuse) {
      const note = root.createDiv({ cls: 'mt-note' });
      setIcon(note.createSpan({ cls: 'mt-banner-icon' }), 'info');
      note.createSpan({ text: `You took acute medication on ${st.medDays30} of the last 30 days. Frequent use can contribute to medication-overuse headache — it may be worth bringing to your doctor.` });
    }

    /* Calendar + monthly chart */
    const row1 = root.createDiv({ cls: 'mt-grid mt-grid-cal' });
    this.renderCalendar(row1.createDiv({ cls: 'mt-card' }), all, now);
    const monthCard = row1.createDiv({ cls: 'mt-card' });
    this.cardTitle(monthCard, 'Last 12 months', 'Migraine days per month');
    this.vbars(monthCard, st.months.map((m) => ({ label: m.label, value: m.days, title: `${MONTHS_LONG[MONTHS.indexOf(m.label)]} ${m.year}: ${m.days} migraine day${m.days === 1 ? '' : 's'}, ${m.episodes} episode${m.episodes === 1 ? '' : 's'}` })));
    this.cardTitle(monthCard, 'Max pain', 'Episodes by peak pain level', true);
    this.vbars(monthCard, st.painHist.map((v, i) => ({ label: String(i + 1), value: v, color: painColor(i + 1, 0.85), title: `Pain ${i + 1} (${painLabel(i + 1)}): ${v} episode${v === 1 ? '' : 's'}` })));

    /* Pattern charts */
    const sub = root.createDiv({ cls: 'mt-section-heading', text: `Patterns · ${rangeSel.selectedOptions[0].text.toLowerCase()}` });
    sub.setAttr('role', 'heading');
    const grid = root.createDiv({ cls: 'mt-grid' });
    const n = st.count;
    this.hbars(grid, 'Possible causes', st.triggers, n);
    this.hbars(grid, 'Symptoms', st.symptoms, n);
    this.hbars(grid, 'Headache location', st.headLocation, n);
    this.hbars(grid, 'Relief tried', st.relief, n);
    this.medCard(grid, st.medications, n);
    this.hbars(grid, 'Migraine type', st.types, n);
    this.hbars(grid, 'Where it started', st.attackLocations, n);
    this.hbars(grid, 'Time of day it started', st.timeOfDay, n, { keepOrder: true, showZero: true });
    this.hbars(grid, 'Time of day it ended', st.timeOfDayEnd, st.endedCount, { keepOrder: true, showZero: true, ended: true });
    this.hbars(grid, 'Day of week', st.weekday, n, { keepOrder: true, showZero: true });

    /* Recent episodes */
    this.renderList(root, st.episodes, now);

    root.scrollTop = scroll;
  }

  cardTitle(card, title, sub, spaced) {
    const h = card.createDiv({ cls: `mt-card-head${spaced ? ' mt-card-head-spaced' : ''}` });
    h.createDiv({ cls: 'mt-card-title', text: title });
    if (sub) h.createDiv({ cls: 'mt-card-sub', text: sub });
  }

  vbars(card, items) {
    const max = Math.max(1, ...items.map((i) => i.value));
    const chart = card.createDiv({ cls: 'mt-vbars' });
    for (const it of items) {
      const col = chart.createDiv({ cls: 'mt-vbar-col', attr: { title: it.title || '' } });
      col.createDiv({ cls: 'mt-vbar-val', text: it.value ? String(it.value) : '' });
      const track = col.createDiv({ cls: 'mt-vbar-track' });
      const bar = track.createDiv({ cls: 'mt-vbar' });
      bar.style.height = `${(it.value / max) * 100}%`;
      if (it.color) bar.style.background = it.color;
      col.createDiv({ cls: 'mt-vbar-label', text: it.label });
    }
  }

  hbars(grid, title, entries, total, opts = {}) {
    const card = grid.createDiv({ cls: 'mt-card' });
    this.cardTitle(card, title, total ? `% of ${total} ${opts.ended ? 'ended ' : ''}episode${total === 1 ? '' : 's'}` : '');
    let list = opts.showZero ? entries : entries.filter((e) => e[1] > 0);
    if (!list.length) { card.createDiv({ cls: 'mt-muted', text: 'Nothing recorded in this period.' }); return; }
    const limit = 8;
    const extra = list.length - limit;
    const shown = list.slice(0, limit);
    const max = Math.max(1, ...shown.map((e) => e[1]));
    const wrap = card.createDiv({ cls: 'mt-hbars' });
    for (const [label, count] of shown) {
      const row = wrap.createDiv({ cls: 'mt-hbar-row' });
      row.createDiv({ cls: 'mt-hbar-label', text: label, attr: { title: label } });
      const track = row.createDiv({ cls: 'mt-hbar-track' });
      track.createDiv({ cls: 'mt-hbar' }).style.width = `${(count / max) * 100}%`;
      row.createDiv({ cls: 'mt-hbar-val', text: `${count} · ${total ? Math.round((count / total) * 100) : 0}%` });
    }
    if (extra > 0) card.createDiv({ cls: 'mt-muted', text: `+ ${extra} more` });
  }

  medCard(grid, meds, total) {
    const card = grid.createDiv({ cls: 'mt-card' });
    this.cardTitle(card, 'Medications', 'Episodes used · how often it helped');
    if (!meds.length) { card.createDiv({ cls: 'mt-muted', text: 'No medications recorded in this period.' }); return; }
    const max = Math.max(1, ...meds.map((m) => m.episodes));
    const wrap = card.createDiv({ cls: 'mt-hbars' });
    for (const m of meds.slice(0, 8)) {
      const row = wrap.createDiv({ cls: 'mt-hbar-row' });
      row.createDiv({ cls: 'mt-hbar-label', text: m.name, attr: { title: m.name } });
      const track = row.createDiv({ cls: 'mt-hbar-track' });
      track.createDiv({ cls: 'mt-hbar' }).style.width = `${(m.episodes / max) * 100}%`;
      const helped = m.rated ? `${Math.round((m.helped / m.rated) * 100)}% helped` : 'not rated';
      row.createDiv({ cls: 'mt-hbar-val', text: `${m.episodes} · ${helped}`, attr: { title: m.rated ? `Helped in ${m.helped} of ${m.rated} rated uses` : 'Effect not rated yet' } });
    }
  }

  renderCalendar(card, all, now) {
    const s = this.plugin.settings;
    const head = card.createDiv({ cls: 'mt-cal-head' });
    const prev = head.createEl('button', { cls: 'mt-icon-btn', attr: { 'aria-label': 'Previous month' } });
    setIcon(prev, 'chevron-left');
    head.createDiv({ cls: 'mt-card-title mt-cal-title', text: `${MONTHS_LONG[this.calMonth.getMonth()]} ${this.calMonth.getFullYear()}` });
    const next = head.createEl('button', { cls: 'mt-icon-btn', attr: { 'aria-label': 'Next month' } });
    setIcon(next, 'chevron-right');
    const today = head.createEl('button', { cls: 'mt-small-btn', text: 'Today' });
    prev.onclick = () => { this.calMonth = new Date(this.calMonth.getFullYear(), this.calMonth.getMonth() - 1, 1); this.render(); };
    next.onclick = () => { this.calMonth = new Date(this.calMonth.getFullYear(), this.calMonth.getMonth() + 1, 1); this.render(); };
    today.onclick = () => { this.calMonth = new Date(now.getFullYear(), now.getMonth(), 1); this.render(); };

    // Map day -> episodes
    const dayMap = new Map();
    for (const ep of all) for (const k of episodeDayKeys(ep, now)) {
      if (!dayMap.has(k)) dayMap.set(k, []);
      dayMap.get(k).push(ep);
    }

    const grid = card.createDiv({ cls: 'mt-cal' });
    const offset = s.weekStart === 'monday' ? 1 : 0;
    for (let i = 0; i < 7; i++) grid.createDiv({ cls: 'mt-cal-dow', text: DOW[(i + offset) % 7].slice(0, 2) });

    const first = this.calMonth;
    const lead = (first.getDay() - offset + 7) % 7;
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    for (let i = 0; i < lead; i++) grid.createDiv({ cls: 'mt-cal-cell is-blank' });

    const todayKey = dayKey(now);
    let monthDays = 0, monthEpisodes = new Set();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(first.getFullYear(), first.getMonth(), d);
      const key = dayKey(date);
      const eps = dayMap.get(key) || [];
      const cell = grid.createEl('button', { cls: 'mt-cal-cell' });
      cell.createSpan({ cls: 'mt-cal-num', text: String(d) });
      if (key === todayKey) cell.addClass('is-today');
      if (date > now) cell.addClass('is-future');
      if (eps.length) {
        monthDays++;
        eps.forEach((e) => monthEpisodes.add(e.path));
        const peak = Math.max(...eps.map((e) => e.painMax || 0));
        cell.addClass('has-episode');
        cell.style.background = painColor(peak || 1);
        if (eps.some((e) => e.medications.some((m) => medDayKey(m, e) === key))) cell.createSpan({ cls: 'mt-cal-dot', attr: { title: 'Medication taken' } });
        cell.setAttr('title', eps.map((e) => `${e.type || 'Migraine'} · peak ${e.painMax ?? '?'}/${PAIN_MAX} · ${e.end ? fmtDays(durationDays(e)) : 'ongoing'}`).join('\n'));
      } else {
        cell.setAttr('title', fmtDate(date));
      }
      cell.onclick = (evt) => this.onDayClick(evt, date, eps);
    }

    const legend = card.createDiv({ cls: 'mt-cal-legend' });
    legend.createSpan({ text: `${monthDays} migraine day${monthDays === 1 ? '' : 's'} · ${monthEpisodes.size} episode${monthEpisodes.size === 1 ? '' : 's'}` });
    legend.createDiv({ cls: 'mt-spacer' });
    legend.createSpan({ cls: 'mt-legend-label', text: 'Mild' });
    for (let p = 1; p <= PAIN_MAX; p += PAIN_MAX > 5 ? 2 : 1) legend.createSpan({ cls: 'mt-legend-swatch' }).style.background = painColor(p);
    legend.createSpan({ cls: 'mt-legend-label', text: 'Severe' });
    const dotLegend = legend.createSpan({ cls: 'mt-legend-label' });
    dotLegend.createSpan({ cls: 'mt-cal-dot mt-cal-dot-inline' });
    dotLegend.appendText(' medication');
  }

  onDayClick(evt, date, eps) {
    if (eps.length === 1 && !evt.shiftKey) { new EpisodeModal(this.plugin, eps[0]).open(); return; }
    const menu = new Menu();
    for (const ep of eps) {
      menu.addItem((item) => item
        .setTitle(`${fmtDate(ep.start)} · ${ep.type || 'Migraine'} · peak ${ep.painMax ?? '?'}/${PAIN_MAX}`)
        .setIcon('pencil')
        .onClick(() => new EpisodeModal(this.plugin, ep).open()));
      menu.addItem((item) => item
        .setTitle('Open note')
        .setIcon('file-text')
        .onClick(() => this.app.workspace.getLeaf('tab').openFile(ep.file)));
    }
    if (eps.length) menu.addSeparator();
    menu.addItem((item) => item
      .setTitle(`Log migraine on ${fmtDate(date)}`)
      .setIcon('plus')
      .onClick(() => {
        const now = new Date();
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(),
          dayKey(date) === dayKey(now) ? now.getHours() : 9, dayKey(date) === dayKey(now) ? now.getMinutes() : 0);
        new EpisodeModal(this.plugin, null, { date: d }).open();
      }));
    menu.showAtMouseEvent(evt);
  }

  renderList(root, eps, now) {
    root.createDiv({ cls: 'mt-section-heading', text: 'Episodes in this period' });
    const card = root.createDiv({ cls: 'mt-card mt-list-card' });
    if (!eps.length) { card.createDiv({ cls: 'mt-muted', text: 'No episodes in this period.' }); return; }
    const table = card.createEl('table', { cls: 'mt-table' });
    const thr = table.createEl('thead').createEl('tr');
    for (const h of ['Started', 'Duration', 'Type', 'Pain (max / avg)', 'Location', 'Medications', '']) thr.createEl('th', { text: h });
    const tbody = table.createEl('tbody');
    const shown = this.showAll ? eps : eps.slice(0, 12);
    for (const ep of shown) {
      const tr = tbody.createEl('tr');
      const c1 = tr.createEl('td');
      const link = c1.createEl('a', { text: fmtDate(ep.start), cls: 'mt-link' });
      link.onclick = () => this.app.workspace.getLeaf(false).openFile(ep.file);
      const tod = [ep.timeOfDay || '?', ep.end ? ep.timeOfDayEnd || '?' : 'ongoing'];
      if (ep.timeOfDay || ep.timeOfDayEnd) c1.createDiv({ cls: 'mt-muted-sm', text: tod.join(' → ') });
      tr.createEl('td', { text: ep.end ? fmtDays(durationDays(ep)) : `Ongoing (day ${spanDays(ep.start, now)})` });
      tr.createEl('td', { text: ep.type || '—' });
      const painTd = tr.createEl('td');
      const pill = painTd.createSpan({ cls: 'mt-pain-pill', text: `${ep.painMax ?? '–'} / ${ep.painAvg ?? '–'}` });
      if (ep.painMax) pill.style.background = painColor(ep.painMax, 0.75);
      tr.createEl('td', { text: ep.headLocation.join(', ') || '—' });
      tr.createEl('td', { text: ep.medications.map((m) => m.name).join(', ') || '—' });
      const act = tr.createEl('td', { cls: 'mt-td-actions' });
      const edit = act.createEl('button', { cls: 'mt-icon-btn', attr: { 'aria-label': 'Edit episode' } });
      setIcon(edit, 'pencil');
      edit.onclick = () => new EpisodeModal(this.plugin, ep).open();
    }
    if (eps.length > 12) {
      const more = card.createEl('button', { cls: 'mt-small-btn mt-show-all', text: this.showAll ? 'Show fewer' : `Show all ${eps.length}` });
      more.onclick = () => { this.showAll = !this.showAll; this.render(); };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Settings tab                                                        */
/* ------------------------------------------------------------------ */

class MigraineSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Episode folder')
      .setDesc('New episode notes are created here. Episodes are found anywhere in the vault by their “entry: migraine” property, so moving notes is fine.')
      .addText((t) => t.setValue(s.folder).onChange(async (v) => { s.folder = v.trim() || DEFAULT_SETTINGS.folder; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Week starts on')
      .addDropdown((d) => d.addOptions({ sunday: 'Sunday', monday: 'Monday' }).setValue(s.weekStart)
        .onChange(async (v) => { s.weekStart = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Default dashboard period')
      .addDropdown((d) => d.addOptions({ 30: 'Last 30 days', 90: 'Last 90 days', 180: 'Last 6 months', 365: 'Last 12 months', all: 'All time' })
        .setValue(s.defaultRange).onChange(async (v) => { s.defaultRange = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Pain scale')
      .setDesc('Top of the pain scale used for max and average pain. Existing values above the new maximum are shown as the maximum.')
      .addDropdown((d) => d.addOptions({ 5: '0 – 5', 10: '0 – 10' }).setValue(String(s.painScale))
        .onChange(async (v) => { s.painScale = Number(v); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Name on reports')
      .setDesc('Optional. Printed at the top of PDF reports for your doctor.')
      .addText((t) => t.setValue(s.reportName || '').setPlaceholder('Your name').onChange(async (v) => { s.reportName = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Acute medication days alert')
      .setDesc('Highlight when you’ve taken acute medication on at least this many days in the last 30.')
      .addText((t) => t.setValue(String(s.overuseThreshold)).onChange(async (v) => {
        const n = parseInt(v, 10);
        if (n > 0) { s.overuseThreshold = n; await this.plugin.saveSettings(); }
      }));

    new Setting(containerEl)
      .setName('Show ongoing migraine in status bar')
      .addToggle((t) => t.setValue(s.showStatusBar).onChange(async (v) => { s.showStatusBar = v; await this.plugin.saveSettings(); this.plugin.updateStatusBar(); }));

    new Setting(containerEl).setName('Choice lists').setHeading()
      .setDesc('One option per line. Options you add while logging are saved here automatically.');

    for (const [key, label] of LIST_SETTINGS) {
      new Setting(containerEl)
        .setName(label)
        .addTextArea((ta) => {
          ta.setValue(s[key].join('\n'));
          ta.inputEl.rows = 6;
          ta.inputEl.addClass('mt-settings-textarea');
          ta.onChange(async (v) => {
            s[key] = v.split('\n').map((x) => x.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          });
        })
        .addExtraButton((b) => b.setIcon('rotate-ccw').setTooltip('Restore defaults').onClick(async () => {
          s[key] = [...DEFAULT_SETTINGS[key]];
          await this.plugin.saveSettings();
          this.display();
        }));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Minimal PDF writer (Helvetica, WinAnsi) — no dependencies           */
/* ------------------------------------------------------------------ */

const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELV_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const WIN_ANSI = { '–': 0x96, '—': 0x97, '•': 0x95, '·': 0xb7, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '…': 0x85, '°': 0xb0, '×': 0xd7 };
const EXTRA_W = { 0x96: [556, 556], 0x97: [1000, 1000], 0x95: [350, 350], 0xb7: [278, 278], 0x91: [222, 278], 0x92: [222, 278], 0x93: [333, 500], 0x94: [333, 500], 0x85: [1000, 1000] };

function pdfCode(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c < 127) return c;
  if (WIN_ANSI[ch]) return WIN_ANSI[ch];
  if (c >= 160 && c <= 255) return c;
  return 63; // '?'
}
function hexRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function hslRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
/** Pain colour for print: same hue ramp as the dashboard, blended with white. */
function painRgb(p, strength = 0.85) {
  const t = Math.max(0, Math.min(1, (Math.max(1, p) - 1) / Math.max(1, PAIN_MAX - 1)));
  const rgb = hslRgb(52 - t * 52, 85, 52);
  const a = 0.35 + t * 0.6 * strength;
  return rgb.map((c) => 1 - a + c * a);
}

class PdfDoc {
  constructor(title) {
    this.W = 612; this.H = 792; // US Letter
    this.title = title;
    this.pages = [];
  }
  addPage() { this.page = []; this.pages.push(this.page); return this.page; }
  width(str, size, bold) {
    const tbl = bold ? HELV_B : HELV;
    let w = 0;
    for (const ch of String(str)) {
      const c = pdfCode(ch);
      w += c >= 32 && c < 127 ? tbl[c - 32] : (EXTRA_W[c] ? EXTRA_W[c][bold ? 1 : 0] : 556);
    }
    return (w * size) / 1000;
  }
  esc(str) {
    let out = '';
    for (const ch of String(str)) {
      const c = pdfCode(ch);
      const s = String.fromCharCode(c);
      out += s === '(' || s === ')' || s === '\\' ? '\\' + s : s;
    }
    return out;
  }
  num(n) { return (Math.round(n * 100) / 100).toString(); }
  color(rgb) { return rgb.map((c) => this.num(c)).join(' '); }

  text(x, y, str, o = {}) {
    const size = o.size || 10, bold = !!o.bold;
    if (o.maxWidth) str = this.fit(str, o.maxWidth, size, bold);
    let tx = x;
    if (o.align === 'right') tx = x - this.width(str, size, bold);
    else if (o.align === 'center') tx = x - this.width(str, size, bold) / 2;
    const rgb = o.color || [0.13, 0.13, 0.13];
    this.page.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${this.color(rgb)} rg ${this.num(tx)} ${this.num(this.H - y)} Td (${this.esc(str)}) Tj ET`);
  }
  rect(x, y, w, h, o = {}) {
    const parts = ['q'];
    if (o.fill) parts.push(`${this.color(o.fill)} rg`);
    if (o.stroke) parts.push(`${this.color(o.stroke)} RG ${this.num(o.lineWidth || 0.5)} w`);
    parts.push(`${this.num(x)} ${this.num(this.H - y - h)} ${this.num(w)} ${this.num(h)} re ${o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'}`, 'Q');
    this.page.push(parts.join(' '));
  }
  line(x1, y1, x2, y2, o = {}) {
    this.page.push(`q ${this.color(o.color || [0.85, 0.85, 0.85])} RG ${this.num(o.width || 0.5)} w ${this.num(x1)} ${this.num(this.H - y1)} m ${this.num(x2)} ${this.num(this.H - y2)} l S Q`);
  }
  fit(str, maxW, size, bold) {
    str = String(str);
    if (this.width(str, size, bold) <= maxW) return str;
    while (str.length > 1 && this.width(str + '…', size, bold) > maxW) str = str.slice(0, -1);
    return str.trimEnd() + '…';
  }
  wrap(str, maxW, size, bold) {
    const lines = [];
    for (const para of String(str || '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? `${line} ${word}` : word;
        if (this.width(test, size, bold) <= maxW) line = test;
        else {
          if (line) lines.push(line);
          line = this.width(word, size, bold) > maxW ? this.fit(word, maxW, size, bold) : word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  output() {
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(null), pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const ops of this.pages) {
      const stream = ops.join('\n');
      const c = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const info = add(`<< /Title (${this.esc(this.title)}) /Producer (Obsidian Migraine Tracker) >>`);
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

/* ------------------------------------------------------------------ */
/* Doctor report                                                       */
/* ------------------------------------------------------------------ */

const C = {
  ink: [0.13, 0.13, 0.15], muted: [0.42, 0.42, 0.46], faint: [0.62, 0.62, 0.66],
  rule: [0.86, 0.86, 0.89], panel: [0.965, 0.965, 0.975], accent: hexRgb('#5b3fd6'),
  accentSoft: hexRgb('#e6e0fb'), warn: hexRgb('#b45309'), warnSoft: hexRgb('#fff4e5'),
};

function buildDoctorReport(allEpisodes, settings, opts) {
  const from = startOfDay(opts.from);
  const to = new Date(opts.to.getFullYear(), opts.to.getMonth(), opts.to.getDate(), 23, 59, 59);
  const st = computeStats(allEpisodes, 'custom', to, settings, from);
  const eps = [...st.episodes].sort((a, b) => a.start - b.start);
  const months = st.spanDays / 30.44;
  const perMonth = (n) => (n / months).toFixed(1);
  const fromKey = dayKey(from), toKey = dayKey(to);

  const doc = new PdfDoc(`Migraine report ${fmtDate(from)} – ${fmtDate(to)}`);
  const M = 48, W = doc.W - M * 2, BOTTOM = doc.H - 54;
  let y = 0;

  const newPage = () => {
    doc.addPage();
    y = M;
    if (doc.pages.length > 1) {
      doc.text(M, y, 'Migraine report', { size: 8, bold: true, color: C.muted });
      doc.text(M + W, y, `${fmtDate(from)} – ${fmtDate(to)}`, { size: 8, color: C.muted, align: 'right' });
      doc.line(M, y + 6, M + W, y + 6, { color: C.rule });
      y += 24;
    }
  };
  const ensure = (h) => { if (y + h > BOTTOM) newPage(); };
  const heading = (t, sub, keepWith = 60) => {
    ensure(30 + keepWith);
    y += 8;
    doc.text(M, y + 10, t, { size: 12.5, bold: true, color: C.ink });
    if (sub) doc.text(M + doc.width(t, 12.5, true) + 8, y + 10, sub, { size: 8.5, color: C.muted });
    y += 22;
  };

  /* ---- Header ---- */
  newPage();
  doc.rect(M, y, 4, 40, { fill: C.accent });
  doc.text(M + 14, y + 17, 'Migraine Report', { size: 21, bold: true });
  const meta = [opts.name ? `Patient: ${opts.name}` : null, `Period: ${fmtDate(from)} – ${fmtDate(to)} (${st.spanDays} days)`].filter(Boolean).join('   ·   ');
  doc.text(M + 14, y + 35, meta, { size: 9.5, color: C.muted });
  doc.text(M + W, y + 17, `Generated ${fmtDate(new Date())}`, { size: 8.5, color: C.muted, align: 'right' });
  doc.text(M + W, y + 30, `Pain scale 0–${PAIN_MAX}`, { size: 8.5, color: C.muted, align: 'right' });
  y += 58;

  if (!eps.length) {
    doc.text(M, y + 10, 'No migraine episodes were logged in this period.', { size: 11, color: C.muted });
    y += 30;
  }

  /* ---- Summary tiles ---- */
  const aura = eps.filter((e) => /aura/i.test(e.type) && !/without/i.test(e.type)).length;
  const tiles = [
    ['Episodes', String(st.count), `${perMonth(st.count)} per month`],
    ['Headache days', String(st.migraineDays), `${perMonth(st.migraineDays)} per month · ${Math.round(st.migraineDayPct * 100)}% of days`],
    ['Average duration', fmtDays(st.avgDuration), st.longest != null ? `Longest ${fmtDays(st.longest)}` : 'No completed episodes'],
    ['Average peak pain', st.avgPainMax != null ? `${st.avgPainMax.toFixed(1)} / ${PAIN_MAX}` : '—', st.avgPainAvg != null ? `Average pain ${st.avgPainAvg.toFixed(1)} / ${PAIN_MAX}` : ''],
    ['Acute-medication days', String(st.medDaysRange), `${perMonth(st.medDaysRange)} per month`],
    ['Most common type', st.types[0] ? st.types[0][0] : '—', st.types[0] ? `${st.types[0][1]} of ${st.count} episodes` : ''],
    ['Episodes with aura', String(aura), st.count ? `${Math.round((aura / st.count) * 100)}% of episodes` : ''],
    ['Most common trigger', st.triggers[0] ? st.triggers[0][0] : '—', st.triggers[0] ? `${st.triggers[0][1]} of ${st.count} episodes` : 'None recorded'],
  ];
  const gap = 8, tw = (W - gap * 3) / 4, th = 50;
  tiles.forEach((t, i) => {
    const tx = M + (i % 4) * (tw + gap), ty = y + Math.floor(i / 4) * (th + gap);
    doc.rect(tx, ty, tw, th, { fill: C.panel, stroke: C.rule });
    doc.text(tx + 9, ty + 13, t[0].toUpperCase(), { size: 6.8, bold: true, color: C.muted, maxWidth: tw - 16 });
    doc.text(tx + 9, ty + 30, t[1], { size: t[1].length > 12 ? 10.5 : 15, bold: true, maxWidth: tw - 16 });
    doc.text(tx + 9, ty + 42, t[2], { size: 7, color: C.muted, maxWidth: tw - 16 });
  });
  y += th * 2 + gap + 12;

  const medPerMonth = st.medDaysRange / months;
  if (medPerMonth >= settings.overuseThreshold) {
    const msg = `Acute medication was taken on about ${medPerMonth.toFixed(0)} days per month in this period, at or above the ${settings.overuseThreshold}-day alert level set in the tracker.`;
    const lines = doc.wrap(msg, W - 24, 8.5);
    doc.rect(M, y, W, lines.length * 11 + 12, { fill: C.warnSoft, stroke: [0.96, 0.8, 0.6] });
    lines.forEach((l, i) => doc.text(M + 12, y + 15 + i * 11, l, { size: 8.5, color: C.warn }));
    y += lines.length * 11 + 22;
  }

  /* ---- Charts: headache days per month + peak pain ---- */
  const monthList = [];
  for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    monthList.push({ y: d.getFullYear(), m: d.getMonth(), days: new Set(), eps: 0 });
  }
  const dayPain = new Map();
  for (const e of eps) {
    const mo = monthList.find((x) => x.y === e.start.getFullYear() && x.m === e.start.getMonth());
    if (mo) mo.eps++;
    for (const k of episodeDayKeys(e, to)) {
      if (k < fromKey || k > toKey) continue;
      dayPain.set(k, Math.max(dayPain.get(k) || 0, e.painMax || 1));
      const [yy, mm] = k.split('-').map(Number);
      const mo2 = monthList.find((x) => x.y === yy && x.m === mm - 1);
      if (mo2) mo2.days.add(k);
    }
  }
  const shownMonths = monthList.slice(-12);
  if (eps.length) {
    ensure(170);
    const half = (W - 16) / 2, chartH = 96;
    const drawBars = (x0, title, sub, items) => {
      doc.text(x0, y + 10, title, { size: 10.5, bold: true });
      doc.text(x0, y + 22, sub, { size: 7.5, color: C.muted });
      const top = y + 36, max = Math.max(1, ...items.map((i) => i.v));
      const bw = half / items.length;
      doc.line(x0, top + chartH, x0 + half, top + chartH, { color: C.rule });
      items.forEach((it, i) => {
        const h = (it.v / max) * chartH, bx = x0 + i * bw + bw * 0.16, w = bw * 0.68;
        if (h > 0) doc.rect(bx, top + chartH - h, w, h, { fill: it.color || C.accent });
        if (it.v) doc.text(bx + w / 2, top + chartH - h - 3, String(it.v), { size: 7, color: C.muted, align: 'center' });
        doc.text(bx + w / 2, top + chartH + 10, it.label, { size: 6.8, color: C.muted, align: 'center' });
      });
    };
    drawBars(M, 'Headache days per month', shownMonths.length < monthList.length ? 'Last 12 months of the period' : 'Days with a migraine, by calendar month',
      shownMonths.map((m) => ({ label: shownMonths.length > 6 ? MONTHS[m.m].slice(0, 3) : `${MONTHS[m.m]} ${String(m.y).slice(2)}`, v: m.days.size })));
    drawBars(M + half + 16, 'Peak pain per episode', `Number of episodes at each pain level (0–${PAIN_MAX})`,
      st.painHist.map((v, i) => ({ label: `${i + 1} ${PAIN_MAX === 5 ? painLabel(i + 1).toLowerCase() : ''}`.trim(), v, color: painRgb(i + 1, 1) })));
    y += 36 + chartH + 26;
  }

  /* ---- Calendar ---- */
  if (eps.length) {
    const cols = 4, mg = 14, mw = (W - mg * (cols - 1)) / cols, cell = mw / 7;
    const rowsNeeded = Math.ceil(shownMonths.length / cols);
    heading('Calendar', 'Days shaded by highest pain that day', 130);
    const offset = settings.weekStart === 'monday' ? 1 : 0;
    shownMonths.forEach((mo, i) => {
      if (i % cols === 0) {
        if (i > 0) y += 8 * cell + 6;
        ensure(8 * cell + 6);
      }
      const x0 = M + (i % cols) * (mw + mg);
      doc.text(x0, y + 8, `${MONTHS_LONG[mo.m]} ${mo.y}`, { size: 8.5, bold: true });
      for (let d = 0; d < 7; d++) doc.text(x0 + d * cell + cell / 2, y + 20, DOW[(d + offset) % 7].slice(0, 1), { size: 6.5, color: C.faint, align: 'center' });
      const first = new Date(mo.y, mo.m, 1), lead = (first.getDay() - offset + 7) % 7;
      const dim = new Date(mo.y, mo.m + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const idx = lead + d - 1, cx = x0 + (idx % 7) * cell, cy = y + 24 + Math.floor(idx / 7) * cell;
        const k = dayKey(new Date(mo.y, mo.m, d));
        const inRange = k >= fromKey && k <= toKey;
        const p = dayPain.get(k);
        doc.rect(cx + 0.8, cy + 0.8, cell - 1.6, cell - 1.6, { fill: p ? painRgb(p, 1) : inRange ? C.panel : [1, 1, 1] });
        doc.text(cx + cell / 2, cy + cell / 2 + 2.4, String(d), { size: 6.3, bold: !!p, color: p ? C.ink : inRange ? C.muted : [0.8, 0.8, 0.82], align: 'center' });
      }
    });
    y += 8 * cell + 2;
    // legend
    let lx = M;
    doc.text(lx, y + 6, 'Pain:', { size: 7.5, color: C.muted }); lx += 24;
    for (let p = 1; p <= PAIN_MAX; p++) {
      doc.rect(lx, y, 9, 9, { fill: painRgb(p, 1) });
      doc.text(lx + 12, y + 7.5, String(p), { size: 7, color: C.muted });
      lx += 24;
    }
    y += 22;
    void rowsNeeded;
  }

  /* ---- Medications ---- */
  if (eps.length) {
    heading('Medications', 'Acute medication taken during episodes', 80);
    if (!st.medications.length) {
      doc.text(M, y + 4, 'No medications recorded in this period.', { size: 9, color: C.muted });
      y += 18;
    } else {
      const cols = [['Medication', 150], ['Dose(s) recorded', 130], ['Episodes', 60], ['Days used', 60], ['Helped (rated uses)', W - 400]];
      const row = (vals, bold, fill) => {
        ensure(18);
        if (fill) doc.rect(M, y, W, 17, { fill });
        let x = M;
        vals.forEach((v, i) => { doc.text(x + 6, y + 11.5, v, { size: 8.3, bold, color: bold ? C.muted : C.ink, maxWidth: cols[i][1] - 10 }); x += cols[i][1]; });
        y += 17;
        doc.line(M, y, M + W, y, { color: C.rule });
      };
      row(cols.map((c) => c[0]), true, C.panel);
      for (const m of st.medications) {
        const doses = [...m.doses.entries()].sort((a, b) => b[1] - a[1]).map((d) => d[0]).slice(0, 3).join(', ') || '—';
        const helped = m.rated ? `${m.helped} of ${m.rated} (${Math.round((m.helped / m.rated) * 100)}%)` : 'Not rated';
        row([m.name, doses, String(m.episodes), String(m.days.size), helped]);
      }
      y += 8;
    }
  }

  /* ---- Patterns (two-column bar lists) ---- */
  if (eps.length) {
    heading('Patterns', `Share of the ${st.count} episodes in this period`, 150);
    const lists = [
      ['Possible causes', st.triggers], ['Symptoms', st.symptoms],
      ['Headache location', st.headLocation], ['Relief tried', st.relief],
      ['Time of day it started', st.timeOfDay], ['Time of day it ended', st.timeOfDayEnd, st.endedCount],
      ['Day of week', st.weekday], ['Migraine type', st.types],
      ['Where it started', st.attackLocations],
    ];
    const keepAll = new Set(['Time of day it started', 'Time of day it ended', 'Day of week']);
    const colW = (W - 20) / 2;
    const block = (x0, y0, title, entries, total = st.count) => {
      const rows = keepAll.has(title) ? entries : entries.filter((e) => e[1] > 0).slice(0, 8);
      doc.text(x0, y0 + 9, title, { size: 9.5, bold: true });
      if (!rows.length) { doc.text(x0, y0 + 24, 'Nothing recorded', { size: 8, color: C.faint }); return 34; }
      const max = Math.max(1, ...rows.map((r) => r[1]));
      const labelW = colW * 0.4, valW = 52, barW = colW - labelW - valW - 8;
      rows.forEach((r, i) => {
        const ry = y0 + 18 + i * 13;
        doc.text(x0, ry + 8, r[0], { size: 7.8, maxWidth: labelW - 4 });
        doc.rect(x0 + labelW, ry + 2.5, barW, 6, { fill: [0.92, 0.92, 0.94] });
        if (r[1]) doc.rect(x0 + labelW, ry + 2.5, Math.max(1.5, (r[1] / max) * barW), 6, { fill: C.accent });
        doc.text(x0 + colW, ry + 8, `${r[1]} (${total ? Math.round((r[1] / total) * 100) : 0}%)`, { size: 7.5, color: C.muted, align: 'right' });
      });
      return 18 + rows.length * 13 + 12;
    };
    for (let i = 0; i < lists.length; i += 2) {
      const est = (l) => (l ? 18 + Math.max(1, Math.min(8, l[1].filter((e) => e[1] > 0 || keepAll.has(l[0])).length)) * 13 + 12 : 0);
      ensure(Math.max(est(lists[i]), est(lists[i + 1])));
      const h1 = block(M, y, ...lists[i]);
      const h2 = lists[i + 1] ? block(M + colW + 20, y, ...lists[i + 1]) : 0;
      y += Math.max(h1, h2);
    }
  }

  /* ---- Questions / notes ---- */
  if (opts.questions && opts.questions.trim()) {
    heading('Questions and notes for my doctor');
    const lines = doc.wrap(opts.questions.trim(), W - 24, 9.5);
    let i = 0;
    while (i < lines.length) {
      ensure(30);
      const fitCount = Math.max(1, Math.min(lines.length - i, Math.floor((BOTTOM - y - 16) / 13)));
      doc.rect(M, y, W, fitCount * 13 + 14, { fill: C.panel, stroke: C.rule });
      for (let j = 0; j < fitCount; j++) doc.text(M + 12, y + 17 + j * 13, lines[i + j], { size: 9.5 });
      y += fitCount * 13 + 22;
      i += fitCount;
    }
  }

  /* ---- Episode log ---- */
  if (opts.includeLog && eps.length) {
    if (y > doc.H * 0.55) newPage();
    heading('Episode log', `${eps.length} episode${eps.length === 1 ? '' : 's'}, oldest first`, 80);
    const cols = [['Start date', 66], ['Duration', 44], ['Type', 70], ['Pain', 34], ['Location', 70], ['Symptoms', 88], ['Possible causes', 70], ['Medications', W - 442]];
    const fs = 7.3, lh = 9;
    const header = () => {
      doc.rect(M, y, W, 16, { fill: C.panel });
      let x = M;
      for (const [t, w] of cols) { doc.text(x + 4, y + 11, t, { size: 7.3, bold: true, color: C.muted }); x += w; }
      y += 16;
    };
    header();
    eps.forEach((e, idx) => {
      const pain = `${e.painMax ?? '–'} / ${e.painAvg ?? '–'}`;
      const meds = e.medications.map((m) => [m.name, m.dose, parseDT(m.date) ? `${fmtShort(parseDT(m.date))}${m.time ? ` ${m.time}` : ''}` : m.time && `@${m.time}`, m.effect && m.effect !== 'Not sure' ? `(${m.effect.toLowerCase()})` : ''].filter(Boolean).join(' ')).join('; ');
      const cells = [
        [fmtDate(e.start), ...(e.timeOfDay || e.timeOfDayEnd ? [`${e.timeOfDay || '?'} → ${e.end ? e.timeOfDayEnd || '?' : 'ongoing'}`] : [])],
        [e.end ? fmtDays(durationDays(e)) : 'Ongoing'],
        [e.type || '—'], [pain], [e.headLocation.join(', ') || '—'], [e.symptoms.join(', ') || '—'],
        [e.triggers.join(', ') || '—'], [meds || '—'],
      ].map((c, i) => c.flatMap((t) => doc.wrap(t, cols[i][1] - 8, fs)));
      const noteLines = e.notes ? doc.wrap(`Note: ${e.notes}`, W - 74, fs) : [];
      const rowLines = Math.max(...cells.map((c) => c.length));
      const h = rowLines * lh + 8 + (noteLines.length ? noteLines.length * lh + 2 : 0);
      if (y + h > BOTTOM) { newPage(); header(); }
      if (idx % 2 === 1) doc.rect(M, y, W, h, { fill: [0.985, 0.985, 0.99] });
      let x = M;
      cells.forEach((lines, i) => {
        if (i === 3 && e.painMax) doc.rect(x + 3, y + 3, cols[i][1] - 8, lh + 1, { fill: painRgb(e.painMax, 1) });
        lines.forEach((l, j) => doc.text(x + 4, y + 10 + j * lh, l, { size: fs, bold: i === 0 && j === 0, color: i === 0 && j > 0 ? C.muted : C.ink }));
        x += cols[i][1];
      });
      noteLines.forEach((l, j) => doc.text(M + 70, y + 10 + rowLines * lh + 2 + j * lh, l, { size: fs, color: C.muted }));
      y += h;
      doc.line(M, y, M + W, y, { color: C.rule });
    });
  }

  /* ---- Footers ---- */
  const total = doc.pages.length;
  doc.pages.forEach((p, i) => {
    doc.page = p;
    doc.text(M, doc.H - 28, 'Self-reported headache diary · Migraine Tracker for Obsidian', { size: 7, color: C.faint });
    doc.text(M + W, doc.H - 28, `Page ${i + 1} of ${total}`, { size: 7, color: C.faint, align: 'right' });
  });

  return doc.output();
}

class ReportModal extends Modal {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; }

  onOpen() {
    const { contentEl, modalEl } = this;
    const s = this.plugin.settings;
    modalEl.addClass('mt-modal', 'mt-report-modal');
    this.titleEl.setText('PDF report for your doctor');
    contentEl.createEl('p', { cls: 'mt-help', text: 'Summarises your migraines for a period: frequency, headache days, pain, medication use and effectiveness, triggers, symptoms, a calendar, and an optional episode-by-episode log.' });

    const today = new Date();
    let range = '90';
    const fromIn = createEl('input', { type: 'date', cls: 'mt-input' });
    const toIn = createEl('input', { type: 'date', cls: 'mt-input' });
    fromIn.value = dayKey(addDays(today, -89));
    toIn.value = dayKey(today);

    new Setting(contentEl).setName('Period').addDropdown((d) => d
      .addOptions({ 30: 'Last 30 days', 90: 'Last 3 months', 180: 'Last 6 months', 365: 'Last 12 months', all: 'All time', custom: 'Custom dates' })
      .setValue(range)
      .onChange((v) => { range = v; customRow.settingEl.toggle(v === 'custom'); }));
    const customRow = new Setting(contentEl).setName('From / to');
    customRow.controlEl.append(fromIn, toIn);
    customRow.settingEl.toggle(false);

    let name = s.reportName || '';
    new Setting(contentEl).setName('Name on report').setDesc('Optional').addText((t) => t.setValue(name).onChange((v) => { name = v; }));

    let includeLog = true;
    new Setting(contentEl).setName('Include episode log').setDesc('A table with every episode in the period.')
      .addToggle((t) => t.setValue(true).onChange((v) => { includeLog = v; }));

    contentEl.createDiv({ cls: 'mt-label', text: 'Questions or notes for your doctor (optional)' });
    const q = contentEl.createEl('textarea', { cls: 'mt-textarea', attr: { rows: 4, placeholder: 'e.g. Is my current preventive working? Are the triptans safe with my other medication?' } });

    const footer = contentEl.createDiv({ cls: 'mt-footer' });
    footer.createDiv({ cls: 'mt-spacer' });
    footer.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
    const go = footer.createEl('button', { text: 'Create PDF', cls: 'mod-cta' });
    go.onclick = async () => {
      let from, to = today;
      const all = this.plugin.getEpisodes();
      if (range === 'custom') {
        from = parseDT(fromIn.value); to = parseDT(toIn.value);
        if (!from || !to || to < from) { new Notice('Please choose a valid date range.'); return; }
      } else if (range === 'all') {
        from = all.length ? all.reduce((m, e) => (e.start < m ? e.start : m), all[0].start) : today;
      } else from = addDays(today, -(Number(range) - 1));
      go.disabled = true;
      go.setText('Creating…');
      try {
        if (name !== s.reportName) { s.reportName = name; await this.plugin.saveSettings(); }
        await this.plugin.createReport({ from, to, name: name.trim(), includeLog, questions: q.value });
        this.close();
      } catch (err) {
        console.error('[Migraine Tracker]', err);
        new Notice(`Couldn't create the report: ${err.message}`);
        go.disabled = false;
        go.setText('Create PDF');
      }
    };
  }
  onClose() { this.contentEl.empty(); }
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

class MigraineTrackerPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new DashboardView(leaf, this));

    this.addRibbonIcon('brain', 'Migraine dashboard', () => this.activateDashboard());
    this.addRibbonIcon('circle-plus', 'Log a migraine', () => new EpisodeModal(this).open());

    this.addCommand({ id: 'log-migraine', name: 'Log a migraine', callback: () => new EpisodeModal(this).open() });
    this.addCommand({ id: 'open-dashboard', name: 'Open dashboard', callback: () => this.activateDashboard() });
    this.addCommand({
      id: 'end-ongoing-migraine',
      name: 'End ongoing migraine now',
      checkCallback: (checking) => {
        const ongoing = this.getEpisodes().filter((e) => !e.end).sort((a, b) => b.start - a.start);
        if (!ongoing.length) return false;
        if (!checking) this.endEpisode(ongoing[0]);
        return true;
      },
    });
    this.addCommand({
      id: 'edit-current-episode',
      name: 'Edit this migraine episode',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const ep = file && this.episodeFromFile(file);
        if (!ep) return false;
        if (!checking) new EpisodeModal(this, ep).open();
        return true;
      },
    });
    this.addCommand({ id: 'pdf-report', name: 'Create PDF report for doctor', callback: () => new ReportModal(this).open() });
    this.addCommand({ id: 'export-csv', name: 'Export episodes to CSV', callback: () => this.exportCsv() });

    this.addSettingTab(new MigraineSettingTab(this.app, this));

    // Keep the dashboard in sync with the vault
    this.refreshTimer = null;
    const refresh = () => {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => { this.refreshViews(); this.updateStatusBar(); }, 300);
    };
    this.registerEvent(this.app.metadataCache.on('changed', refresh));
    this.registerEvent(this.app.vault.on('delete', refresh));
    this.registerEvent(this.app.vault.on('rename', refresh));
    this.registerEvent(this.app.metadataCache.on('resolved', refresh));

    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass('mt-status');
    this.statusBar.onclick = () => this.activateDashboard();
    this.registerInterval(window.setInterval(() => this.updateStatusBar(), 60000));
    this.app.workspace.onLayoutReady(() => this.updateStatusBar());
  }

  onunload() { clearTimeout(this.refreshTimer); }

  async loadSettings() {
    const data = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    for (const [key] of LIST_SETTINGS) {
      if (!Array.isArray(this.settings[key])) this.settings[key] = [...DEFAULT_SETTINGS[key]];
    }
    PAIN_MAX = this.settings.painScale === 10 ? 10 : 5;
  }
  async saveSettings() {
    PAIN_MAX = this.settings.painScale === 10 ? 10 : 5;
    await this.saveData(this.settings);
    this.refreshViews();
  }

  episodeFromFile(file) {
    if (!(file instanceof TFile) || file.extension !== 'md') return null;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return parseEpisode(file, fm);
  }

  getEpisodes() {
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const ep = this.episodeFromFile(f);
      if (ep) out.push(ep);
    }
    return out;
  }

  async ensureFolder(path) {
    const p = normalizePath(path);
    if (!p || p === '/') return;
    if (this.app.vault.getAbstractFileByPath(p)) return;
    const parts = p.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const sub = parts.slice(0, i).join('/');
      if (!this.app.vault.getAbstractFileByPath(sub)) await this.app.vault.createFolder(sub);
    }
  }

  async createEpisode(ep) {
    const folder = normalizePath(this.settings.folder || DEFAULT_SETTINGS.folder);
    await this.ensureFolder(folder);
    const d = ep.start;
    const base = `Migraine ${dayKey(d)}`;
    let path = normalizePath(`${folder}/${base}.md`);
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${folder}/${base} (${i}).md`);
    const fm = stringifyYaml(episodeToFrontmatter(ep));
    const body = `# Migraine — ${fmtDate(d)}\n\n` +
      `> Logged with Migraine Tracker. Use **Migraine Tracker: Edit this migraine episode** from the command palette to change the details, or write extra notes below.\n\n`;
    const file = await this.app.vault.create(path, `---\n${fm}---\n\n${body}`);
    return file;
  }

  async updateEpisode(file, ep) {
    const data = episodeToFrontmatter(ep);
    await this.app.fileManager.processFrontMatter(file, (fm) => { Object.assign(fm, data); });
  }

  async endEpisode(ep) {
    const end = startOfDay(new Date());
    if (end < ep.start) { new Notice('That episode starts in the future — edit it instead.'); return; }
    await this.app.fileManager.processFrontMatter(ep.file, (fm) => { fm.end = toDateValue(end); });
    new Notice(`Migraine ended — lasted ${fmtDays(spanDays(ep.start, end))}.`);
  }

  async exportCsv() {
    const eps = this.getEpisodes();
    if (!eps.length) { new Notice('No episodes to export yet.'); return; }
    const folder = normalizePath(this.settings.folder || DEFAULT_SETTINGS.folder);
    await this.ensureFolder(folder);
    const path = normalizePath(`${folder}/Migraine export ${dayKey(new Date())}.csv`);
    const csv = episodesToCsv(eps);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await this.app.vault.modify(existing, csv);
    else await this.app.vault.create(path, csv);
    new Notice(`Exported ${eps.length} episodes to ${path}`);
  }

  async createReport(opts) {
    const bytes = buildDoctorReport(this.getEpisodes(), this.settings, opts);
    const folder = normalizePath(`${this.settings.folder || DEFAULT_SETTINGS.folder}/Reports`);
    await this.ensureFolder(folder);
    const path = normalizePath(`${folder}/Migraine report ${dayKey(opts.from)} to ${dayKey(opts.to)}.pdf`);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const existing = this.app.vault.getAbstractFileByPath(path);
    let file;
    if (existing instanceof TFile) { await this.app.vault.modifyBinary(existing, buf); file = existing; }
    else file = await this.app.vault.createBinary(path, buf);
    new Notice(`Report saved to ${path}`);
    await this.app.workspace.getLeaf('tab').openFile(file);
    return file;
  }

  async activateDashboard() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof DashboardView) leaf.view.render();
    }
  }

  updateStatusBar() {
    if (!this.statusBar) return;
    const ongoing = this.settings.showStatusBar ? this.getEpisodes().filter((e) => !e.end) : [];
    if (!ongoing.length) { this.statusBar.empty(); this.statusBar.hide(); return; }
    const ep = ongoing.sort((a, b) => b.start - a.start)[0];
    this.statusBar.show();
    this.statusBar.setText(`Migraine: day ${spanDays(ep.start, new Date())}`);
    this.statusBar.setAttr('aria-label', 'Migraine in progress — open dashboard');
  }
}

module.exports = MigraineTrackerPlugin;
module.exports.default = MigraineTrackerPlugin;
// Exposed for testing only
module.exports._internals = { buildDoctorReport, setPainMax: (n) => { PAIN_MAX = n; }, DashboardView, EpisodeModal, parseEpisode, computeStats, episodesToCsv, episodeToFrontmatter, parseDT, fmtDays, durationDays, medDayKey, deriveTimeOfDay, medToString, parseMed };
