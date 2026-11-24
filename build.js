// Assembles health-dashboard/main.js from the two tracker sources plus hub.js
const fs = require('fs');
const path = require('path');
const [periodDir, migraineDir, outDir] = process.argv.slice(2);

function patch(src, from, to, label) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error('Patch "' + label + '" matched ' + n + ' times');
  return src.replace(from, () => to);
}

let period = fs.readFileSync(path.join(periodDir, 'main.js'), 'utf8');
period = patch(period,
  'module.exports._internals = { analyze, summarize, buildReport, toDayNum, fromDayNum, todayNum, addMonths };',
  'module.exports._internals = { analyze, summarize, buildReport, toDayNum, fromDayNum, todayNum, addMonths,\n  DashboardRenderer, LogModal, ReportModal, VIEW_TYPE, FLOW_LABEL, fmtDate, fmtShort, plural };',
  'period internals');

function replaceRange(src, startMarker, endMarker, to, label) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  if (a < 0 || b < 0 || src.indexOf(startMarker, a + 1) >= 0) throw new Error('Range patch "' + label + '" failed');
  return src.slice(0, a) + to + src.slice(b);
}
period = replaceRange(period,
  "    new Setting(c).setName('Tracking options').setHeading();",
  "  }\n}\n\n/* ------------------------------------------------------------------ */\n/* Plugin",
  "    new Setting(c).setName('Choice lists').setHeading();\n" +
  "    c.createEl('p', { cls: 'setting-item-description', text: 'Symptoms, medications, flow names and pain level names are edited under Settings → Health Dashboard → Selectors.' });\n",
  'period list settings → pointer');
period = patch(period,
  "    this.chips('Medication', 'medications', s.medications);",
  "    // Medications from the Medications tracker come first, then this tracker's own list\n" +
  "    const medList = (this.plugin.medOptions ? this.plugin.medOptions() : []).slice();\n" +
  "    for (const m of s.medications) if (!hasItem(medList, m)) medList.push(m);\n" +
  "    this.chips('Medication', 'medications', medList);",
  'period medication choices');
period = patch(period,
  'DashboardRenderer, LogModal, ReportModal, VIEW_TYPE, FLOW_LABEL,',
  'DashboardRenderer, LogModal, ReportModal, VIEW_TYPE, FLOW_LABEL, FLOWS, PAIN_LABELS, DEFAULT_SETTINGS, toList, getPainMax: () => PAIN_MAX, PAIN_SEVERE,',
  'period internals 2');

// The name on reports is set once in Health Dashboard settings
period = patch(period,
  "    new Setting(c).setName('Default name on report').addText((t) => t.setValue(s.reportName).onChange(async (v) => { s.reportName = v; await save(); }));\n",
  '',
  'period: name set in Health Dashboard');
// Extra report sections (records without an exact date, general notes) supplied by Health Dashboard
period = patch(period,
  "  /* Footers */\n  const total = pdf.pages.length;",
  "  /* Extra sections from Health Dashboard */\n" +
  "  for (const sec of opts.extraSections || []) {\n" +
  "    section(sec.title, 60);\n" +
  "    if (sec.intro) { para(sec.intro, { size: 8, color: GREY }); y += 4; }\n" +
  "    if (sec.rows && sec.rows.length) table(sec.cols.map((c, i) => ({ t: c.label, w: i === sec.cols.length - 1 ? 0 : Math.round(c.w * CW) })), sec.rows);\n" +
  "    else if (sec.empty) para(sec.empty, { size: 9, color: GREY });\n" +
  "  }\n\n" +
  "  /* Footers */\n  const total = pdf.pages.length;",
  'period report extra sections');
period = patch(period,
  "    const bytes = buildReport(a, Object.assign({ showPredictions: this.settings.showPredictions }, o));",
  "    const extra = this.reportExtras ? this.reportExtras({ from: fromDayNum(o.from), to: fromDayNum(o.to), includeNotes: o.includeGenNotes !== false, includeMissed: o.includeMissed !== false }) : [];\n" +
  "    const bytes = buildReport(a, Object.assign({ showPredictions: this.settings.showPredictions, extraSections: extra }, o));",
  'period report passes extras');
period = patch(period,
  "    new Setting(c).setName('Include notes').setDesc('Adds your free-text notes to the daily log.').addToggle((t) => t.setValue(o.includeNotes).onChange((v) => { o.includeNotes = v; }));\n",
  "    new Setting(c).setName('Include notes').setDesc('Adds your free-text notes to the daily log.').addToggle((t) => t.setValue(o.includeNotes).onChange((v) => { o.includeNotes = v; }));\n" +
  "    if (p.reportExtras) {\n" +
  "      o.includeMissed = true; o.includeGenNotes = true;\n" +
  "      new Setting(c).setName('Include periods without an exact date').setDesc('Missed periods you logged with only a month or a rough time. They are listed separately and never counted in the statistics.').addToggle((t) => t.setValue(true).onChange((v) => { o.includeMissed = v; }));\n" +
  "      new Setting(c).setName('Include general notes').setDesc('Your period notes from this date range.').addToggle((t) => t.setValue(true).onChange((v) => { o.includeGenNotes = v; }));\n" +
  "    }\n",
  'period report dialog toggles');

let migraine = fs.readFileSync(path.join(migraineDir, 'main.js'), 'utf8');
migraine = patch(migraine,
  "    new Setting(containerEl)\n      .setName('Name on reports')\n      .setDesc('Optional. Printed at the top of PDF reports for your doctor.')\n      .addText((t) => t.setValue(s.reportName || '').setPlaceholder('Your name').onChange(async (v) => { s.reportName = v; await this.plugin.saveSettings(); }));\n\n",
  '',
  'migraine: name set in Health Dashboard');
migraine = patch(migraine,
  "        if (name !== s.reportName) { s.reportName = name; await this.plugin.saveSettings(); }\n",
  '',
  'migraine: report dialog name is one-off');
