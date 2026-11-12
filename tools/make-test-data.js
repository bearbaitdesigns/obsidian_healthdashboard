// Generates a folder of realistic test notes for every Health Dashboard tracker, covering about 7 months.
// Usage: node tools/make-test-data.js <outDir> [endDate YYYY-MM-DD]
const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] || 'test-data';
const END = process.argv[3] || new Date().toISOString().slice(0, 10);
const TAG = 'health-test-data';

let seed = 20261112;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const some = (a, lo, hi) => { const n = lo + Math.floor(rnd() * (hi - lo + 1)); return a.slice().sort(() => rnd() - 0.5).slice(0, n); };
const chance = (p) => rnd() < p;
const pad = (n) => String(n).padStart(2, '0');
const D = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const K = (d) => d.toISOString().slice(0, 10);
const add = (k, n) => K(new Date(D(k).getTime() + n * 86400000));
const diff = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const START = add(END, -224); // about 7 months

let count = 0;
function note(rel, fm, body) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fm.tags = [TAG].concat(fm.tags || []);
  const y = Object.entries(fm).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => k + ':' + (Array.isArray(v) ? '\n' + v.map((x) => '  - ' + JSON.stringify(x)).join('\n') : ' ' + JSON.stringify(v))).join('\n');
  fs.writeFileSync(file, '---\n' + y + '\n---\n' + (body ? '\n' + body + '\n' : ''));
  count++;
}

/* ---------------- Period: cycles of 26–31 days, one long 38-day cycle ---------------- */
const cycleLens = [28, 27, 30, 38, 26, 29, 28, 31, 27];
const periodStarts = [];
for (let k = add(START, 3), i = 0; k <= END; k = add(k, cycleLens[i % cycleLens.length]), i++) periodStarts.push(k);
for (const [ci, st] of periodStarts.entries()) {
  const len = ci === 5 ? 8 : 4 + Math.floor(rnd() * 3); // one 8-day period
  const flows = ['medium', 'heavy', 'heavy', 'medium', 'light', 'light', 'light', 'spotting'];
  for (let i = 0; i < len; i++) {
    const d = add(st, i);
    if (d > END) break;
    const flow = i === len - 1 && len > 4 ? 'spotting' : flows[Math.min(i, flows.length - 2)];
    const pain = i === 0 ? 3 + (chance(0.35) ? 1 : 0) : i === 1 ? 2 + (chance(0.4) ? 1 : 0) : i < 3 ? 1 : 0;
    note('Period Tracker/Logs/' + d + '.md', {
      type: 'period-log', date: d, flow, pain,
      symptoms: i < 2 ? some(['Cramps', 'Bloating', 'Fatigue', 'Headache', 'Back pain', 'Mood swings'], 1, 3) : i < 3 ? ['Fatigue'] : [],
      medications: i === 0 || (i === 1 && chance(0.5)) ? ['Ibuprofen'] : [],
      notes: i === 0 && ci === 3 ? 'Late this month, cycle felt long.' : '',
    });
  }
  // a couple of days of pre-period symptoms, no bleeding
  const pre = add(st, -2);
  if (pre >= START && pre <= END && chance(0.6)) note('Period Tracker/Logs/' + pre + '.md', { type: 'period-log', date: pre, flow: 'none', pain: 1, symptoms: ['Bloating', 'Breast tenderness'], medications: [] });
}

