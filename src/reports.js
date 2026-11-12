/* ================================================================== */
/* Period and migraine doctor reports, in the same layout as the rest  */
/* ================================================================== */
const PERIOD_ACCENT = '#b8325a', MIGRAINE_ACCENT = '#4a9a2e';
const FLOW_RGB = { spotting: [0.96, 0.75, 0.8], light: [0.92, 0.56, 0.64], medium: [0.85, 0.33, 0.44], heavy: [0.64, 0.13, 0.25] };

/* ---------------- Period ---------------- */
function buildPeriodReport(plugin, o) {
  const a = plugin.getAnalysis();
  const from = o.from, to = o.to;
  const sum = P.summarize(a, from, to);
  const PAIN_MAX = P.getPainMax();
  const painWord = (p) => String(P.PAIN_LABELS[p] || '').toLowerCase();
  const r1 = (x) => Math.round(x * 10) / 10;
  const days = to - from + 1;
  const range = P.fmtDate(from) + ' – ' + P.fmtDate(to);
  const R = new KK.Report('Period report', range, PERIOD_ACCENT);
  const accent = KK.MI.hexRgb(PERIOD_ACCENT), warnRgb = KK.MI.hexRgb('#e08a2b');
  R.cover([o.name ? 'Name: ' + o.name : '', 'Period: ' + range + ' (' + KK.plural(days, 'day') + ')', 'Created ' + KK.fmtKey(KK.todayKey()) + ' · pain scale 0–' + PAIN_MAX]);

  R.heading('Summary');
  const items = [
    ['Periods recorded', String(sum.periods.length), KK.plural(sum.entries.length, 'day') + ' logged'],
    ['Average cycle', sum.avgCycle != null ? r1(sum.avgCycle) + ' days' : '–', sum.nCycles ? KK.plural(sum.nCycles, 'complete cycle') + ' · ' + sum.minCycle + '–' + sum.maxCycle + ' days' : 'needs two periods'],
    ['Cycle variability', sum.sdCycle == null ? '–' : '±' + r1(sum.sdCycle) + ' days', 'standard deviation'],
    ['Average period length', sum.avgPeriod != null ? r1(sum.avgPeriod) + ' days' : '–', sum.maxPeriod != null ? 'longest ' + sum.maxPeriod + ' days' : ''],
    ['Bleeding days', String(sum.bleedDays), sum.heavyDays + ' heavy · ' + sum.spottingDays + ' spotting'],
    ['Average pain (bleeding days)', sum.avgPain != null ? r1(sum.avgPain) + ' / ' + PAIN_MAX : '–', sum.maxPain != null ? 'highest ' + sum.maxPain + ' (' + painWord(sum.maxPain) + ')' : ''],
  ];
  if (a.last && to >= a.today && plugin.settings.showPredictions) {
    items.push(['Last period started', P.fmtDate(a.last.start), a.ongoing ? 'ongoing' : '']);
    items.push(['Next period (estimate)', P.fmtDate(a.futureStarts[0] != null ? a.futureStarts[0] : a.nextStart), a.cycleEstimated ? 'using a 28-day default' : 'from your average cycle']);
  }
  R.stats(items);

  R.heading('Patterns to discuss');
  if (sum.flags.length) for (const f of sum.flags) R.note(f, true);
  else R.note('No cycles outside ' + P.REFS.min + '–' + P.REFS.max + ' days, no periods longer than ' + P.REFS.maxLen + ' days and no severe pain were recorded in this range.');
  R.para('Reference ranges are general guidance for adults and are not a diagnosis. Discuss any concerns with a clinician.', { size: 8, color: KK.RC.muted });

  if (sum.cycles.length) {
    R.heading('Cycle length', 'Each bar is one cycle, labelled with its start date. The shaded band is the ' + P.REFS.min + '–' + P.REFS.max + ' day reference range (' + P.REFS.name + ').', 180);
    const cyc = sum.cycles.slice(-24);
    R.bars(cyc.map((c) => ({ label: P.fmtShort(c.start), value: c.len, color: c.len < P.REFS.min || c.len > P.REFS.max ? warnRgb : accent })), {
      height: 160, yMax: Math.max(40, ...cyc.map((c) => c.len)) + 5, step: 10, maxLabels: 12,
      band: { from: P.REFS.min, to: P.REFS.max, color: [0.9, 0.96, 0.91] },
      ref: sum.avgCycle ? { y: sum.avgCycle, label: 'average ' + r1(sum.avgCycle), inLegend: true } : null,
      legend: [['Within ' + P.REFS.min + '–' + P.REFS.max + ' days', accent], ['Outside the range', warnRgb]].concat(sum.avgCycle ? [['Line: average ' + r1(sum.avgCycle) + ' days', KK.RC.ink]] : []),
    });
  }

  R.heading('Period history');
  if (sum.periods.length) {
    R.table([{ label: 'Started', w: 0.15 }, { label: 'Ended', w: 0.15 }, { label: 'Days', w: 0.08, align: 'right' }, { label: 'Cycle', w: 0.09, align: 'right' }, { label: 'Peak flow', w: 0.13 }, { label: 'Avg pain', w: 0.1, align: 'right' }, { label: 'Most common symptoms', w: 0.3, wrap: true }],
      sum.periods.map((p) => [P.fmtDate(p.start), P.fmtDate(p.end), String(p.length), p.cycleLength == null ? 'current' : String(p.cycleLength), P.FLOW_LABEL[p.peakFlow] || '–', p.avgPain == null ? '–' : String(r1(p.avgPain)), p.topSymptoms.join(', ') || '–']),
      { cellColor: (ri, ci) => (ci === 4 ? FLOW_RGB[sum.periods[ri].peakFlow] || null : ci === 3 && sum.periods[ri].cycleLength != null && (sum.periods[ri].cycleLength < P.REFS.min || sum.periods[ri].cycleLength > P.REFS.max) ? warnRgb : null), boldColored: true });
  } else R.para('No periods were recorded in this range.', { color: KK.RC.muted });

  const n = sum.entries.length;
  if (sum.symptoms.length || sum.meds.length) {
    R.heading('Symptoms and medication', 'Share of logged days on which each was recorded.');
    R.freqGrid([{ title: 'Symptoms', entries: sum.symptoms, total: n }, { title: 'Medications', entries: sum.meds, total: n }]);
  }

  if (o.includeLog) {
    const rows = sum.entries.filter((e) => e.flow !== 'none' || e.pain != null || e.symptoms.length || e.medications.length || e.notes);
    R.heading('Daily log');
    if (!rows.length) R.para('No daily entries in this range.', { color: KK.RC.muted });
    else {
      const cols = [{ label: 'Date', w: 0.15 }, { label: 'Flow', w: 0.11 }, { label: 'Pain', w: 0.07, align: 'right' }, { label: 'Symptoms', w: o.includeNotes ? 0.26 : 0.4, wrap: true }, { label: 'Medication', w: o.includeNotes ? 0.17 : 0.27, wrap: true }];
      if (o.includeNotes) cols.push({ label: 'Notes', w: 0.24, wrap: true });
      R.table(cols, rows.map((e) => {
        const r = [P.fmtDate(e.day), P.FLOW_LABEL[e.flow], e.pain == null ? '–' : String(e.pain), e.symptoms.join(', ') || '–', e.medications.join(', ') || '–'];
        if (o.includeNotes) r.push(e.notes || '');
        return r;
      }), { size: 8, cellColor: (ri, ci) => (ci === 1 ? FLOW_RGB[rows[ri].flow] || null : null), boldColored: true });
    }
  }
  if (plugin.reportExtras) R.extraSections(plugin.reportExtras({ from: P.fromDayNum(from), to: P.fromDayNum(to), includeNotes: o.includeGenNotes !== false, includeMissed: o.includeMissed !== false }));
  R.footerAll('Period report · self-reported · for discussion with a clinician, not a diagnosis');
  return R.output();
}