migraine = patch(migraine,
  "  /* ---- Footers ---- */\n  const total = doc.pages.length;",
  "  /* ---- Extra sections from Health Dashboard ---- */\n" +
  "  for (const sec of opts.extraSections || []) {\n" +
  "    heading(sec.title, sec.sub || '', 60);\n" +
  "    if (sec.intro) { for (const l of doc.wrap(sec.intro, W, 8.5)) { ensure(12); doc.text(M, y + 9, l, { size: 8.5, color: C.muted }); y += 12; } y += 4; }\n" +
  "    if (!sec.rows || !sec.rows.length) { if (sec.empty) { ensure(16); doc.text(M, y + 10, sec.empty, { size: 9, color: C.muted }); y += 20; } continue; }\n" +
  "    const widths = sec.cols.map((c) => c.w * W), fs = 8, lh = 10;\n" +
  "    const head = () => { doc.rect(M, y, W, 16, { fill: C.panel }); let x = M; sec.cols.forEach((c, i) => { doc.text(x + 4, y + 11, c.label, { size: 7.5, bold: true, color: C.muted }); x += widths[i]; }); y += 16; };\n" +
  "    ensure(40); head();\n" +
  "    sec.rows.forEach((r) => {\n" +
  "      const cells = r.map((v, i) => doc.wrap(String(v == null ? '' : v), widths[i] - 8, fs));\n" +
  "      const h = Math.max(1, ...cells.map((c) => c.length)) * lh + 6;\n" +
  "      if (y + h > BOTTOM) { newPage(); head(); }\n" +
  "      let x = M;\n" +
  "      cells.forEach((ls, i) => { ls.forEach((l, j) => doc.text(x + 4, y + 10 + j * lh, l, { size: fs })); x += widths[i]; });\n" +
  "      y += h;\n" +
  "      doc.line(M, y, M + W, y, { color: C.rule });\n" +
  "    });\n" +
  "    y += 12;\n" +
  "  }\n\n" +
  "  /* ---- Footers ---- */\n  const total = doc.pages.length;",
  'migraine report extra sections');
migraine = patch(migraine,
  "    const bytes = buildDoctorReport(this.getEpisodes(), this.settings, opts);",
  "    const extra = this.reportExtras ? this.reportExtras({ from: dayKey(opts.from), to: dayKey(opts.to), includeNotes: opts.includeGenNotes !== false, includeMissed: opts.includeMissed !== false }) : [];\n" +
  "    const bytes = buildDoctorReport(this.getEpisodes(), this.settings, Object.assign({}, opts, { extraSections: extra }));",
  'migraine report passes extras');
migraine = patch(migraine,
  "    let includeLog = true;\n    new Setting(contentEl).setName('Include episode log').setDesc('A table with every episode in the period.')\n      .addToggle((t) => t.setValue(true).onChange((v) => { includeLog = v; }));\n",
  "    let includeLog = true;\n    new Setting(contentEl).setName('Include episode log').setDesc('A table with every episode in the period.')\n      .addToggle((t) => t.setValue(true).onChange((v) => { includeLog = v; }));\n" +
  "    let includeMissed = true, includeGenNotes = true;\n" +
  "    if (this.plugin.reportExtras) {\n" +
  "      new Setting(contentEl).setName('Include migraines without an exact date').setDesc('Missed migraines you logged with only a month or a rough time. They are listed separately and never counted in the statistics.').addToggle((t) => t.setValue(true).onChange((v) => { includeMissed = v; }));\n" +
  "      new Setting(contentEl).setName('Include general notes').setDesc('Your migraine notes from this date range.').addToggle((t) => t.setValue(true).onChange((v) => { includeGenNotes = v; }));\n" +
  "    }\n",
  'migraine report dialog toggles');
migraine = patch(migraine,
  "        await this.plugin.createReport({ from, to, name: name.trim(), includeLog, questions: q.value });",
  "        await this.plugin.createReport({ from, to, name: name.trim(), includeLog, includeMissed, includeGenNotes, questions: q.value });",
  'migraine report dialog passes toggles');
// Medications from the Medications tracker in the typeahead, with dose suggested from strength
migraine = patch(migraine,
  '    for (const m of s.medications) dl.createEl(\'option\', { attr: { value: m } });',
  '    const medNames = (this.plugin.medOptions ? this.plugin.medOptions() : []).slice();\n' +
  '    for (const m of s.medications) if (!medNames.includes(m)) medNames.push(m);\n' +
  '    for (const m of medNames) dl.createEl(\'option\', { attr: { value: m } });',
  'migraine medication choices');
migraine = patch(migraine,
  "    const rec = { row, name, dose, date, time, effect };",
  "    name.addEventListener('change', () => { if (!dose.value && this.plugin.medInfo) { const i = this.plugin.medInfo(name.value.trim()); if (i && i.strength) dose.value = i.strength; } });\n" +
  "    const rec = { row, name, dose, date, time, effect };",
  'migraine dose from medications tracker');
migraine = patch(migraine,
  "      remember('medications', ep.medications.map((m) => m.name));",
  "      const tracked = this.plugin.medOptions ? this.plugin.medOptions() : [];\n" +
  "      remember('medications', ep.medications.map((m) => m.name).filter((n) => !tracked.includes(n)));",
  'migraine do not copy tracked medications');
// Customizable "time of day" lists
migraine = patch(migraine,
  "const MED_EFFECTS = ['Not sure', 'No relief', 'Some relief', 'Full relief'];",
  "const MED_EFFECTS = ['Not sure', 'No relief', 'Some relief', 'Full relief'];\n" +
  "const DEFAULT_TOD = TIME_OF_DAY.map((t) => ({ ...t }));\n" +
  "const DEFAULT_TOD_END = TIME_OF_DAY_END.map((t) => ({ ...t }));\n" +
  "/** Replace the time-of-day options in place with the lists from settings. */\n" +
  "function applyTimeLists(s) {\n" +
  "  const hints = new Map([...DEFAULT_TOD, ...DEFAULT_TOD_END].map((t) => [t.value, t.hint]));\n" +
  "  const make = (list) => list.map((v) => ({ value: v, hint: hints.get(v) || '' }));\n" +
  "  TIME_OF_DAY.splice(0, TIME_OF_DAY.length, ...make(s.timeOfDay));\n" +
  "  TIME_OF_DAY_END.splice(0, TIME_OF_DAY_END.length, ...make(s.timeOfDayEnd));\n" +
  "}",
  'migraine time lists');
migraine = patch(migraine,
  '  headLocations: [\n',
  '  timeOfDay: TIME_OF_DAY.map((t) => t.value),\n  timeOfDayEnd: TIME_OF_DAY_END.map((t) => t.value),\n  headLocations: [\n',
  'migraine default time lists');
migraine = patch(migraine,
  "  ['headLocations', 'Headache locations'],\n",
  "  ['headLocations', 'Headache locations'],\n  ['timeOfDay', 'Time of day it started'],\n  ['timeOfDayEnd', 'Time of day it ended'],\n",
  'migraine LIST_SETTINGS');
migraine = patch(migraine,
  'if (!Array.isArray(this.settings[key])) this.settings[key] = [...DEFAULT_SETTINGS[key]];',
  'this.settings[key] = Array.isArray(this.settings[key]) ? [...this.settings[key]] : [...DEFAULT_SETTINGS[key]];',
  'migraine copy lists on load');