/* ---------------- Migraine: about 3–5 a month, several around period day 1 ---------------- */
const TYPES = ['Migraine without aura', 'Migraine without aura', 'Migraine without aura', 'Migraine with aura', 'Menstrual migraine', 'Tension-type headache'];
const TOD = [['Morning', 7], ['Afternoon', 14], ['Evening', 18], ['Night', 22], ['Woke up with it', 6]];
const migDays = new Set();
for (const st of periodStarts) { const d = add(st, pick([-2, -1, 0, 0, 1, 2])); if (chance(0.75)) migDays.add(d); }
for (let k = START; k <= END; k = add(k, 1)) if (chance(0.085)) migDays.add(k);
const migList = [...migDays].filter((d) => d >= START && d <= END).sort();
migList.forEach((d, i) => {
  const near = periodStarts.some((s) => { const o = diff(s, d); return o >= -2 && o <= 2; });
  let type = near && chance(0.6) ? 'Menstrual migraine' : pick(TYPES);
  const aura = type === 'Migraine with aura' || chance(0.2);
  if (aura && type !== 'Migraine with aura' && type !== 'Menstrual migraine') type = 'Migraine with aura';
  const [tod, hr] = pick(TOD);
  const pain = type === 'Tension-type headache' ? 2 : Math.min(5, 2 + Math.floor(rnd() * 4));
  const ongoing = d === migList[migList.length - 1] && diff(d, END) <= 1;
  const lenDays = ongoing ? 0 : pain >= 4 && chance(0.5) ? 1 : 0;
  const end = add(d, lenDays);
  const endHr = lenDays ? 10 : Math.min(23, hr + 3 + Math.floor(rnd() * 6));
  const meds = [];
  const medFor = pain >= 4 ? pick(['Sumatriptan', 'Sumatriptan', 'Excedrin', 'Rizatriptan']) : pick(['Ibuprofen', 'Acetaminophen', 'Excedrin']);
  const dose = { Sumatriptan: '50 mg', Rizatriptan: '10 mg', Excedrin: '2 tablets', Ibuprofen: '400 mg', Acetaminophen: '1000 mg' }[medFor];
  const effect = pick(['Full relief', 'Some relief', 'Some relief', 'No relief', 'Not sure', '']);
  if (!(pain <= 2 && chance(0.4))) meds.push([medFor, dose, d + ' ' + pad(hr + 1) + ':00', '', effect].join(' | '));
  if (effect === 'No relief' && chance(0.7)) meds.push(['Ibuprofen', '400 mg', d + ' ' + pad(Math.min(23, hr + 3)) + ':00', '', pick(['Some relief', 'Not sure'])].join(' | '));
  if (pain >= 4 && chance(0.3)) meds.push(['Ondansetron', '4 mg', d, '', 'Some relief'].join(' | '));
  const sym = some(['Nausea', 'Light sensitivity', 'Sound sensitivity', 'Throbbing pain', 'Neck stiffness', 'Fatigue', 'Brain fog', 'Dizziness / vertigo', 'Smell sensitivity'], 2, 4);
  if (aura) sym.unshift('Visual aura');
  note('Migraine Log/Migraine ' + d + '.md', {
    entry: 'migraine', start: d + ' ' + pad(hr) + ':' + pick(['00', '15', '30', '45']), end: ongoing ? '' : end + ' ' + pad(endHr) + ':00', type,
    attack_location: pick(['Home', 'Home', 'Work', 'Work', 'Car / commute', 'Outdoors']), time_of_day: tod, time_of_day_end: ongoing ? '' : lenDays ? 'Morning' : pick(['Afternoon', 'Evening', 'Night', 'Gone after sleep']),
    pain_max: pain, pain_avg: Math.max(1, pain - 1 - (chance(0.4) ? 1 : 0)), symptoms: sym,
    triggers: (near ? ['Hormonal / menstrual'] : []).concat(some(['Stress', 'Poor sleep', 'Skipped meal', 'Dehydration', 'Weather change', 'Screen time', 'Alcohol', 'Bright lights', 'Caffeine withdrawal'], 1, 2)),
    relief: some(['Dark room', 'Sleep', 'Cold compress', 'Hydration', 'Caffeine', 'Massage'], 1, 2), medications: meds,
    head_location: some(['Left side', 'Right side', 'Behind left eye', 'Left temple', 'Forehead', 'Both sides'], 1, 2),
    notes: aura ? 'Zigzag lines in vision for about 20 minutes before the headache.' : '',
  });
});

/* ---------------- Blood pressure: morning and evening, improving after Amlodipine ---------------- */
const amloStart = add(END, -100);
for (let k = add(START, 10); k <= END; k = add(k, 1)) {
  if (chance(0.12)) continue; // missed days
  const t = diff(START, k) / 224, onMed = k >= amloStart;
  const drift = onMed ? -Math.min(10, diff(amloStart, k) * 0.15) : 0;
  for (const [time, base, label] of [['07:' + pick(['10', '20', '30', '45']), [138, 88], 'am'], ['21:' + pick(['00', '15', '30']), [129, 82], 'pm']]) {
    if (label === 'pm' && chance(0.2)) continue;
    const sys = Math.round(base[0] + drift + (rnd() - 0.5) * 12 + (t < 0.3 ? 2 : 0));
    const dia = Math.round(base[1] + drift * 0.5 + (rnd() - 0.5) * 8);
    note('Blood Pressure/Readings/' + k + ' ' + time.replace(':', '') + '.md', {
      entry: 'bp-reading', date: k, time, systolic: sys, diastolic: dia, pulse: Math.round(70 + (rnd() - 0.5) * 12),
      arm: 'Left arm', position: 'Sitting', context: chance(0.08) ? [pick(['After caffeine', 'After exercise', 'Stressed', 'Felt unwell'])] : [],
      medications: onMed && label === 'am' ? ['Amlodipine'] : [],
    });
  }
}
note('Blood Pressure/Readings/' + add(END, -150) + ' 1840.md', { entry: 'bp-reading', date: add(END, -150), time: '18:40', systolic: 168, diastolic: 104, pulse: 88, arm: 'Left arm', position: 'Sitting', context: ['Stressed'], notes: 'Headache and stressed after work. Rechecked 15 minutes later: 146/94.' });

