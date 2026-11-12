/* ------------------------------------------------------------------ */
/* Help (? button), disclaimer and the PDF appendix                     */
/* ------------------------------------------------------------------ */
const DISCLAIMER_SHORT = 'For your own records, not medical advice.';
const DISCLAIMER = 'Health Dashboard is a personal tracking tool, not a medical device. It doesn’t diagnose or treat anything, and its figures are only as complete as what you log. Talk to a qualified health professional about your results. If you think you need urgent care, contact emergency services.';
const DISCLAIMER_PDF = 'This report was produced by Health Dashboard, a personal record-keeping tool. It is not a medical device and does not diagnose or treat any condition. Figures are calculated from what the person logged and may be incomplete. It is intended to support a conversation with a qualified health professional.';

/* Sources. Each entry: [citation, link] */
const HELP_REFS = {
  ichd_mm: ['Headache Classification Committee of the International Headache Society. *The International Classification of Headache Disorders, 3rd edition (ICHD-3). Appendix A1.1.1 Pure menstrual migraine.* Cephalalgia 2018;38(1):1–211.', 'https://ichd-3.org/appendix/a1-migraine/a1-1-migraine-without-aura/a1-1-1-pure-menstrual-migraine-without-aura/'],
  ichd_moh: ['International Headache Society. *ICHD-3, 8.2 Medication-overuse headache.* Cephalalgia 2018;38(1):1–211.', 'https://ichd-3.org/8-headache-attributed-to-a-substance-or-its-withdrawal/8-2-medication-overuse-headache-moh/'],
  ichd_cm: ['International Headache Society. *ICHD-3, 1.3 Chronic migraine.* Cephalalgia 2018;38(1):1–211.', 'https://ichd-3.org/1-migraine/1-3-chronic-migraine/'],
  ichd_aura: ['International Headache Society. *ICHD-3, 1.2 Migraine with aura.* Cephalalgia 2018;38(1):1–211.', 'https://ichd-3.org/1-migraine/1-2-migraine-with-aura/'],
  nichd: ['National Institute of Child Health and Human Development (NIH). *What are menstrual irregularities?*', 'https://www.nichd.nih.gov/health/topics/menstruation/conditioninfo/irregularities'],
  cdc_hmb: ['Centers for Disease Control and Prevention (CDC). *About heavy menstrual bleeding.*', 'https://www.cdc.gov/female-blood-disorders/about/heavy-menstrual-bleeding.html'],
  figo: ['Munro MG, Critchley HOD, Fraser IS; FIGO Menstrual Disorders Committee. *The two FIGO systems for normal and abnormal uterine bleeding symptoms and classification of causes of abnormal uterine bleeding in the reproductive years: 2018 revisions.* Int J Gynaecol Obstet 2018;143(3):393–408.', 'https://doi.org/10.1002/ijgo.12666'],
  wilcox: ['Wilcox AJ, Weinberg CR, Baird DD. *Timing of sexual intercourse in relation to ovulation.* N Engl J Med 1995;333(23):1517–1521.', 'https://doi.org/10.1056/NEJM199512073332301'],
  esc: ['McEvoy JW, et al. *2024 ESC Guidelines for the management of elevated blood pressure and hypertension.* Eur Heart J 2024;45(38):3912–4018.', 'https://doi.org/10.1093/eurheartj/ehae178'],
  aha: ['Jones DW, et al. *2025 AHA/ACC/AANP/AAPA/ABC/ACCP/ACPM/AGS/AMA/ASPC/NMA/PCNA/SGIM Guideline for the Prevention, Detection, Evaluation and Management of High Blood Pressure in Adults.* J Am Coll Cardiol 2025.', 'https://doi.org/10.1016/j.jacc.2025.05.007'],
  aha_crisis: ['American Heart Association. *Hypertensive crisis: when you should call 911 for high blood pressure.*', 'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/hypertensive-crisis-when-you-should-call-911-for-high-blood-pressure'],
  ada: ['American Diabetes Association Professional Practice Committee. *2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes.* Diabetes Care (updated each year, Supplement 1).', 'https://professional.diabetes.org/standards-of-care'],
  nice: ['National Institute for Health and Care Excellence (NICE). *Type 2 diabetes: prevention in people at high risk* (public health guideline PH38).', 'https://www.nice.org.uk/guidance/ph38'],
  adag: ['Nathan DM, Kuenen J, Borg R, Zheng H, Schoenfeld D, Heine RJ; A1c-Derived Average Glucose Study Group. *Translating the A1C assay into estimated average glucose values.* Diabetes Care 2008;31(8):1473–1478.', 'https://pubmed.ncbi.nlm.nih.gov/18540046/'],
  ifcc: ['Hoelzel W, et al. *IFCC reference system for measurement of hemoglobin A1c in human blood and the national standardization schemes in the United States, Japan, and Sweden: a method-comparison study.* Clin Chem 2004;50(1):166–174.', 'https://pubmed.ncbi.nlm.nih.gov/14709644/'],
};