migraine = patch(migraine,
  '    PAIN_MAX = this.settings.painScale === 10 ? 10 : 5;\n  }\n  async saveSettings() {\n',
  '    PAIN_MAX = this.settings.painScale === 10 ? 10 : 5;\n    applyTimeLists(this.settings);\n  }\n  async saveSettings() {\n    applyTimeLists(this.settings);\n',
  'migraine apply time lists');
migraine = replaceRange(migraine,
  "    new Setting(containerEl).setName('Choice lists').setHeading()",
  "  }\n}\n\n/* ------------------------------------------------------------------ */\n/* Minimal PDF writer",
  "    new Setting(containerEl).setName('Choice lists').setHeading();\n" +
  "    containerEl.createEl('p', { cls: 'setting-item-description', text: 'Migraine types, medications, symptoms, triggers, relief, locations and time-of-day options are edited under Settings → Health Dashboard → Selectors.' });\n",
  'migraine list settings → pointer');
migraine = patch(migraine,
  'const root = this.containerEl.children[1];',
  'const root = this.rootEl || this.containerEl.children[1];',
  'migraine embeddable root');
migraine = patch(migraine,
  '      if (leaf.view instanceof DashboardView) leaf.view.render();\n    }\n  }',
  '      if (leaf.view instanceof DashboardView) leaf.view.render();\n    }\n    if (this.onRefresh) this.onRefresh();\n  }',
  'migraine refresh hook');
migraine = patch(migraine,
  'module.exports._internals = { buildDoctorReport,',
  'module.exports._internals = { episodeDayKeys, dayKey, painColor, getPainMax: () => PAIN_MAX, fmtDate, spanDays, startOfDay, ReportModal, VIEW_TYPE,\n  DEFAULT_SETTINGS, asArray, TIME_OF_DAY, TIME_OF_DAY_END, ChipSelect, PdfDoc, hexRgb, painRgb, painLabel, hadAura, PAIN_WORDS, fmtDays, durationDays, parseDT,\n  buildDoctorReport,',
  'migraine internals');

/* ---- Pain words: 0 No pain, 1 Very mild, 2 Mild, 3 Moderate, 4 Severe, 5 Very severe (0–10 scale maps two points per word) ---- */
migraine = patch(migraine,
  "function painLabel(v) {\n  if (!v) return 'None';\n  const r = v / PAIN_MAX;\n  return r <= 0.4 ? 'Mild' : r <= 0.6 ? 'Moderate' : 'Severe';\n}",
  "const PAIN_WORDS = ['No pain', 'Very mild', 'Mild', 'Moderate', 'Severe', 'Very severe'];\n" +
  "function painLabel(v) {\n  const n = Number(v) || 0;\n  if (n <= 0) return PAIN_WORDS[0];\n" +
  "  const i = PAIN_MAX === 5 ? Math.round(n) : Math.ceil((n * 5) / PAIN_MAX);\n  return PAIN_WORDS[Math.max(1, Math.min(5, i))];\n}",
  'migraine pain words');
migraine = patch(migraine,
  "legend.createSpan({ cls: 'mt-legend-label', text: 'Mild' });",
  "legend.createSpan({ cls: 'mt-legend-label', text: painLabel(1) });", 'migraine legend low');
migraine = patch(migraine,
  "legend.createSpan({ cls: 'mt-legend-label', text: 'Severe' });",
  "legend.createSpan({ cls: 'mt-legend-label', text: painLabel(PAIN_MAX) });", 'migraine legend high');
/* ---- Aura: an episode had an aura when "Visual aura" (or any symptom naming an aura) was logged, or its type is "with aura" ---- */
migraine = patch(migraine,
  "  // Max pain histogram\n",
  "  const auraCount = eps.filter(hadAura).length;\n  // Max pain histogram\n", 'migraine aura count');
migraine = patch(migraine,
  "function painLabel(v) {",
  "/** True when the episode had an aura: a symptom such as \"Visual aura\", or a type such as \"Migraine with aura\". */\n" +
  "function hadAura(e) {\n  const named = (t) => /\\baura\\b/i.test(String(t || '')) && !/\\b(without|no)\\b/i.test(String(t || ''));\n" +
  "  return (e.symptoms || []).some(named) || named(e.type);\n}\nfunction painLabel(v) {", 'migraine hadAura');
migraine = patch(migraine,
  "    avgPainMax: mean(painMax),",
  "    avgPainMax: mean(painMax),\n    auraCount,", 'migraine aura stat');
migraine = patch(migraine,
  "    const medTile = tile('Acute-med days',",
  "    tile('With aura', String(st.auraCount), st.count ? `${Math.round((st.auraCount / st.count) * 100)}% of ${st.count} episode${st.count === 1 ? '' : 's'}` : '');\n    const medTile = tile('Acute-med days',",
  'migraine aura tile');
/* ---- Patterns: show the number each percentage is based on ---- */
migraine = patch(migraine,
  "    this.cardTitle(card, title, total ? `% of ${total} ${opts.ended ? 'ended ' : ''}episode${total === 1 ? '' : 's'}` : '');",
  "    this.cardTitle(card, title, total ? `Episodes · % of ${total} ${opts.ended ? 'ended ' : ''}episode${total === 1 ? '' : 's'}` : '');",
  'migraine hbars subtitle');
migraine = patch(migraine,
  "      row.createDiv({ cls: 'mt-hbar-val', text: `${count} · ${total ? Math.round((count / total) * 100) : 0}%` });",
  "      row.createDiv({ cls: 'mt-hbar-val', text: total ? `${count} of ${total} · ${Math.round((count / total) * 100)}%` : String(count),\n" +
  "        attr: { title: total ? `${label}: ${count} of ${total} ${opts.ended ? 'ended ' : ''}episode${total === 1 ? '' : 's'} (${Math.round((count / total) * 100)}%)` : `${label}: ${count}` } });",
  'migraine hbars value');
migraine = patch(migraine,
  "    this.cardTitle(card, 'Medications', 'Episodes used · how often it helped');",
  "    this.cardTitle(card, 'Medications', 'Bar: episodes used · helped of rated uses');",
  'migraine med subtitle');