/* ---------------- Sickness ---------------- */
const ill = [
  [-205, 7, 'Flu', 'Severe', ['Fever', 'Chills', 'Body aches', 'Cough', 'Fatigue'], 39.1, ['Paracetamol', 'Ibuprofen'], ['Rest', 'Fluids', 'Honey and lemon'], ['Paracetamol', 'Rest'], true, 4, 'Influenza A (rapid test)'],
  [-160, 4, 'Common cold', 'Mild', ['Runny or blocked nose', 'Sore throat', 'Sneezing'], null, [], ['Honey and lemon', 'Steam inhalation'], ['Honey and lemon'], false, 0, ''],
  [-118, 2, 'Stomach bug', 'Moderate', ['Nausea', 'Vomiting', 'Diarrhea'], 37.9, ['Oral rehydration salts'], ['Rest', 'Bland food'], ['Oral rehydration salts'], false, 1, ''],
  [-74, 5, 'COVID-19', 'Moderate', ['Fever', 'Cough', 'Fatigue', 'Sore throat', 'Headache'], 38.4, ['Paracetamol'], ['Rest', 'Fluids'], ['Rest'], false, 3, 'Positive home test'],
  [-33, 6, 'Sinus infection', 'Moderate', ['Runny or blocked nose', 'Headache', 'Facial pain'], 37.8, ['Amoxicillin', 'Saline spray'], ['Steam inhalation'], ['Amoxicillin', 'Saline spray'], true, 1, 'Acute sinusitis'],
  [-2, null, 'Sore throat', 'Mild', ['Sore throat'], null, [], ['Honey and lemon'], [], false, 0, ''],
];
for (const [off, len, type, sev, sym, temp, meds, rem, helped, doc, missed, dx] of ill) {
  const st = add(END, off);
  note('Health Log/Sickness/' + st + ' ' + type + '.md', {
    entry: 'illness', start: st, end: len ? add(st, len - 1) : '', type, severity: sev, symptoms: sym, temp_max: temp, temp_unit: temp ? 'C' : '',
    medications: meds, remedies: rem, helped, saw_doctor: doc, days_missed: missed, diagnosis: dx,
  });
}