const HELP_COLORS = { overview: '#7852ee', period: '#b8325a', migraine: '#4a9a2e', visits: '#1f8a8a', bp: '#c0392b', illness: '#e08a2b', meds: '#2c6fbb', a1c: '#7a4fd0' };
const HELP_SETTINGS = { period: ['period-tracker', 'Period settings'], migraine: ['migraine-tracker', 'Migraine settings'], visits: ['doctor-visits', 'Doctor visits settings'], bp: ['blood-pressure', 'Blood pressure settings'], illness: ['sickness-tracker', 'Sickness settings'], meds: ['medication-list', 'Medications settings'], a1c: ['a1c-tracker', 'A1C settings'], overview: ['health-dashboard', 'Health Dashboard settings'] };

const LVL = ['#2f9e6b', '#c9a227', '#e08a2b', '#d1495b', '#7f1d1d']; // same colours as the blood pressure and A1C dashboards
const toHex = (rgb) => '#' + rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('');
/**
 * Help for one dashboard: { title, intro, what[], calc[], table?{head, rows, mark}, bounds[], choice?{text, used}, fixed?, refs[] }
 * Text uses plain characters so the same words work in the PDF appendix.
 */
function helpFor(host, key) {
  const n1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  if (key === 'overview') {
    return {
      title: 'Overview',
      intro: 'A summary of every tracker you have turned on, a shared calendar, and how your migraines line up with your cycle.',
      what: [
        'Summary cards: the key figures from each tracker. Each tracker’s own ? explains how its figures are worked out.',
        'Calendar: period days shaded by flow (light [[#eb8fa3]], medium [[#d65470]], heavy [[#a3203f]], spotting [[#f3b7c3]]), a green bar for migraine days [[#4a9a2e]] (darker means more pain), a teal dot for doctor visits [[#1f8a8a]] and an orange bar for sick days [[#e08a2b]].',
        'Migraines and your cycle: when migraines start compared with the first day of your period. Dark bars [[#4a9a2e]] started inside the shaded window, light bars [[#bcdcae]] outside it. Needs both period and migraine tracking.',
        '**General notes**, and quick buttons to log anything.',
      ],
      calc: [
        'Day 1 is the first day of bleeding. The day before is day -1; there is no day 0. This is how the international headache criteria count.',
        'Each migraine is matched to the nearest period start. Migraines more than 10 days from a period start are counted but not drawn on the chart.',
        'Started around period day 1 = migraines that started from day -2 to day +3, out of the migraines that fall within the dates your period logs cover.',
        'Expected by chance = the window (5 days) divided by your average cycle length (28 days until you have logged at least two periods).',
        'Periods with a migraine nearby = periods since you started logging migraines whose window (day -2 to day +3) had a migraine start.',
      ],
      bounds: [
        'The window from day -2 to day +3 comes from the International Classification of Headache Disorders (ICHD-3), which uses it for menstrual migraine.',
        'A note appears when migraines started in the window in at least 2 of every 3 cycles, with 3 or more cycles logged. ICHD-3 uses this “two out of three cycles” rule. A doctor confirms the diagnosis from a diary kept over at least three cycles.',
      ],
      footnote: 'Patterns here are for discussion with your doctor, not a diagnosis.',
      fixed: 'The day -2 to +3 window and the two-out-of-three rule are set by the international criteria, so there is no setting for them. You can hide the chart or the disclaimer in Health Dashboard settings.',
      refs: ['ichd_mm'],
    };
  }
  if (key === 'period') {
    const per = host.period, s = per ? per.settings : {};
    const R = P.applyRefs(s);
    return {
      title: 'Period',
      intro: 'Your cycles, predictions and patterns, worked out from the days you log.',
      what: [
        'Cycle summary: cycle day, average cycle and period length, and when your next period is expected.',
        'Calendar: logged days by flow [[#d65470]], predicted period days (dashed outline) and, if turned on, the estimated fertile window [[#bfe3d3]].',
        'Cycle length chart: one bar per cycle [[#b8325a]]. The shaded band [[#d6eee4]] is the reference range you chose; orange bars [[#dd7a35]] fall outside it.',
        'Patterns: cycles or periods outside the reference range, cycles that vary a lot, severe pain and frequent heavy flow.',
      ],
      calc: [
        'A period is a run of bleeding days (light, medium or heavy' + (s.countSpotting ? ', and spotting' : '; spotting counts only if you turn that on') + '). One missing day doesn’t split a period.',
        'Cycle length = days from the first day of one period to the first day of the next.',
        'Averages use your last ' + (s.cyclesToAverage || 6) + ' cycles (Cycles to average).',
        'Next period = start of your last period + your average cycle (28 days until you have two periods). If it is late, it is projected from today.',
        'Estimated ovulation = next period start minus ' + (s.lutealPhase || 14) + ' days (Luteal phase length). The fertile window is the 5 days before ovulation, the day of ovulation and the day after; pregnancy is possible only in about a 6-day window ending on ovulation day. This is a calendar estimate and is not reliable for preventing or planning pregnancy.',
        'Severe pain = a pain score of ' + P.PAIN_SEVERE + ' or higher on the 0–5 scale. Heavy flow is flagged when heavy days average 3 or more per period.',
      ],
      table: {
        head: ['Reference', 'Usual cycle', 'Period flagged if over', 'Variation flagged if over'],
        rows: [['US (NIH and CDC)', '21–35 days', '7 days', '7 days'], ['FIGO 2018 (international)', '24–38 days', '8 days', '7 days*']].concat(R.id === 'custom' ? [['Your own ranges', R.min + '–' + R.max + ' days', R.maxLen + ' days', R.maxVar + ' days']] : []),
        mark: R.id === 'figo' ? 1 : R.id === 'custom' ? 2 : 0,
        foot: '* FIGO accepts up to 9 days of variation at ages 18–25 and 42–45.',
      },
      bounds: [
        'NIH: most cycles last 21 to 35 days. CDC: bleeding for longer than 7 days can be a sign of heavy menstrual bleeding.',
        'FIGO, the international federation of gynecologists, uses 24 to 38 days, bleeding up to 8 days, and cycles that vary by 7 to 9 days or less.',
      ],
      choice: { text: 'Guidelines differ on what counts as a usual cycle. You’re using ' + R.name + ': cycles ' + R.min + '–' + R.max + ' days, periods over ' + R.maxLen + ' days flagged, variation over ' + R.maxVar + ' days flagged.', bold: [R.name], used: R.name + ' (cycles ' + R.min + '–' + R.max + ' days; periods over ' + R.maxLen + ' days and variation over ' + R.maxVar + ' days flagged); averages over the last ' + (s.cyclesToAverage || 6) + ' cycles; luteal phase ' + (s.lutealPhase || 14) + ' days.' },
      footnote: 'Predictions and the fertile window are estimates, not medical or contraceptive advice.',
      refs: ['nichd', 'cdc_hmb', 'figo', 'wilcox'],
    };
  }
  if (key === 'migraine') {
    const mig = host.migraine, s = mig ? mig.settings : {};
    const pm = M.getPainMax(), thr = s.overuseThreshold || 10;
    return {
      title: 'Migraine',
      intro: 'Your migraine diary: how often, how long, how bad, what you took and what patterns show up.',
      what: [
        'Tiles: episodes, migraine days, average length, average peak pain, days since the last migraine, episodes with aura and acute-medication days.',
        '**Headache days per month** (green bars [[#4a9a2e]]), a pain calendar shaded from very mild [[' + toHex(M.painRgb(1, 1)) + ']] to very severe [[' + toHex(M.painRgb(pm, 1)) + ']], and a chart of peak pain per episode.',
        'Medications: how often each was used and how often it helped.',
        'Patterns: causes, symptoms, location, relief, migraine type, time of day and day of week.',
      ],
      calc: [
        'Migraine days = calendar days touched by any episode in the period. Share of days = migraine days divided by days in the period.',
        'Episodes per month = episodes divided by (days in the period / 30.44).',
        'Average length uses ended episodes only. Pain uses your 0–' + pm + ' scale: 0 no pain, 1 very mild, 2 mild, 3 moderate, 4 severe, 5 very severe' + (pm === 10 ? ' (on 0–10, each word covers two points)' : '') + '.',
        'With aura = the symptom “Visual aura” (or any symptom naming an aura) was logged, or the type is “Migraine with aura”.',
        'Acute-medication days = separate days in the last 30 on which you took any acute medication for a migraine.',
        'Helped = uses rated “Some relief” or “Full relief”, out of the uses you rated. “Not sure” and blank are not counted as rated.',
        'Patterns: episodes with each item, out of all episodes in the period. Migraines logged without an exact date are not counted.',
      ],
      table: { head: ['Pain (colour on the calendar)', 'Word'], rows: Array.from({ length: pm }, (_, i) => [String(i + 1), M.painLabel(i + 1)]), colors: Array.from({ length: pm }, (_, i) => toHex(M.painRgb(i + 1, 1))), mark: -1 },
      bounds: [
        'Acute-medication alert: ' + thr + ' days in 30. ICHD-3 describes medication-overuse headache when acute medication is taken on 10 or more days a month (triptans, ergots, opioids, combination painkillers such as Excedrin, or several types together) or 15 or more days a month (simple painkillers only, such as ibuprofen or paracetamol), for more than 3 months, in someone who has headache on 15 or more days a month.',
        'Doctors call migraine chronic when headache occurs on 15 or more days a month for more than 3 months, with migraine features on at least 8 of those days (ICHD-3). The dashboard shows your headache days so you can discuss this; it does not diagnose it.',
      ],
      choice: { text: 'The overuse level depends on what you take. Your alert is set to ' + thr + ' days: choose 10 if you use triptans or combination painkillers, or 15 if you only use simple painkillers. You can also switch the pain scale between 0–5 and 0–10.', bold: [thr + ' days'], used: 'Acute-medication alert at ' + thr + ' days in 30; pain scale 0–' + pm + '.' },
      footnote: 'The alerts are prompts to talk with your doctor, not a diagnosis.',
      refs: ['ichd_moh', 'ichd_cm', 'ichd_aura'],
    };
  }
  if (key === 'visits') {
    return {
      title: 'Doctor visits',
      intro: 'Your appointments, what was discussed and what to follow up.',
      what: [
        '**Next visit** and **last visit**, with the doctor or clinic.',
        '**Visits in the last 12 months**, and how many different doctors or clinics you saw.',
        'Follow-ups to book: follow-up dates from your visit notes that you haven’t booked yet. A follow-up is overdue once its date has passed.',
      ],
      calc: ['All figures are simple counts and dates from your visit notes. There are no medical cut-offs on this dashboard.'],
      bounds: [],
      fixed: 'Nothing here depends on a guideline, so there is nothing to choose in settings.',
      refs: [],
    };
  }
  if (key === 'bp') {
    const bp = host.bp, s = bp ? bp.settings : {};
    const gid = B.GUIDELINES[s.guideline] ? s.guideline : 'esc-home';
    const g = B.GUIDELINES[gid], [ts, td] = B.target(s);
    const gName = { 'esc-home': 'ESC 2024 · home readings', 'esc-office': 'ESC 2024 · clinic readings', aha: 'ACC/AHA 2025' };
    const gShort = { 'esc-home': 'ESC 2024, home', 'esc-office': 'ESC 2024, clinic', aha: 'ACC/AHA 2025' };
    const tcol = { 'esc-home': [LVL[0], LVL[1], LVL[3]], 'esc-office': [LVL[0], LVL[1], LVL[3]], aha: [LVL[0], LVL[1], LVL[2], LVL[3]] };
    const tables = {
      'esc-home': [['Non-elevated', 'below 120', 'and', 'below 70'], ['Elevated', '120–134', 'or', '70–84'], ['Hypertension range', '135 or higher', 'or', '85 or higher']],
      'esc-office': [['Non-elevated', 'below 120', 'and', 'below 70'], ['Elevated', '120–139', 'or', '70–89'], ['Hypertension range', '140 or higher', 'or', '90 or higher']],
      aha: [['Normal', 'below 120', 'and', 'below 80'], ['Elevated', '120–129', 'and', 'below 80'], ['Stage 1 range', '130–139', 'or', '80–89'], ['Stage 2 range', '140 or higher', 'or', '90 or higher']],
    };
    return {
      title: 'Blood pressure',
      intro: 'Your readings, averages and how they compare with the guideline you chose.',
      what: [
        '**Latest** and **Average**: your most recent reading, and the average of every reading in the chosen period. Systolic and diastolic are averaged separately.',
        '**Morning / Evening average**: readings taken 4 am–noon and 5 pm–midnight. Home-monitoring protocols ask for readings at both times because blood pressure is often higher in the morning.',
        '**Below ' + ts + '/' + td + '**: the share of readings where *both* numbers are below ' + (B.doctorTarget(s) ? 'your doctor’s target' : 'the threshold of the guideline you selected (or your doctor’s target)') + '.',
        '**Trend chart**: the daily average of systolic [[#c0392b]], diastolic [[#2c6fbb]] and pulse [[#8a8a8a]], with dashed lines at the guideline’s boundaries.',
      ],
      calc: [
        '**Daily average**: the average of that day’s readings.',
        '**Time of day**: morning 4 am to noon, afternoon noon to 5 pm, evening 5 pm to midnight, night midnight to 4 am. Home-monitoring routines take readings morning and evening, because blood pressure is often higher in the morning.',
        '**Very high**: 180 or higher, or 120 or higher. The American Heart Association calls this a hypertensive crisis; with symptoms such as chest pain, shortness of breath or changes in vision or speech, call emergency services.',
      ],
      table: { head: ['Category (' + gShort[gid] + ')', 'Systolic', '', 'Diastolic'], rows: tables[gid].concat([['Very high', '180 or higher', 'or', '120 or higher']]), colors: tcol[gid].concat([LVL[4]]), mark: -1 },
      boundsIntro: 'Each reading is coloured by the category it falls in. A reading goes in the higher category if *either* number qualifies. That is how both guidelines classify blood pressure.',
      footnote: 'A single reading isn’t a diagnosis; your doctor looks at many readings and your overall health.',
      bounds: [
        gid === 'esc-home' ? 'Home readings use lower cut-offs than clinic readings (135/85 instead of 140/90), because readings taken in a clinic tend to run higher.'
          : gid === 'esc-office' ? 'These are the cut-offs for readings taken in a clinic. For home readings, the ESC uses 135/85 instead of 140/90.'
          : 'The ACC/AHA categories are written for readings taken in a clinic. Home readings tend to run lower, and the guideline gives corresponding home values.',
      ].concat(B.doctorTarget(s) ? ['Your doctor’s target, ' + ts + '/' + td + ', is used for “below target” and the green target line.'] : []),
      choice: { text: 'Guidelines differ. The European (ESC 2024) and American (ACC/AHA 2025) guidelines use different categories, and your doctor may give you a personal target. You’re using ' + gName[gid] + (B.doctorTarget(s) ? ', with your doctor’s target of ' + ts + '/' + td : '') + '.', bold: [gName[gid]].concat(B.doctorTarget(s) ? [ts + '/' + td] : []), used: g.name + (B.doctorTarget(s) ? '; doctor’s target ' + ts + '/' + td : '; threshold ' + ts + '/' + td) + '.' },
      refs: ['esc', 'aha', 'aha_crisis'],
    };
  }
  if (key === 'illness') {
    return {
      title: 'Sickness',
      intro: 'When you were sick, for how long, and what helped.',
      what: [
        '**Right now**: whether you’re sick, and for how many days.',
        '**Times sick**, **sick days**, **average length**, **days missed** from work or school, and the **most common** type.',
        '**Calendar** of sick days shaded by how bad it was (mild [[#f6dec4]], moderate [[#eebe8c]], severe [[#dc7784]]), sick days per month [[#e08a2b]], and how often each type, symptom, medication and remedy came up, and how often it helped.',
      ],
      calc: [
        'Sick days = every day from the start of a sickness to its end (or today, if you’re still sick), up to 90 days per sickness, counted inside the chosen period.',
        'Average length uses sicknesses you have recovered from, counting the first and last day.',
        'Days missed is the total of the days missed you entered.',
        'Helped: for each medication or remedy, the number of times you used it and how many of those times you ticked it under “what helped”.',
        'Temperatures are shown as you entered them; the dashboard doesn’t judge them.',
      ],
      bounds: [],
      fixed: 'Nothing here depends on a guideline, so there is nothing to choose in settings.',
      refs: [],
    };
  }
  if (key === 'meds') {
    const s = host.meds ? host.meds.settings : {};
    const w = Number(s.refillWarnDays) || 7;
    return {
      title: 'Medications',
      intro: 'What you take now, what changed recently, and when refills are due. Your list also fills the medication choices in the other trackers.',
      what: [
        'Taking now: current medications, split into scheduled and as needed.',
        'Refills due: medications whose refill date is within ' + w + ' days, or has passed.',
        '**Started** and **stopped** in the last 90 days, and the **full list** with dose, schedule and purpose.',
      ],
      calc: ['A medication is current until you stop it. A refill is due when its refill date is ' + w + ' days away or less, and overdue once the date has passed.'],
      bounds: [],
      fixed: 'There are no medical cut-offs here. You can change how early refills show as due (now ' + w + ' days) in Medications settings.',
      refs: [],
    };
  }
  if (key === 'a1c') {
    const s = host.a1c ? host.a1c.settings : {};
    const std = A.applyStandard(s), pre = std.pre;
    const mm = (v) => A.toMmol(v);
    return {
      title: 'A1C',
      intro: 'Your A1C (HbA1c) results over time, what they mean in other units, and when the next test is due.',
      what: [
        '**Latest result** and its range, the **change** since your previous test (a green down-arrow [[#2f9e6b]] when lower, an orange up-arrow [[#dd7a35]] when higher), and **estimated average glucose**.',
        '**Your target** (if you set one), when the **next test** is due, and **tests in the last 12 months**.',
        '**A1C over time**: every result, with the range boundaries drawn as dashed lines.',
      ],
      calc: [
        'mmol/mol = (% - 2.15) x 10.929. This is the standard conversion between the US (NGSP) and international (IFCC) units.',
        'Estimated average glucose (ADAG study): mg/dL = 28.7 x A1C - 46.7; mmol/L = 1.59 x A1C - 2.59.',
        'Change = latest result minus the previous one, in percentage points.',
        'Next test = date of your last test plus ' + (s.intervalMonths || 3) + ' months (Test every).',
      ],
      table: {
        head: ['Range (' + std.short + ')', 'Percent', 'mmol/mol'],
        rows: [['Normal', 'below ' + n1(pre) + '%', 'below ' + mm(pre)], [std.preLabel, n1(pre) + '–6.4%', mm(pre) + '–47'], ['Diabetes range', '6.5% or higher', '48 or higher']],
        colors: [LVL[0], LVL[2], LVL[3]], mark: -1,
      },
      bounds: [
        'Everyone agrees on 6.5% (48 mmol/mol) for the diabetes range. Where the at-risk range starts differs: the ADA uses 5.7% (39 mmol/mol); NICE in the UK uses 6.0% (42 mmol/mol).',
        'A single result is not a diagnosis: diabetes is confirmed with a repeat test unless symptoms make it clear.',
      ].concat(A.hasTarget(s) ? ['Your doctor’s target, below ' + n1(s.target) + '%, is used for the target tile and the green line.'] : []),
      choice: { text: 'Bodies differ on where the at-risk range starts. You’re using ' + std.name + ': ' + std.preLabel.toLowerCase() + ' from ' + n1(pre) + '% (' + mm(pre) + ' mmol/mol). You can also set your doctor’s target and how often you’re tested.', bold: [std.name], used: std.name + ' ranges (at-risk from ' + n1(pre) + '%, diabetes range from 6.5%)' + (A.hasTarget(s) ? '; doctor’s target below ' + n1(s.target) + '%' : '') + '; next test every ' + (s.intervalMonths || 3) + ' months.' },
      footnote: 'A single result isn’t a diagnosis; your doctor looks at repeat tests and your overall health.',
      refs: ['ada', 'nice', 'adag', 'ifcc'],
    };
  }
  return null;
}