migraine = patch(migraine,
  "      const helped = m.rated ? `${Math.round((m.helped / m.rated) * 100)}% helped` : 'not rated';\n" +
  "      row.createDiv({ cls: 'mt-hbar-val', text: `${m.episodes} · ${helped}`, attr: { title: m.rated ? `Helped in ${m.helped} of ${m.rated} rated uses` : 'Effect not rated yet' } });",
  "      const pct = m.rated ? Math.round((m.helped / m.rated) * 100) : 0;\n" +
  "      row.createDiv({ cls: 'mt-hbar-val', text: m.rated ? `${m.helped} of ${m.rated} rated · ${pct}%` : 'not rated',\n" +
  "        attr: { title: `${m.name}: used in ${m.episodes} episode${m.episodes === 1 ? '' : 's'}. ` + (m.rated ? `Effect rated ${m.rated} time${m.rated === 1 ? '' : 's'}; helped ${m.helped} time${m.helped === 1 ? '' : 's'} (${pct}%).` : 'Effect not rated yet.') } });",
  'migraine med value');

/* ---- Period reference ranges: a choice between published standards, or your own ---- */
period = patch(period, "  countSpotting: false,\n", "  countSpotting: false,\n  refStandard: 'nih',\n  refMin: 21, refMax: 35, refMaxLen: 7, refMaxVar: 7,\n", 'period ref defaults');
period = patch(period, "const PAIN_SEVERE = 4;\n",
  "const PAIN_SEVERE = 4;\n" +
  "/* Reference ranges used for flags and the shaded band. NIH/CDC: cycles 21–35 days, bleeding over 7 days flagged.\n" +
  "   FIGO 2018: cycles 24–38 days, bleeding up to 8 days, cycle-to-cycle variation up to 7–9 days. */\n" +
  "const REF_STANDARDS = {\n" +
  "  nih: { id: 'nih', name: 'US (NIH and CDC)', min: 21, max: 35, maxLen: 7, maxVar: 7 },\n" +
  "  figo: { id: 'figo', name: 'FIGO 2018 (international)', min: 24, max: 38, maxLen: 8, maxVar: 7 },\n" +
  "};\n" +
  "const REFS = Object.assign({}, REF_STANDARDS.nih);\n" +
  "function applyRefs(s) {\n  const st = s && REF_STANDARDS[s.refStandard];\n" +
  "  if (st) Object.assign(REFS, st);\n" +
  "  else if (s && s.refStandard === 'custom') Object.assign(REFS, { id: 'custom', name: 'Your own ranges', min: +s.refMin || 21, max: +s.refMax || 35, maxLen: +s.refMaxLen || 7, maxVar: +s.refMaxVar || 7 });\n" +
  "  else Object.assign(REFS, REF_STANDARDS.nih);\n  return REFS;\n}\n", 'period refs');
period = patch(period, "  const isBleeding = (e) => !!e && (FLOW_SCORE[e.flow] >= 2 || (s.countSpotting && e.flow === 'spotting'));\n",
  "  applyRefs(s);\n  const isBleeding = (e) => !!e && (FLOW_SCORE[e.flow] >= 2 || (s.countSpotting && e.flow === 'spotting'));\n", 'period apply refs');
period = patch(period,
  "  const short = cycles.filter((c) => c.len < 21);\n  const long = cycles.filter((c) => c.len > 35);\n  const longP = periods.filter((p) => p.length > 7);\n" +
  "  if (short.length) flags.push(plural(short.length, 'cycle') + ' shorter than 21 days ('",
  "  const short = cycles.filter((c) => c.len < REFS.min);\n  const long = cycles.filter((c) => c.len > REFS.max);\n  const longP = periods.filter((p) => p.length > REFS.maxLen);\n" +
  "  if (short.length) flags.push(plural(short.length, 'cycle') + ' shorter than ' + REFS.min + ' days ('", 'period flags 1');
period = patch(period, "  if (long.length) flags.push(plural(long.length, 'cycle') + ' longer than 35 days ('",
  "  if (long.length) flags.push(plural(long.length, 'cycle') + ' longer than ' + REFS.max + ' days ('", 'period flags 2');
period = patch(period, "  if (longP.length) flags.push(plural(longP.length, 'period') + ' lasting more than 7 days ('",
  "  if (longP.length) flags.push(plural(longP.length, 'period') + ' lasting more than ' + REFS.maxLen + ' days ('", 'period flags 3');
period = patch(period, "  if (lens.length >= 3 && st.maxCycle - st.minCycle > 7) flags.push(",
  "  if (lens.length >= 3 && st.maxCycle - st.minCycle > REFS.maxVar) flags.push(", 'period flags 4');
period = patch(period, "    svgEl('rect', { x: L, y: Y(35), width: cw, height: Y(21) - Y(35), class: 'pt-band' }, svg);",
  "    svgEl('rect', { x: L, y: Y(REFS.max), width: cw, height: Y(REFS.min) - Y(REFS.max), class: 'pt-band' }, svg);", 'period band');
period = patch(period, "      const out = c.cycleLength < 21 || c.cycleLength > 35;\n      const r = svgEl(",
  "      const out = c.cycleLength < REFS.min || c.cycleLength > REFS.max;\n      const r = svgEl(", 'period bar out');
period = patch(period, "text: 'Shaded band: 21-35 days (common adult range). Orange bars fall outside it.' });",
  "text: 'Shaded band: ' + REFS.min + '–' + REFS.max + ' days (' + REFS.name + '). Orange bars fall outside it. Change the ranges in Period settings.' });", 'period band note');
// Layout: cycle chart spans two columns beside the calendar; symptoms go below it, next to patterns
period = patch(period, "    const box = grid.createDiv({ cls: 'pt-card' });\n    box.createEl('h4', { text: 'Cycle length' });",
  "    const box = grid.createDiv({ cls: 'pt-card pt-card-cycle' });\n    box.createEl('h4', { text: 'Cycle length' });", 'period cycle card class');
period = patch(period, "    const box = grid.createDiv({ cls: 'pt-card' });\n    box.createEl('h4', { text: 'Symptoms · last 6 months' });",
  "    const box = grid.createDiv({ cls: 'pt-card pt-card-symptoms' });\n    box.createEl('h4', { text: 'Symptoms · last 6 months' });", 'period symptoms card class');
period = patch(period, "    const box = grid.createDiv({ cls: 'pt-card' });\n    box.createEl('h4', { text: 'Patterns · last 12 months' });",
  "    const box = grid.createDiv({ cls: 'pt-card pt-card-patterns' });\n    box.createEl('h4', { text: 'Patterns · last 12 months' });", 'period patterns card class');
period = patch(period, "const VW = 600, VH = 230, L = 34, R = 10, T = 16, B = 34,", "const VW = 900, VH = 340, L = 34, R = 10, T = 16, B = 34,", 'period cycle chart wider');
period = patch(period, "      svgEl('title', {}, r).textContent = fmtDate(c.start) + ': ' + c.cycleLength + ' days';",
  "      svgEl('title', {}, r).textContent = 'Cycle from ' + fmtDate(c.start) + ': ' + c.cycleLength + ' days' + (out ? ' (outside ' + REFS.min + '–' + REFS.max + ')' : '');", 'period cycle tip');