/* ---------------- Medications ---------------- */
const meds = [
  { name: 'Amlodipine', strength: '5 mg', form: 'Tablet', kind: 'Prescription', dose: '1 tablet', schedule: 'Once a day', times: ['Morning'], purpose: ['Blood pressure'], prescriber: 'Dr. Sigrún Jónsdóttir', pharmacy: 'Lyfja Smáralind', started: amloStart, refill_date: add(END, 4) },
  { name: 'Magnesium', strength: '400 mg', form: 'Tablet', kind: 'Supplement', dose: '1 tablet', schedule: 'Once a day', times: ['Bedtime'], purpose: ['Migraine prevention'], started: add(END, -260) },
  { name: 'Vitamin D', strength: '2000 IU', form: 'Capsule', kind: 'Supplement', dose: '1 capsule', schedule: 'Once a day', times: ['Morning'], purpose: ['Low vitamin D'], started: add(END, -190) },
  { name: 'Sumatriptan', strength: '50 mg', form: 'Tablet', kind: 'Prescription', dose: '1 tablet', schedule: 'As needed', purpose: ['Migraine relief'], instructions: 'At the start of a migraine. May repeat after 2 hours. Max 2 a day.', prescriber: 'Dr. Ari Magnússon', started: add(END, -400), refill_date: add(END, -2) },
  { name: 'Ibuprofen', strength: '400 mg', form: 'Tablet', kind: 'Over the counter', dose: '1 tablet', schedule: 'As needed', purpose: ['Pain', 'Period cramps'], instructions: 'With food', started: add(END, -700) },
  { name: 'Ondansetron', strength: '4 mg', form: 'Tablet', kind: 'Prescription', dose: '1 tablet', schedule: 'As needed', purpose: ['Nausea'], prescriber: 'Dr. Ari Magnússon', started: add(END, -140) },
  { name: 'Propranolol', strength: '40 mg', form: 'Tablet', kind: 'Prescription', dose: '1 tablet', schedule: 'Twice a day', times: ['Morning', 'Evening'], purpose: ['Migraine prevention'], prescriber: 'Dr. Ari Magnússon', started: add(END, -330), stopped: add(END, -145), stop_reason: 'Side effects', side_effects: 'Tiredness and cold hands' },
  { name: 'Amoxicillin', strength: '500 mg', form: 'Capsule', kind: 'Prescription', dose: '1 capsule', schedule: 'Three times a day', times: ['Morning', 'Afternoon', 'Evening'], purpose: ['Sinus infection'], prescriber: 'Dr. Sigrún Jónsdóttir', started: add(END, -32), stopped: add(END, -25), stop_reason: 'Course finished' },
];
for (const m of meds) note('Medications/' + m.name + ' ' + m.strength.replace(/µ/g, 'u') + '.md', Object.assign({ entry: 'medication' }, m));

/* ---------------- A1C: every 3 months ---------------- */
const a1c = [[-395, 6.4, 'Lab blood test'], [-300, 6.2, 'Lab blood test'], [-210, 6.1, 'Lab blood test'], [-120, 5.9, 'Lab blood test'], [-28, 5.8, 'Finger-prick at clinic']];
for (const [off, pct, t] of a1c) {
  const d = add(END, off);
  note('A1C/A1C ' + d + '.md', { entry: 'a1c-result', date: d, a1c_percent: pct, a1c_mmol_mol: Math.round((pct - 2.15) * 10.929), test_type: t, lab: t === 'Lab blood test' ? 'Landspítali lab' : 'Heilsugæslan', ordered_by: 'Dr. Sigrún Jónsdóttir', fasting_glucose: Math.round((5.4 + (pct - 5.8) * 0.8) * 10) / 10, glucose_unit: 'mmol/L', notes: off === -120 ? 'Started walking 30 minutes a day.' : '' });
}