/* ---------------- The ? window ---------------- */
class HelpModal extends Modal {
  constructor(host, key) { super(host.app); this.host = host; this.key = key; }
  onOpen() {
    const h = helpFor(this.host, this.key);
    const el = this.contentEl;
    this.modalEl.addClass('hd-help-modal');
    if (!h) { el.createEl('p', { text: 'No help for this view yet.' }); return; }
    el.createEl('h2', { text: 'About the ' + h.title + ' dashboard' });
    el.createDiv({ cls: 'hd-help-intro', text: 'What each part shows, how it’s calculated, and where the numbers come from.' });
    const sec = (t) => el.createEl('h3', { cls: 'hd-help-h', text: t });
    // The term each line explains ("Average: …", "Cycle length = …") is shown in bold
    // [[#rrggbb]] in a line becomes a small colour swatch, next to the thing it describes
    // **bold**, *italic*
    const swatchText = (parent, t) => {
      t.split(/(\[\[#[0-9a-f]{6}\]\]|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/i).forEach((part) => {
        if (!part) return;
        let m;
        if ((m = /^\[\[(#[0-9a-f]{6})\]\]$/i.exec(part))) { const sw = parent.createSpan({ cls: 'hd-help-sw hd-help-sw-inline' }); sw.style.background = m[1]; }
        else if ((m = /^\*\*([^*]+)\*\*$/.exec(part))) parent.createEl('strong', { text: m[1] });
        else if ((m = /^\*([^*\s][^*]*)\*$/.exec(part))) parent.createEl('em', { text: m[1] });
        else parent.appendText(part);
      });
    };
    const list = (items, bold) => {
      const ul = el.createEl('ul', { cls: 'hd-help-list' });
      for (const t of items) {
        const li = ul.createEl('li');
        const m = bold && !t.includes('**') ? /^([^:=]{2,70}?)(:| =)(\s)/.exec(t) : null;
        if (m && !/[.!?\[]/.test(m[1])) swatchText(li, '**' + m[1] + '**' + t.slice(m[1].length));
        else swatchText(li, t);
      }
    };
    // Bold the setting in use inside a sentence
    const withBold = (parent, text, words) => {
      let rest = text;
      for (const w of words.filter(Boolean)) {
        const i = rest.indexOf(w);
        if (i < 0) continue;
        parent.appendText(rest.slice(0, i)); parent.createEl('strong', { text: w }); rest = rest.slice(i + w.length);
      }
      parent.appendText(rest);
    };
    sec('What you see'); list(h.what, true);
    sec('How it’s calculated'); list(h.calc, true);
    if (h.table || h.bounds.length) {
      sec('Why these boundaries');
      if (h.boundsIntro) swatchText(el.createEl('p', { cls: 'hd-help-p' }), h.boundsIntro);
      if (h.table) {
        const t = el.createEl('table', { cls: 'hd-help-table' });
        const hr = t.createEl('tr');
        for (const c of h.table.head) hr.createEl('th', { text: c });
        h.table.rows.forEach((r, i) => {
          const tr = t.createEl('tr', { cls: i === h.table.mark ? 'is-current' : '' });
          r.forEach((c, j) => {
            const td = tr.createEl('td');
            const col = h.table.colors && h.table.colors[i];
            if (col && (j === 0 || (j === r.length - 1 && c === ''))) { const sw = td.createSpan({ cls: 'hd-help-sw' }); sw.style.background = col; }
            td.appendText(c + (j === 0 && i === h.table.mark ? ' (yours)' : ''));
          });
        });
        if (h.table.foot) el.createDiv({ cls: 'hd-help-foot', text: h.table.foot });
      }
      for (const b of h.bounds) swatchText(el.createEl('p', { cls: 'hd-help-p' }), b);
    }
    const box = el.createDiv({ cls: 'hd-help-choice' + (h.choice ? '' : ' is-fixed') });
    if (h.choice) { box.createEl('strong', { text: 'This is a choice you can change. ' }); withBold(box, h.choice.text, h.choice.bold || []); }
    else box.appendText(h.fixed || '');
    const st = HELP_SETTINGS[this.key];
    if (st && (h.choice || this.key === 'overview' || this.key === 'meds')) {
      const b = box.createEl('button', { cls: 'mod-cta', text: 'Open ' + st[1] });
      b.onclick = () => { this.close(); openSettingsTab(this.app, st[0]); };
    }
    if (h.refs.length) {
      sec('Sources');
      const ol = el.createEl('ol', { cls: 'hd-help-src' });
      for (const k of h.refs) {
        const [text, url] = HELP_REFS[k];
        const li = ol.createEl('li');
        swatchText(li, text + ' ');
        const label = /doi\.org\//.test(url) ? 'doi:' + url.split('doi.org/')[1] : /pubmed/.test(url) ? 'PubMed ' + url.replace(/\D+/g, '') : url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
        li.createEl('a', { text: label, href: url, attr: { target: '_blank', rel: 'noopener', title: url } });
      }
    }
    el.createDiv({ cls: 'hd-help-disc', text: DISCLAIMER_SHORT + ' ' + (h.footnote || 'Talk to a qualified health professional about your results.') });
  }
  onClose() { this.contentEl.empty(); }
}
function openSettingsTab(app, id) {
  try { app.setting.open(); app.setting.openTabById(id); } catch (e) { new Notice('Open Settings and choose “' + id + '”.'); }
}

/* ---------------- PDF appendix ---------------- */
const pdfSafe = (t) => String(t).replace(/ ?\[\[#[0-9a-f]{6}\]\]/gi, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\s][^*]*)\*/g, '$1').replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/[−]/g, '-').replace(/[→]/g, '->').replace(/[“”]/g, '"').replace(/ /g, ' ');
/** Keys that get an appendix section (Doctor visits and Medications have no calculations to explain) */
const APPENDIX_KEYS = ['overview', 'period', 'migraine', 'bp', 'illness', 'a1c'];
/** Write "Appendix: how this report was calculated" for the given dashboards into a Report, then the disclaimer */
function writeAppendix(R, host, keys) {
  keys = keys.filter((k) => APPENDIX_KEYS.includes(k) && (k === 'overview' || host[k]));
  const refOrder = [];
  const num = (k) => { if (!refOrder.includes(k)) refOrder.push(k); return refOrder.indexOf(k) + 1; };
  const saved = R.accent;
  if (keys.length) {
    R.newPage();
    R.doc.text(R.M, R.y + 6, 'Appendix: how this report was calculated', { size: 16, bold: true });
    R.y += 22;
    R.para('The methods, boundaries and settings behind the figures in this report, with sources. Numbers in brackets refer to the references at the end.', { size: 8.5, color: KK.RC.muted });
    for (const k of keys) {
      const h = helpFor(host, k);
      if (!h) continue;
      R.accent = KK.MI.hexRgb(HELP_COLORS[k]);
      const refs = h.refs.map(num);
      R.heading(k === 'overview' ? 'Overview · Migraines and your cycle' : h.title, null, 60);
      const bullets = h.calc.concat(h.boundsIntro ? [h.boundsIntro] : [], h.bounds);
      for (const b of bullets) R.para('• ' + pdfSafe(b), { size: 8.6, after: 1 });
      if (h.table) {
        R.y += 4;
        const w = h.table.head.length === 4 ? [0.4, 0.22, 0.1, 0.28] : [0.4, 0.3, 0.3];
        const cols = h.table.colors;
        R.table(h.table.head.map((c, i) => ({ label: pdfSafe(c), w: w[i] })), h.table.rows.map((r, i) => r.map((c, j) => pdfSafe((cols && j === 0 ? '    ' : '') + c + (j === 0 && i === h.table.mark ? ' (used)' : '')))), {
          size: 8,
          drawCell: cols ? (ri, ci, b) => { if (ci === 0 && cols[ri]) R.doc.rect(b.x + b.pad, b.y + b.lh - 8.5, 8, 8, { fill: KK.MI.hexRgb(cols[ri]) }); if (ci === h.table.head.length - 1 && h.table.rows[ri][ci] === '' && cols[ri]) { R.doc.rect(b.x + b.pad, b.y + 1.5, Math.min(60, b.w - 2 * b.pad), b.lh - 1, { fill: KK.MI.hexRgb(cols[ri]) }); return true; } return false; } : null,
        });
        if (h.table.foot) R.para(pdfSafe(h.table.foot), { size: 7.5, color: KK.RC.muted });
      }
      if (h.choice) R.note(pdfSafe('Settings used in this report: ' + h.choice.used + (refs.length ? ' Sources: ' + refs.map((n) => '[' + n + ']').join(' ') : '')));
      else if (refs.length) R.para('Sources: ' + refs.map((n) => '[' + n + ']').join(' '), { size: 8, color: KK.RC.muted });
      R.y += 2;
    }
    R.accent = saved;
    if (refOrder.length) {
      R.heading('References');
      refOrder.forEach((k, i) => { const [t, u] = HELP_REFS[k]; R.para(pdfSafe((i + 1) + '. ' + t), { size: 7.6, color: KK.RC.ink, after: 0 }); R.para(u, { size: u.length > 110 ? 6.6 : 7.2, color: KK.RC.muted, indent: 10, after: 3 }); });
    }
  }
  writeDisclaimer(R);
}
function writeDisclaimer(R) {
  if (!R.doc.pages.length) R.newPage();
  const d = R.doc, lines = d.wrap(DISCLAIMER_PDF, R.W - 20, 8);
  const h = lines.length * 11 + 22;
  R.ensure(h + 14);
  R.y += 8;
  d.rect(R.M, R.y, R.W, h, { fill: KK.RC.panel });
  d.text(R.M + 10, R.y + 13, 'Disclaimer', { size: 8.5, bold: true });
  let yy = R.y + 25;
  for (const l of lines) { d.text(R.M + 10, yy, l, { size: 8, color: KK.RC.muted }); yy += 11; }
  R.y += h + 6;
}

/* Every single-dashboard report gets its appendix (or just the disclaimer) right before the page footers.
   The combined Health report turns this off and adds one appendix at the end. */
const REPORT_KEYS = { 'Period report': 'period', 'Migraine report': 'migraine', 'Blood pressure report': 'bp', 'Sickness report': 'illness', 'A1C report': 'a1c', 'Doctor visits report': 'visits', 'Medication list': 'meds', 'Health summary': 'overview' };
const APPENDIX = { host: null, combined: false };
(function hookReportFooter() {
  const orig = KK.Report.prototype.footerAll;
  KK.Report.prototype.footerAll = function (text) {
    const key = REPORT_KEYS[this.title];
    if (key && APPENDIX.host && !APPENDIX.combined && !this.__hdAppendix) {
      this.__hdAppendix = true;
      try { writeAppendix(this, APPENDIX.host, [key]); } catch (e) { console.error('Health Dashboard: appendix failed', e); }
    }
    return orig.call(this, text);
  };
})();
/** A separate appendix document for the combined report */
function buildAppendixPdf(host, keys, o) {
  const R = new KK.Report('Appendix', o && o.rangeText ? o.rangeText : '', '#7852ee');
  R.title = 'Health report · appendix';
  R.doc.pages.length = 0; R.y = 0;
  writeAppendix(R, host, keys);
  R.footerAll('Health report · appendix · for discussion with a clinician, not a diagnosis');
  return R.output();
}

/* ---------------- Expand any chart to see it larger ---------------- */
const CHART_SEL = 'svg.hd-chart, svg.pt-chart, svg.hk-chart, .mt-vbars, .mt-hbars, .hk-hbar, .pt-hbar';
const CARD_SEL = '.mt-card, .hk-card, .pt-card, .hd-card, .dv-card';
/** Adds an expand button to every card in `root` that holds a bar or line chart */
function addExpanders(root, app) {
  if (!root || !root.querySelectorAll) return;
  const cards = new Set();
  for (const ch of Array.from(root.querySelectorAll(CHART_SEL))) {
    const card = ch.closest ? ch.closest(CARD_SEL) : null;
    if (card && root.contains(card)) cards.add(card);
  }
  for (const card of cards) {
    if (Array.from(card.children).some((c) => c.classList && c.classList.contains('hd-expand-btn'))) continue;
    card.addClass('hd-has-expand');
    const b = card.createEl('button', { cls: 'clickable-icon hd-expand-btn', attr: { 'aria-label': 'Expand this chart' } });
    setIcon(b, 'maximize-2');
    b.onclick = (e) => { e.stopPropagation(); new ExpandModal(app || window.app, card).open(); };
  }
}
class ExpandModal extends Modal {
  constructor(app, card) { super(app); this.card = card; }
  onOpen() {
    this.modalEl.addClass('hd-expand-modal');
    const titleEl = this.card.querySelector('h3, h4, .mt-card-title');
    this.titleEl.setText(titleEl ? titleEl.textContent : 'Chart');
    const clone = this.card.cloneNode(true);
    clone.classList.remove('hd-sortable', 'is-moving', 'hd-has-expand');
    clone.removeAttribute('style');
    clone.querySelectorAll('.hd-expand-btn, .hd-resize, .hd-grip').forEach((n) => n.remove());
    if (titleEl) { const t = clone.querySelector('h3, h4, .mt-card-title'); if (t) t.remove(); }
    clone.addClass('hd-expand-body');
    // keep the theme variables the dashboard defines (colours of bars and bands)
    const scope = this.card.closest('.hd-root, .hk-dashboard, .pt-dashboard, .mt-dashboard, .dv-dashboard');
    const wrap = this.contentEl.createDiv({ cls: 'hd-expand-scope hd-root ' + (scope ? Array.from(scope.classList).filter((c) => /dashboard/.test(c)).join(' ') : '') });
    wrap.appendChild(clone);
    // a click on a bar or day in the copy has no handler; keep it read-only
    clone.querySelectorAll('button, [role="button"]').forEach((n) => n.setAttribute('tabindex', '-1'));
  }
  onClose() { this.contentEl.empty(); }
}

/* ---------------- Same header buttons, same order, on every dashboard ---------------- */
/** Period selector first, then logging buttons, then CSV, then the PDF report */
function normalizeHeader(root) {
  if (!root || !root.querySelector) return;
  let actions = null;
  for (const sel of ['.pt-actions', '.mt-dash-actions', '.dv-actions', '.hk-actions']) { actions = root.querySelector(sel); if (actions) break; }
  if (!actions || (actions.closest && actions.closest('.hd-board'))) return;
  actions.classList.add('hd-head-actions');
  const labelOf = (b) => { const sp = Array.from(b.querySelectorAll('span')).reverse().find((x) => x.textContent.trim()); return sp || null; };
  const rank = (b) => {
    if (b.tagName === 'SELECT') return 0;
    const t = (labelOf(b) || b).textContent.trim();
    if (/^csv$/i.test(t)) return 2;
    if (/report|pdf|print|medication list/i.test(t) || (b.querySelector && b.querySelector('[data-icon="file-text"], .lucide-file-text'))) return 3;
    return 1;
  };
  const kids = Array.from(actions.children);
  kids.forEach((b, i) => { b.__hdOrder = i; });
  kids.sort((a, b) => rank(a) - rank(b) || a.__hdOrder - b.__hdOrder);
  for (const b of kids) {
    if (b.detach) b.detach(); else if (b.remove) b.remove();
    actions.appendChild(b);
    if (b.tagName === 'BUTTON') b.classList.add('hd-head-btn');
    if (rank(b) === 1) b.classList.add('mod-cta'); // every logging button gets the accent colour, like Log migraine
    if (rank(b) === 3) { // same icon as the Migraine report button everywhere
      const ic = Array.from(b.children).find((c) => c.tagName === 'SPAN' && !c.textContent.trim());
      if (ic) { if (ic.empty) ic.empty(); setIcon(ic, 'file-text'); }
    }
    if (rank(b) === 3) { const l = labelOf(b); if (l) l.textContent = 'PDF report'; b.setAttribute('aria-label', 'Create a PDF report for your doctor'); }
  }
  const head = actions.parentElement || actions.parent;
  if (head) head.classList.add('hd-head');
  // CSV and PDF report move up to the tab row, on the right, like the Overview's report button
  let hub = actions; while (hub && !(hub.classList && hub.classList.contains('hd-root'))) hub = hub.parentElement || hub.parent;
  const tabRow = hub && hub.querySelector('.hd-tabrow');
  const moving = kids.filter((x) => rank(x) >= 2);
  if (tabRow && moving.length) { // a dashboard that re-renders brings fresh buttons; they replace the old ones
    for (const old of Array.from(tabRow.querySelectorAll('.hd-moved'))) { if (old.detach) old.detach(); else old.remove(); }
    for (const b of moving) {
      if (b.detach) b.detach(); else if (b.remove) b.remove();
      b.classList.add('hd-moved', 'hd-tabrow-btn');
      tabRow.appendChild(b);
    }
  }
}