/* ---------------- Migraine ---------------- */
function buildMigraineReport(plugin, o) {
  const settings = plugin.settings, all = plugin.getEpisodes();
  const from = M.startOfDay(o.from);
  const to = new Date(o.to.getFullYear(), o.to.getMonth(), o.to.getDate(), 23, 59, 59);
  const st = M.computeStats(all, 'custom', to, settings, from);
  const eps = [...st.episodes].sort((x, y) => x.start - y.start);
  const PAIN_MAX = M.getPainMax();
  const months = st.spanDays / 30.44;
  const perMonth = (n) => (n / months).toFixed(1);
  const fromKey = M.dayKey(from), toKey = M.dayKey(to);
  const range = M.fmtDate(from) + ' – ' + M.fmtDate(to);
  const R = new KK.Report('Migraine report', range, MIGRAINE_ACCENT);
  R.cover([o.name ? 'Name: ' + o.name : '', 'Period: ' + range + ' (' + KK.plural(st.spanDays, 'day') + ')', 'Created ' + KK.fmtKey(KK.todayKey()) + ' · pain scale 0–' + PAIN_MAX]);

  if (!eps.length) R.para('No migraine episodes were logged in this period.', { color: KK.RC.muted });
  else {
    const aura = eps.filter(M.hadAura).length; // "Visual aura" symptom, or a "with aura" type
    R.heading('Summary');
    R.stats([
      ['Episodes', String(st.count), perMonth(st.count) + ' per month'],
      ['Headache days', String(st.migraineDays), perMonth(st.migraineDays) + ' per month · ' + Math.round(st.migraineDayPct * 100) + '% of days'],
      ['Average duration', M.fmtDays(st.avgDuration), st.longest != null ? 'longest ' + M.fmtDays(st.longest) : 'no completed episodes'],
      ['Average peak pain', st.avgPainMax != null ? st.avgPainMax.toFixed(1) + ' / ' + PAIN_MAX : '–', st.avgPainAvg != null ? 'average pain ' + st.avgPainAvg.toFixed(1) + ' / ' + PAIN_MAX : ''],
      ['Acute-medication days', String(st.medDaysRange), perMonth(st.medDaysRange) + ' per month'],
      ['Episodes with aura', String(aura), st.count ? Math.round((aura / st.count) * 100) + '% of ' + KK.plural(st.count, 'episode') : ''],
      ['Most common type', st.types[0] ? st.types[0][0] : '–', st.types[0] ? st.types[0][1] + ' of ' + st.count + ' episodes' : ''],
      ['Most common trigger', st.triggers[0] ? st.triggers[0][0] : '–', st.triggers[0] ? st.triggers[0][1] + ' of ' + st.count + ' episodes' : 'none recorded'],
    ], 4);
    const medPerMonth = st.medDaysRange / months;
    if (medPerMonth >= settings.overuseThreshold) R.note('Acute medication was taken on about ' + medPerMonth.toFixed(0) + ' days per month in this period, at or above the ' + settings.overuseThreshold + '-day alert level set in the tracker.', true);

    // months and the worst pain on each day
    const monthList = [];
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) monthList.push({ y: d.getFullYear(), m: d.getMonth(), days: new Set() });
    const dayPain = new Map();
    for (const e of eps) {
      for (const k of M.episodeDayKeys(e, to)) {
        if (k < fromKey || k > toKey) continue;
        dayPain.set(k, Math.max(dayPain.get(k) || 0, e.painMax || 1));
        const [yy, mm] = k.split('-').map(Number);
        const mo = monthList.find((x) => x.y === yy && x.m === mm - 1);
        if (mo) mo.days.add(k);
      }
    }
    const shown = monthList.slice(-12);
    R.heading('Headache days per month', shown.length < monthList.length ? 'Last 12 months of the period.' : 'Days with a migraine, by calendar month.', 140);
    R.bars(shown.map((mo) => ({ label: KK.MONTHS[mo.m] + (shown.length <= 6 ? ' ' + String(mo.y).slice(2) : ''), value: mo.days.size })), { height: 130 });
    R.heading('Peak pain per episode', 'Number of episodes at each pain level (0–' + PAIN_MAX + ').', 130);
    R.bars(st.painHist.map((v, i) => ({ label: String(i + 1) + (PAIN_MAX === 5 ? ' ' + M.painLabel(i + 1).toLowerCase() : ''), value: v, color: M.painRgb(i + 1, 1) })), { height: 120 });

    R.heading('Calendar', 'Days shaded by the highest pain that day.', 150);
    R.calendars(shown, (k) => (dayPain.has(k) ? M.painRgb(dayPain.get(k), 1) : null), (k) => k >= fromKey && k <= toKey, {
      mondayFirst: settings.weekStart === 'monday', legendTitle: 'Pain:', legend: Array.from({ length: PAIN_MAX }, (_, i) => [String(i + 1), M.painRgb(i + 1, 1)]),
    });

    R.heading('Medications', 'Acute medication taken during episodes.');
    if (!st.medications.length) R.para('No medications recorded in this period.', { color: KK.RC.muted });
    else {
      R.table([{ label: 'Medication', w: 0.26 }, { label: 'Dose(s) recorded', w: 0.26, wrap: true }, { label: 'Episodes', w: 0.12, align: 'right' }, { label: 'Days used', w: 0.12, align: 'right' }, { label: 'Helped of rated uses', w: 0.24, align: 'right' }],
        st.medications.map((m) => [m.name, [...m.doses.entries()].sort((x, y) => y[1] - x[1]).map((d) => d[0]).slice(0, 3).join(', ') || '–', String(m.episodes), String(m.days.size),
          m.rated ? m.helped + ' of ' + m.rated + ' (' + Math.round((m.helped / m.rated) * 100) + '%)' : 'not rated']));
    }

    R.heading('Patterns', 'Episodes with each item, out of the ' + st.count + ' in this period (time it ended: out of the ' + st.endedCount + ' that ended).');
    R.freqGrid([
      { title: 'Possible causes', entries: st.triggers, total: st.count }, { title: 'Symptoms', entries: st.symptoms, total: st.count },
      { title: 'Headache location', entries: st.headLocation, total: st.count }, { title: 'Relief tried', entries: st.relief, total: st.count },
      { title: 'Time of day it started', entries: st.timeOfDay, total: st.count, keepAll: true }, { title: 'Time of day it ended', entries: st.timeOfDayEnd, total: st.endedCount, keepAll: true },
      { title: 'Day of week', entries: st.weekday, total: st.count, keepAll: true }, { title: 'Migraine type', entries: st.types, total: st.count },
      { title: 'Where it started', entries: st.attackLocations, total: st.count },
    ]);
  }

  if (o.questions && o.questions.trim()) { R.heading('Questions and notes for my doctor'); R.para(o.questions.trim()); }

  if (o.includeLog && eps.length) {
    R.heading('Episode log', KK.plural(eps.length, 'episode') + ', oldest first. Pain is peak / average.');
    const fmtMed = (m) => {
      const d = M.parseDT(m.date);
      return [m.name, m.dose, d ? KK.fmtShort(M.dayKey(d)) + (m.time ? ' ' + m.time : '') : m.time ? '@' + m.time : '', m.effect && m.effect !== 'Not sure' ? '(' + m.effect.toLowerCase() + ')' : ''].filter(Boolean).join(' ');
    };
    R.table([{ label: 'Started', w: 0.13 }, { label: 'Duration', w: 0.09 }, { label: 'Type', w: 0.13, wrap: true }, { label: 'Pain', w: 0.07, align: 'right' }, { label: 'Location', w: 0.12, wrap: true }, { label: 'Symptoms, causes', w: 0.22, wrap: true }, { label: 'Medication, notes', w: 0.24, wrap: true }],
      eps.map((e) => [
        M.fmtDate(e.start) + (e.timeOfDay ? ' · ' + e.timeOfDay.toLowerCase() : ''),
        e.end ? M.fmtDays(M.durationDays(e)) : 'ongoing',
        e.type || '–',
        (e.painMax == null ? '–' : e.painMax) + ' / ' + (e.painAvg == null ? '–' : e.painAvg),
        e.headLocation.join(', ') || '–',
        [e.symptoms.join(', '), e.triggers.length ? 'Causes: ' + e.triggers.join(', ') : ''].filter(Boolean).join('. ') || '–',
        [e.medications.map(fmtMed).join('; '), e.notes ? 'Note: ' + e.notes : ''].filter(Boolean).join('. ') || '–',
      ]),
      { size: 7.8, drawCell: (ri, ci, c) => {
        if (ci !== 3 || !eps[ri].painMax) return false;
        R.pill(c.x + c.w - c.pad, c.y + 1, String(eps[ri].painMax) + ' / ' + (eps[ri].painAvg == null ? '–' : eps[ri].painAvg), { fill: M.painRgb(eps[ri].painMax, 1), color: KK.RC.ink, size: c.size, align: 'right', h: c.lh + 1, padX: 4 });
        return true;
      } });
  }

  if (plugin.reportExtras) R.extraSections(plugin.reportExtras({ from: fromKey, to: toKey, includeNotes: o.includeGenNotes !== false, includeMissed: o.includeMissed !== false }));
  R.footerAll('Migraine report · self-reported headache diary · for discussion with a clinician, not a diagnosis');
  return R.output();
}