/* ---------------- Doctor visits ---------------- */
const visits = [
  [-200, '10:30', 'Heilsugæslan', 'Dr. Sigrún Jónsdóttir', 'General practice', 'In person', 'Flu not getting better', ['illness'], 'Fever for 5 days. Chest sounded clear.', 'Viral flu; no antibiotics needed.', 'Rest, fluids, paracetamol. Come back if breathing gets worse.', [], [], ''],
  [-185, '14:00', 'Landspítali', 'Dr. Ari Magnússon', 'Neurology', 'In person', 'Migraine review', ['migraine'], 'Migraines 4–5 a month, often around my period. Propranolol makes me tired.', 'Probable menstrually related migraine. Keep a diary for 3 cycles.', 'Track migraines and periods. Try magnesium. Review in 3 months.', [], ['Start Magnesium 400 mg at bedtime'], add(END, -95)],
  [-145, '09:15', 'Landspítali', 'Dr. Ari Magnússon', 'Neurology', 'Video', 'Side effects from propranolol', ['migraine', 'meds'], 'Tiredness and cold hands since starting propranolol.', 'Stop propranolol.', 'Use ondansetron for nausea during attacks.', [], ['Stop Propranolol 40 mg', 'Start Ondansetron 4 mg as needed'], ''],
  [-120, '08:40', 'Heilsugæslan', 'Dr. Sigrún Jónsdóttir', 'General practice', 'In person', 'Annual check-up', ['bp', 'a1c'], 'Home blood pressure averaging about 136/87. A1C 5.9%.', 'Elevated blood pressure at home; A1C in the prediabetes range but improving.', 'Keep logging blood pressure morning and evening for 2 weeks. Walk daily.', ['A1C', 'Lipid panel', 'Kidney function'], [], add(END, -100)],
  [-100, '11:00', 'Heilsugæslan', 'Dr. Sigrún Jónsdóttir', 'General practice', 'In person', 'Blood pressure follow-up', ['bp'], 'Two weeks of home readings, mostly above 135/85.', 'Hypertension confirmed with home readings.', 'Start amlodipine 5 mg in the morning. Recheck in 6 weeks.', [], ['Start Amlodipine 5 mg once a day'], add(END, -58)],
  [-95, '15:30', 'Landspítali', 'Dr. Ari Magnússon', 'Neurology', 'In person', 'Migraine review (3 months)', ['migraine', 'period'], 'Diary shows most migraines start 2 days before to 2 days after period day 1.', 'Menstrually related migraine likely.', 'Sumatriptan at onset. Consider short-term prevention around periods.', [], [], add(END, 5)],
  [-56, '10:00', 'Heilsugæslan', 'Dr. Sigrún Jónsdóttir', 'General practice', 'Phone', 'Blood pressure recheck', ['bp'], 'Home average now around 128/82 on amlodipine.', 'Good response.', 'Continue amlodipine. Next review in 6 months.', [], [], ''],
  [-30, '09:00', 'Heilsugæslan', 'Dr. Sigrún Jónsdóttir', 'General practice', 'In person', 'Sinus pain and fever', ['illness'], 'Facial pain and blocked nose for 10 days, fever 37.8.', 'Acute sinusitis.', 'Amoxicillin for 7 days and saline spray.', [], ['Start Amoxicillin 500 mg for 7 days'], ''],
  [5, '13:45', 'Landspítali', 'Dr. Ari Magnússon', 'Neurology', 'In person', 'Migraine follow-up', ['migraine'], '', '', '', [], [], ''],
];
for (const [off, time, clinic, doctor, spec, vt, reason, related, discussed, outcome, next, tests, changes, fu] of visits) {
  const d = add(END, off);
  note('Doctor Visits/' + d + ' ' + doctor.replace(/^Dr\. /, '') + '.md', {
    entry: 'doctor-visit', date: d, time, clinic, doctor, specialty: spec, visit_type: vt, reason, related,
    questions: off > 0 ? 'Is it worth trying prevention just around my period? Can I take sumatriptan with amlodipine?' : '',
    discussed, outcome, next_steps: next, tests, med_changes: changes, follow_up: fu, tags: ['doctor-visit'],
  });
}

/* ---------------- General and tracker notes ---------------- */
const notes = [
  ['general', -170, 'Started a new job', 'New job with longer hours; sleeping later than usual.'],
  ['general', -60, 'Holiday', 'Two weeks away. Fewer headaches while relaxed, but blood pressure readings were skipped.'],
  ['migraine', -90, 'Pattern I noticed', 'Most migraines seem to come just before or on the first day of my period.'],
  ['bp', -99, 'New monitor', 'Started using a validated upper-arm monitor (Omron M3). Earlier readings were from a wrist monitor.'],
  ['period', -40, 'Heavier this month', 'Needed to change pads every 2 hours on day 2.'],
  ['a1c', -27, 'Diet changes', 'Cut down on sugary drinks since the summer.'],
  ['meds', -144, 'Why I stopped propranolol', 'Felt exhausted and had cold hands; agreed with Dr. Magnússon to stop.'],
];
for (const [t, off, title, text] of notes) {
  const d = add(END, off);
  note('Health Notes/Notes/' + { general: 'General', migraine: 'Migraine', bp: 'Blood pressure', period: 'Period', a1c: 'A1C', meds: 'Medications' }[t] + '/' + d + ' ' + title + '.md', { entry: 'health-note', tracker: t, date: d, title, note: text });
}

/* ---------------- Records without an exact date ---------------- */
const mo = add(START, 20).slice(0, 7);
note('Health Notes/Missed records/Migraine ' + mo + '.md', { entry: 'missed-event', tracker: 'migraine', month: mo, count: 2, severity: 'Moderate', notes: 'Forgot to log two migraines while travelling.' });
note('Health Notes/Missed records/Migraine unknown.md', { entry: 'missed-event', tracker: 'migraine', roughly: 'Sometime in early spring', count: 1, severity: 'Severe' });
note('Health Notes/Missed records/Period ' + add(START, -25) + '.md', { entry: 'missed-event', tracker: 'period', from: add(START, -27), to: add(START, -23), roughly: 'Before I started tracking', length_days: 5 });

console.log('Wrote ' + count + ' notes to ' + OUT + ' (' + START + ' to ' + END + ')');
