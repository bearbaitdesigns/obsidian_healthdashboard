const pad = (n) => String(n).padStart(2, '0');
const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };
async function seedNew(app) {
  const add = (p, fm) => app.vault.create(p, '---\n' + Object.entries(fm).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n');
  // ~40 days of BP readings, morning higher
  for (let i = 40; i >= 1; i--) {
    const d = daysAgo(i);
    await add('Blood Pressure/Readings/' + d + ' 0730.md', { entry: 'bp-reading', date: d, time: '07:30', systolic: 132 + (i % 7), diastolic: 84 + (i % 4), pulse: 68 + (i % 5), arm: 'Left arm', position: 'Sitting', medications: i < 20 ? ['Amlodipine'] : [] });
    await add('Blood Pressure/Readings/' + d + ' 2100.md', { entry: 'bp-reading', date: d, time: '21:00', systolic: 124 + (i % 5), diastolic: 78 + (i % 3), pulse: 64 + (i % 4), arm: 'Left arm', position: 'Sitting', context: i % 9 === 0 ? ['After caffeine'] : [] });
  }
  // sickness
  await add('Health Log/Sickness/a.md', { entry: 'illness', start: daysAgo(70), end: daysAgo(64), type: 'Flu', severity: 'Severe', symptoms: ['Fever', 'Body aches', 'Cough'], temp_max: 39.2, temp_unit: 'C', medications: ['Paracetamol'], remedies: ['Rest', 'Fluids'], helped: ['Paracetamol', 'Rest'], saw_doctor: true, days_missed: 4 });
  await add('Health Log/Sickness/b.md', { entry: 'illness', start: daysAgo(25), end: daysAgo(22), type: 'Common cold', severity: 'Mild', symptoms: ['Runny or blocked nose', 'Sore throat'], remedies: ['Honey and lemon', 'Rest'], helped: ['Honey and lemon'] });
  await add('Health Log/Sickness/c.md', { entry: 'illness', start: daysAgo(1), type: 'Sore throat', severity: 'Moderate', symptoms: ['Sore throat'] });
  for (let i = 12; i >= 0; i--) await add('Health Log/Check-ins/' + daysAgo(i) + '.md', { entry: 'health-checkin', date: daysAgo(i), feeling: i < 2 ? 2 : 3 + (i % 3 === 0 ? 1 : 0), energy: i < 2 ? 2 : 3, sleep_hours: 7 + (i % 2) * 0.5 });
  // meds
  await add('Medications/Amlodipine 5 mg.md', { entry: 'medication', name: 'Amlodipine', strength: '5 mg', form: 'Tablet', kind: 'Prescription', dose: '1 tablet', schedule: 'Once a day', times: ['Morning'], purpose: ['Blood pressure'], prescriber: 'Dr. Sigrún Jónsdóttir', started: daysAgo(20), refill_date: daysAgo(-3) });
  await add('Medications/Magnesium.md', { entry: 'medication', name: 'Magnesium', strength: '400 mg', form: 'Tablet', kind: 'Supplement', dose: '1 tablet', schedule: 'Once a day', times: ['Bedtime'], purpose: ['Migraine prevention'], started: daysAgo(200) });
  await add('Medications/Sumatriptan.md', { entry: 'medication', name: 'Sumatriptan', strength: '50 mg', form: 'Tablet', kind: 'Prescription', dose: '1 tablet', schedule: 'As needed', purpose: ['Migraine relief'], instructions: 'Max 2 a day', started: daysAgo(300) });
  await add('Medications/Propranolol.md', { entry: 'medication', name: 'Propranolol', strength: '40 mg', schedule: 'Twice a day', times: ['Morning', 'Evening'], purpose: ['Migraine prevention'], started: daysAgo(400), stopped: daysAgo(30), stop_reason: 'Side effects', side_effects: 'Tiredness' });
  await add('Doctor Visits/v.md', { entry: 'doctor-visit', date: daysAgo(-5), doctor: 'Dr. Ari Magnússon', clinic: 'Landspítali', reason: 'Follow-up' });
  await add('Doctor Visits/w.md', { entry: 'doctor-visit', date: daysAgo(45), doctor: 'Dr. Sigrún Jónsdóttir', clinic: 'Heilsugæslan', reason: 'Check-up' });
}


module.exports={seedNew,daysAgo};