period = patch(period, "text: 'No cycles outside 21-35 days, no periods over 7 days and no severe pain recorded.' });",
  "text: 'No cycles outside ' + REFS.min + '–' + REFS.max + ' days, no periods over ' + REFS.maxLen + ' days and no severe pain recorded.' });", 'period no flags');
period = patch(period,
  "    new Setting(c).setName('Show period predictions')",
  "    new Setting(c).setName('Reference ranges').setDesc('Used to flag cycles and periods outside the usual range. US (NIH and CDC): cycles 21–35 days, periods over 7 days flagged. FIGO 2018: cycles 24–38 days, periods over 8 days flagged. Both flag cycles that vary by more than 7 days.')\n" +
  "      .addDropdown((d) => d.addOptions({ nih: 'US (NIH and CDC): 21–35 days', figo: 'FIGO 2018: 24–38 days', custom: 'My own ranges' }).setValue(s.refStandard || 'nih').onChange(async (v) => { s.refStandard = v; applyRefs(s); await save(); this.display(); }));\n" +
  "    if (s.refStandard === 'custom') {\n" +
  "      const num = (name, key, lo, hi) => new Setting(c).setName(name).addText((t) => { t.inputEl.type = 'number'; t.setValue(String(s[key])).onChange(async (v) => { const n = parseInt(v, 10); if (n >= lo && n <= hi) { s[key] = n; applyRefs(s); await save(); } }); });\n" +
  "      num('Shortest usual cycle (days)', 'refMin', 10, 40); num('Longest usual cycle (days)', 'refMax', 20, 90);\n" +
  "      num('Longest usual period (days)', 'refMaxLen', 3, 15); num('Most cycle-to-cycle variation (days)', 'refMaxVar', 2, 30);\n" +
  "    }\n" +
  "    new Setting(c).setName('Show period predictions')", 'period ref setting');
period = patch(period, "module.exports._internals = { analyze, summarize,", "module.exports._internals = { REFS, REF_STANDARDS, applyRefs, PAIN_SEVERE, analyze, summarize,", 'period export refs');
period = patch(period, "  getAnalysis() {\n    const t = todayNum();\n", "  getAnalysis() {\n    const t = todayNum();\n    applyRefs(this.settings); // ranges can change without new data\n", 'period refs on every analysis');
/* ---- Migraine: explain the acute-medication alert level ---- */
migraine = patch(migraine, ".setDesc('Highlight when you’ve taken acute medication on at least this many days in the last 30.')",
  ".setDesc('Highlight when you’ve taken acute medication on at least this many days in the last 30. The International Classification of Headache Disorders (ICHD-3) uses 10 days a month for triptans, ergots, opioids and combination painkillers (such as Excedrin), and 15 days for simple painkillers alone (such as ibuprofen or paracetamol). Use 10 if you take any of the first group.')", 'migraine overuse desc');

// Pain on the first two days of each period, beside the average over all bleeding days
period = patch(period, "    avgPain: pains.length ? mean(pains) : null,",
  "    avgPain: pains.length ? mean(pains) : null,\n    avgPainFirst2: (() => { const v = entries.filter((e) => e.pain != null && periods.some((p) => e.day >= p.start && e.day <= p.start + 1)).map((e) => e.pain); return v.length ? mean(v) : null; })(),", 'period first-two-days pain');
period = patch(period, "    if (sum.avgPain != null) box.createEl('p', { cls: 'pt-muted pt-small', text: 'Average pain on bleeding days: ' + round1(sum.avgPain) + '/' + PAIN_MAX + ' (' + painWord(Math.round(sum.avgPain)) + ').' });",
  "    if (sum.avgPain != null || sum.avgPainFirst2 != null) {\n      const pg = box.createDiv({ cls: 'pt-pain-stats' });\n      for (const [label, v, sub] of [['Average pain', sum.avgPain, 'All bleeding days'], ['Average pain · first 2 days', sum.avgPainFirst2, 'Day 1 and day 2 of each period']]) {\n        const st = pg.createDiv({ cls: 'pt-pain-stat' });\n        st.createDiv({ cls: 'pt-stat-label', text: label });\n        st.createDiv({ cls: 'pt-stat-value', text: v == null ? '–' : round1(v) + '/' + PAIN_MAX });\n        st.createDiv({ cls: 'pt-stat-sub', text: (v == null ? 'No pain logged' : painWord(Math.round(v))) + ' · ' + sub });\n      }\n    }", 'period pain two stats');
period = patch(period, "    ['Average pain on bleeding days', sum.avgPain == null ? '-' : round1(sum.avgPain) + ' / ' + PAIN_MAX],",
  "    ['Average pain on bleeding days', sum.avgPain == null ? '-' : round1(sum.avgPain) + ' / ' + PAIN_MAX],\n    ['Average pain, first 2 days of each period', sum.avgPainFirst2 == null ? '-' : round1(sum.avgPainFirst2) + ' / ' + PAIN_MAX],", 'period pain first2 report row');

const PERIOD_NOTES = fs.readFileSync(path.join(__dirname, 'src/period-notes.js'), 'utf8');
// Recent periods: average pain on the first two days of each period
period = patch(period, "    p.avgPain = painN ? painSum / painN : null;",
  "    p.avgPain = painN ? painSum / painN : null;\n    { const f2 = [p.start, p.start + 1].filter((d) => d <= p.end).map((d) => byDay.get(d)).filter((e) => e && e.pain != null).map((e) => e.pain); p.painFirst2 = f2.length ? f2.reduce((x, y) => x + y, 0) / f2.length : null; }", 'period painFirst2 per period');
period = patch(period, "    for (const h of ['Start', 'Days', 'Cycle', 'Peak flow', 'Avg pain', 'Symptoms']) hr.createEl('th', { text: h });",
  "    for (const h of ['Start', 'Days', 'Cycle', 'Peak flow', 'Avg pain', 'Pain days 1–2', 'Symptoms']) hr.createEl('th', { text: h });", 'period history head');
period = patch(period, "      r.createEl('td', { text: p.avgPain == null ? '-' : String(round1(p.avgPain)) });\n      r.createEl('td', { text: p.topSymptoms.join(', ') || '-' });",
  "      r.createEl('td', { text: p.avgPain == null ? '-' : String(round1(p.avgPain)) });\n      r.createEl('td', { text: p.painFirst2 == null ? '-' : String(round1(p.painFirst2)) });\n      r.createEl('td', { text: p.topSymptoms.join(', ') || '-' });", 'period history first2 cell');