/* Use these layouts for the dashboard buttons, the commands and the combined health report */
PeriodModule.prototype.generateReport = async function (o) {
  const bytes = buildPeriodReport(this, o);
  const folder = obsidian.normalizePath(this.settings.reportFolder || 'Period Tracker/Reports');
  await HealthDashboardPlugin.prototype.ensureFolderPath.call(this, folder);
  const path = obsidian.normalizePath(folder + '/Period report ' + P.fromDayNum(o.from) + ' to ' + P.fromDayNum(o.to) + '.pdf');
  const file = await writeBinary(this.app, path, bytes);
  new Notice('Report saved to ' + path);
  await this.app.workspace.getLeaf('tab').openFile(file);
  return file;
};
MigraineModule.prototype.createReport = async function (opts) {
  const bytes = buildMigraineReport(this, opts);
  const folder = obsidian.normalizePath((this.settings.folder || 'Migraine Log') + '/Reports');
  await HealthDashboardPlugin.prototype.ensureFolderPath.call(this, folder);
  const path = obsidian.normalizePath(folder + '/Migraine report ' + M.dayKey(opts.from) + ' to ' + M.dayKey(opts.to) + '.pdf');
  const file = await writeBinary(this.app, path, bytes);
  new Notice('Report saved to ' + path);
  await this.app.workspace.getLeaf('tab').openFile(file);
  return file;
};

module.exports._reports = { buildPeriodReport, buildMigraineReport };