// One note per period: each note lists its days; older one-note-per-day logs are still read and can be converted
period = patch(period, "  parseEntry(file) {\n    const cache = this.app.metadataCache.getFileCache(file);\n    const fm = cache && cache.frontmatter;\n    if (!fm) return null;\n    if (fm.type && fm.type !== 'period-log') return null;\n    const day = toDayNum(fm.date != null ? fm.date : file.basename);",
  "  entryFromObj(o, file, kind) {\n    const day = toDayNum(o.date);\n    if (day == null) return null;\n    let flow = String(o.flow == null ? 'none' : o.flow).toLowerCase().trim();\n    if (!FLOWS.includes(flow)) flow = 'none';\n    let pain = o.pain === '' || o.pain == null ? null : Number(o.pain);\n    if (pain != null && !isFinite(pain)) pain = null;\n    if (pain != null) pain = Math.max(0, Math.min(PAIN_MAX, Math.round(pain)));\n    return { day, file, kind, flow, pain, symptoms: toList(o.symptoms), medications: toList(o.medications), notes: o.notes == null ? '' : String(o.notes) };\n  }\n  parsePeriodNote(file) {\n    const cache = this.app.metadataCache.getFileCache(file);\n    const fm = cache && cache.frontmatter;\n    if (!fm || fm.type !== 'period' || !Array.isArray(fm.days)) return null;\n    return fm.days.map((d) => (d && typeof d === 'object' ? this.entryFromObj(d, file, 'period') : null)).filter(Boolean);\n  }\n  parseEntry(file) {\n    const cache = this.app.metadataCache.getFileCache(file);\n    const fm = cache && cache.frontmatter;\n    if (!fm) return null;\n    if (fm.type && fm.type !== 'period-log') return null;\n    const day = toDayNum(fm.date != null ? fm.date : file.basename);", 'period entryFromObj');
period = patch(period, "    return {\n      day, file, flow, pain,\n      symptoms: toList(fm.symptoms),",
  "    return {\n      day, file, kind: 'day', flow, pain,\n      symptoms: toList(fm.symptoms),", 'period day kind');
period = patch(period, "      if (!this.inLogFolder(f.path)) continue;\n      const e = this.parseEntry(f);\n      if (e) map.set(e.day, e);\n    }",
  "      if (!this.inLogFolder(f.path)) continue;\n      const days = this.parsePeriodNote(f);\n      if (days) { for (const e of days) map.set(e.day, e); continue; }\n      const e = this.parseEntry(f);\n      if (e && !(map.get(e.day) && map.get(e.day).kind === 'period')) map.set(e.day, e);\n    }", 'period getEntries both kinds');
period = patch(period, "  async saveEntry(st) {\n    const folder = normalizePath(this.settings.logFolder);\n    await this.ensureFolder(folder);\n    const existing = this.getEntryByDay(st.day);\n    let file = existing ? existing.file : null;\n    if (!file) {",
  "  async saveEntry(st) {\n    const folder = normalizePath(this.settings.logFolder);\n    await this.ensureFolder(folder);\n    const existing = this.getEntryByDay(st.day);\n    if (!existing || existing.kind !== 'day') return this.savePeriodDay(st, existing);\n    let file = existing ? existing.file : null;\n    if (!file) {", 'period saveEntry route');
period = patch(period, "  async deleteEntry(entry) {\n    if (this.app.fileManager.trashFile)",
  "  async deleteEntry(entry) {\n    if (entry.kind === 'period') {\n      let left = null;\n      await this.app.fileManager.processFrontMatter(entry.file, (fm) => {\n        fm.days = (Array.isArray(fm.days) ? fm.days : []).filter((d) => toDayNum(d && d.date) !== entry.day);\n        left = fm.days.slice();\n        Object.assign(fm, this.periodSpan(fm.days));\n      });\n      if (!left.length) { if (this.app.fileManager.trashFile) await this.app.fileManager.trashFile(entry.file); else await this.app.vault.trash(entry.file, true); }\n      else await this.writeDayTable(entry.file, left);\n      this.requestRefresh();\n      return;\n    }\n    if (this.app.fileManager.trashFile)", 'period deleteEntry period');
period = patch(period, "  async quickStart() {", PERIOD_NOTES + "\n  async quickStart() {", 'period notes methods');
period = patch(period, "    this.addCommand({ id: 'period-started', name: 'Period started today', callback: () => this.quickStart() });",
  "    this.addCommand({ id: 'period-started', name: 'Period started today', callback: () => this.quickStart() });\n    this.addCommand({ id: 'convert-day-notes', name: 'Combine day notes into one note per period', callback: () => this.confirmConvert() });", 'period convert command');
period = patch(period, "    new Setting(c).setName('Log folder').setDesc('One note per logged day is stored here (YYYY-MM-DD.md).')",
  "    { const old = p.getEntries().filter((e) => e.kind === 'day').length;\n      new Setting(c).setName('One note per period').setDesc('Each period is one note that lists every day you logged (flow, pain, symptoms). ' + (old ? old + ' days are still in separate day notes from before: combine them into period notes. The old day notes go to the trash.' : 'All your days are already in period notes.'))\n        .addButton((b) => b.setButtonText('Combine day notes').setDisabled(!old).onClick(() => p.confirmConvert(() => this.display()))); }\n    new Setting(c).setName('Log folder').setDesc('Period notes are stored here, one per period (Period YYYY-MM-DD.md).')", 'period settings convert');

// Migraine: pain and symptoms day by day inside one episode note (older episodes unchanged)
const MDAYS = fs.readFileSync(path.join(__dirname, 'src/migraine-days.js'), 'utf8').split(/\/\*@@(?:MODAL|PLUGIN)@@\*\//);
migraine = patch(migraine, "function parseEpisode(file, fm) {", MDAYS[0] + "\nfunction parseEpisode(file, fm) {", 'migraine days helpers');
migraine = patch(migraine, "    notes: fm.notes ? String(fm.notes) : '',\n  };\n}", "    notes: fm.notes ? String(fm.notes) : '',\n    days: parseEpDays(fm.days),\n    avgAuto: fm.pain_avg_auto === true || fm.pain_avg_auto === 'true',\n  };\n}", 'migraine parse days');
migraine = patch(migraine, "    notes: ep.notes || '',\n    tags: ['migraine'],", "    notes: ep.notes || '',\n    days: ep.days && ep.days.length ? ep.days.map(dayToFm) : undefined,\n    pain_avg_auto: ep.avgAuto ? true : undefined,\n    tags: ['migraine'],", 'migraine fm days');
migraine = patch(migraine, "    const fm = stringifyYaml(episodeToFrontmatter(ep));", "    const fmo = episodeToFrontmatter(ep);\n    for (const k of Object.keys(fmo)) if (fmo[k] === undefined) delete fmo[k];\n    const fm = stringifyYaml(fmo);", 'migraine create days');
migraine = patch(migraine, "    await this.app.fileManager.processFrontMatter(file, (fm) => { Object.assign(fm, data); });", "    await this.app.fileManager.processFrontMatter(file, (fm) => { Object.assign(fm, data); for (const k of Object.keys(data)) if (data[k] === undefined) delete fm[k]; });", 'migraine update days');
migraine = patch(migraine, "    /* Triggers */\n", "    /* Day by day */\n    this.daysSec = this.section('Day by day', 'calendar-days');\n    this.renderDays();\n\n    /* Triggers */\n", 'migraine days section');
migraine = patch(migraine, "    if (this.todEndHelp) this.todEndHelp.setText(", "    if (this.daysSec) this.renderDays();\n    if (this.todEndHelp) this.todEndHelp.setText(", 'migraine days follow dates');
migraine = patch(migraine, "      notes: this.notesInput.value.trim(),\n    };\n  }", "      notes: this.notesInput.value.trim(),\n      days: this.collectDays(start, end),\n    };\n  }", 'migraine collect days');
migraine = patch(migraine, "    const ep = this.collect();\n    if (!ep) return;", "    const ep = this.collect();\n    if (!ep) return;\n    // Day 1 keeps the values set above; the episode's peak pain and symptoms include every day\n    if (ep.days && ep.days.length && !ep.days.some((d) => d.date === dayKey(ep.start))) ep.days.unshift({ date: dayKey(ep.start), pain: ep.painMax, symptoms: ep.symptoms.slice() });\n    // New episodes work out their average pain; episodes logged before keep the average you entered\n    ep.avgAuto = !this.existing || !!this.existing.avgAuto;\n    if (ep.avgAuto) ep.painAvg = autoPainAvg(ep); else ep.painAvg = this.existing.painAvg;\n    for (const d of ep.days || []) { if (d.pain > ep.painMax) ep.painMax = d.pain; for (const x of d.symptoms) if (!ep.symptoms.includes(x)) ep.symptoms.push(x); }", 'migraine merge days');
migraine = patch(migraine, "/* ------------------------------------------------------------------ */\n/* Dashboard view", MDAYS[1] + "\n/* ------------------------------------------------------------------ */\n/* Dashboard view", 'migraine days modal methods');
migraine = patch(migraine, "        const peak = Math.max(...eps.map((e) => e.painMax || 0));", "        const peak = Math.max(...eps.map((e) => epDayPain(e, key)));", 'migraine calendar day pain');
migraine = patch(migraine, "      dayPain.set(k, Math.max(dayPain.get(k) || 0, e.painMax || 1));", "      dayPain.set(k, Math.max(dayPain.get(k) || 0, epDayPain(e, k) || 1));", 'migraine report day pain');
migraine = patch(migraine, "module.exports._internals = { episodeDayKeys,", "module.exports._internals = { epDay, epDayPain, parseEpDays, autoPainAvg, MigraineDayModal, MigraineSummaryModal, episodeDayKeys,", 'migraine export days');

// Migraine: average pain is worked out from the pain on each day instead of being asked
migraine = patch(migraine, "    // Average can't exceed maximum: picking one nudges the other if needed\n    this.maxPain = this.painSelector(pain, 'Maximum pain', this.ep.painMax ?? Math.ceil(PAIN_MAX * 0.6), (v) => {\n      if (this.avgPain && this.avgPain.get() > v) this.avgPain.set(v);\n    });\n    this.avgPain = this.painSelector(pain, 'Average pain', this.ep.painAvg ?? Math.ceil(PAIN_MAX * 0.4), (v) => {\n      if (this.maxPain.get() < v) this.maxPain.set(v);\n    });",
  "    this.maxPain = this.painSelector(pain, 'Maximum pain', this.ep.painMax ?? Math.ceil(PAIN_MAX * 0.6), () => { if (this.daysSec) this.renderDays(); });\n    pain.createDiv({ cls: 'mt-help', text: this.existing && !this.existing.avgAuto ? 'Average pain you entered: ' + (this.existing.painAvg == null ? '–' : this.existing.painAvg) + '/' + PAIN_MAX + '. It stays as it is for this episode.' : 'Average pain is worked out for you from the pain on each day (see Day by day below for a migraine that lasts more than a day).' });", 'migraine no average question');
migraine = patch(migraine, "    let painAvg = this.avgPain.get();\n    if (painAvg > painMax) painAvg = painMax;", "    let painAvg = null; // worked out on save", 'migraine collect no avg');
migraine = patch(migraine, "    painAvg: asPain(fm.pain_avg),", "    painAvg: asPainAvg(fm.pain_avg),", 'migraine parse avg decimal');
migraine = patch(migraine, "    await this.app.fileManager.processFrontMatter(ep.file, (fm) => { fm.end = toDateValue(end); });", "    await this.app.fileManager.processFrontMatter(ep.file, (fm) => { fm.end = toDateValue(end); if (ep.avgAuto) fm.pain_avg = autoPainAvg(Object.assign({}, ep, { end })); });", 'migraine end recomputes avg');

// Migraine: Log day and Migraine started, like the period tracker
migraine = patch(migraine, "module.exports = MigraineTrackerPlugin;", MDAYS[2] + "\nmodule.exports = MigraineTrackerPlugin;", 'migraine day plugin methods');
migraine = patch(migraine, "    const logBtn = actions.createEl('button', { cls: 'mod-cta mt-btn' });\n    setIcon(logBtn.createSpan(), 'plus');\n    logBtn.createSpan({ text: 'Log migraine' });\n    logBtn.onclick = () => new EpisodeModal(this.plugin).open();",
  "    const logBtn = actions.createEl('button', { cls: 'mod-cta mt-btn' });\n    setIcon(logBtn.createSpan(), 'plus');\n    logBtn.createSpan({ text: 'Log day' });\n    logBtn.onclick = () => new MigraineDayModal(this.plugin, new Date()).open();\n    const startBtn = actions.createEl('button', { cls: 'mod-cta mt-btn' });\n    setIcon(startBtn.createSpan(), 'brain');\n    startBtn.createSpan({ text: 'Migraine started' });\n    startBtn.onclick = () => this.plugin.migraineStarted();", 'migraine header day buttons');
migraine = patch(migraine, "      const editBtn = b.createEl('button', { text: 'Edit' });\n      editBtn.onclick = () => new EpisodeModal(this.plugin, ep).open();",
  "      const dayBtn = b.createEl('button', { text: 'Log today' });\n      dayBtn.onclick = () => new MigraineDayModal(this.plugin, new Date()).open();\n      const editBtn = b.createEl('button', { text: 'Edit' });\n      editBtn.onclick = () => new EpisodeModal(this.plugin, ep).open();", 'migraine banner log today');
migraine = patch(migraine, "    if (eps.length === 1 && !evt.shiftKey) { new EpisodeModal(this.plugin, eps[0]).open(); return; }",
  "    if (!evt.shiftKey) { new MigraineDayModal(this.plugin, date).open(); return; } // like the period calendar: a day opens that day", 'migraine calendar opens day');
migraine = patch(migraine, "    this.addCommand({ id: 'log-migraine', name: 'Log a migraine', callback: () => new EpisodeModal(this).open() });",
  "    this.addCommand({ id: 'log-migraine', name: 'Log a migraine', callback: () => new EpisodeModal(this).open() });\n    this.addCommand({ id: 'log-day', name: 'Log migraine day', callback: () => new MigraineDayModal(this, new Date()).open() });\n    this.addCommand({ id: 'migraine-started', name: 'Migraine started today', callback: () => this.migraineStarted() });", 'migraine day commands');

// Silent aura (aura without headache) is a symptom too, and counts as an aura
migraine = patch(migraine, "    'Smell sensitivity', 'Visual aura', 'Blurred vision', 'Dizziness / vertigo',", "    'Smell sensitivity', 'Visual aura', 'Silent aura', 'Blurred vision', 'Dizziness / vertigo',", 'migraine silent aura symptom');
// The Migraine tab has Migraine started; days are logged from the calendar, the banner or the Overview
migraine = patch(migraine, "    const logBtn = actions.createEl('button', { cls: 'mod-cta mt-btn' });\n    setIcon(logBtn.createSpan(), 'plus');\n    logBtn.createSpan({ text: 'Log day' });\n    logBtn.onclick = () => new MigraineDayModal(this.plugin, new Date()).open();\n", "", 'migraine no Log day button');

// End now asks the day's questions plus the end date and time; episode list links to the summary
migraine = patch(migraine, "      endBtn.onclick = () => this.plugin.endEpisode(ep);", "      endBtn.onclick = () => this.plugin.endMigraineDay(ep);", 'migraine end now window');
migraine = patch(migraine, "      tr.createEl('td', { text: ep.end ? fmtDays(durationDays(ep)) : `Ongoing (day ${spanDays(ep.start, now)})` });",
  "      { const dtd = tr.createEl('td', { text: ep.end ? fmtDays(durationDays(ep)) : `Ongoing (day ${spanDays(ep.start, now)})` }); if (ep.days && ep.days.length) dtd.createDiv({ cls: 'mt-muted-sm', text: ep.days.length + (ep.days.length === 1 ? ' day logged' : ' days logged') }); }", 'migraine list days logged');
migraine = patch(migraine, "      edit.onclick = () => new EpisodeModal(this.plugin, ep).open();\n    }",
  "      edit.onclick = () => new EpisodeModal(this.plugin, ep).open();\n      const sumBtn = act.createEl('button', { cls: 'mt-icon-btn', attr: { 'aria-label': 'Episode summary' } });\n      setIcon(sumBtn, 'list');\n      sumBtn.onclick = () => new MigraineSummaryModal(this.plugin, ep, ep.end ? 'ended' : 'day').open();\n    }", 'migraine list summary button');

const wrap = (name, src) =>
  '/* ' + '='.repeat(66) + ' */\n/* ' + name.padEnd(66) + ' */\n/* ' + '='.repeat(66) + ' */\n' +
  'const ' + name + ' = (function () {\nconst module = { exports: {} };\n' + src + '\nreturn module.exports;\n})();\n\n';

const hub = fs.readFileSync(path.join(__dirname, 'src/hub.js'), 'utf8');
const out = "'use strict';\n/*\n * Health Dashboard for Obsidian\n * Period, migraine, doctor visits, blood pressure, sickness, medication, A1C and glucose tracking in one plugin, with a combined dashboard.\n * Plain JavaScript, no build step needed to install. No network requests.\n */\nconst obsidian = require('obsidian');\n\n" +
  wrap('PeriodModule', period) + wrap('MigraineModule', migraine) +
  wrap('VisitsModule', fs.readFileSync(path.join(__dirname, 'src/visits.js'), 'utf8')) +
  wrap('KitModule', fs.readFileSync(path.join(__dirname, 'src/kit.js'), 'utf8')) +
  wrap('BPModule', fs.readFileSync(path.join(__dirname, 'src/bp.js'), 'utf8')) +
  wrap('IllnessModule', fs.readFileSync(path.join(__dirname, 'src/illness.js'), 'utf8')) +
  wrap('MedsModule', fs.readFileSync(path.join(__dirname, 'src/meds.js'), 'utf8')) +
  wrap('A1CModule', fs.readFileSync(path.join(__dirname, 'src/a1c.js'), 'utf8')) +
  wrap('GlucoseModule', fs.readFileSync(path.join(__dirname, 'src/glucose.js'), 'utf8')) + hub + '\n' +
  fs.readFileSync(path.join(__dirname, 'src/extras.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, 'src/reports.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, 'src/link.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, 'src/help.js'), 'utf8');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'main.js'), out);

const css = '/* ===== Period Tracker ===== */\n' + fs.readFileSync(path.join(periodDir, 'styles.css'), 'utf8') +
  '\n\n/* ===== Migraine Tracker ===== */\n' + fs.readFileSync(path.join(migraineDir, 'styles.css'), 'utf8') +
  '\n\n/* ===== Doctor Visits ===== */\n' + fs.readFileSync(path.join(__dirname, 'src/visits.css'), 'utf8') +
  '\n\n/* ===== Blood pressure, Sickness, Medications ===== */\n' + fs.readFileSync(path.join(__dirname, 'src/kit.css'), 'utf8') +
  '\n\n/* ===== Health Dashboard ===== */\n' + fs.readFileSync(path.join(__dirname, 'src/hub.css'), 'utf8') +
  '\n\n/* ===== Look (matches the Finance Dashboard) ===== */\n' + fs.readFileSync(path.join(__dirname, 'src/theme.css'), 'utf8');
fs.writeFileSync(path.join(outDir, 'styles.css'), css);
console.log('built', out.length, 'bytes js,', css.length, 'bytes css');
