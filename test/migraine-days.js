require('./clock');
const assert = require('assert'); const path = require('path');
const { registry, makeApp, Modal } = require('./mock');
const PluginClass = require(path.resolve(process.argv[2]));
const flush = () => new Promise((r) => setTimeout(r, 350));
(async () => {
  const app = makeApp();
  // an older episode without days stays as it is
  await app.vault.create('Migraine Log/Migraine 2026-10-01.md', '---\nentry: "migraine"\nstart: "2026-10-01"\nend: "2026-10-02"\npain_max: 4\npain_avg: 3\nsymptoms: ["Nausea"]\n---\n');
  const host = new PluginClass(app, { id: 'health-dashboard', name: 'Health Dashboard' }); host._loaded = true; await host.onload(); await flush();
  const mig = host.migraine;
  const M = PluginClass._migraine || null;
  let eps = mig.getEpisodes();
  assert.strictEqual(eps.length, 1); assert.deepStrictEqual(eps[0].days, []);
  // new 3-day episode: change day 2, leave day 3 (it keeps day 2's values)
  registry.commands['migraine-tracker:log-migraine'].callback();
  const m = Modal.opened[Modal.opened.length - 1];
  m.startInput.value = '2026-11-03'; m.endInput.value = '2026-11-05'; m.updateDuration();
  m.maxPain.set(3); m.symChips.toggle('Nausea');
  const days = m.daysBox.querySelectorAll('.mt-day');
  assert.strictEqual(days.length, 3, 'one row per day');
  // "Change this day" on day 2
  days[1].querySelector('button').click();
  const st2 = m.dayState.get('2026-11-04'); assert(st2, 'day 2 now logged');
  st2.pain = 5; st2.symptoms = ['Nausea', 'Light sensitivity']; m.renderDays();
  const text = m.daysBox.textContent;
  assert(text.includes('same as day 2'), 'day 3 follows day 2: ' + text);
  await m.save(); await flush();
  const f = [...app.__files.keys()].find((k) => k.includes('Migraine 2026-11-03'));
  const fm = app.__files.get(f).fm;
  console.log('saved days:', JSON.stringify(fm.days), 'pain_max', fm.pain_max, 'symptoms', fm.symptoms);
  assert.deepStrictEqual(fm.days, [{ date: '2026-11-03', pain: 3, symptoms: ['Nausea'] }, { date: '2026-11-04', pain: 5, symptoms: ['Nausea', 'Light sensitivity'] }]);
  assert.strictEqual(fm.pain_max, 5, 'peak includes day 2'); assert(fm.symptoms.includes('Light sensitivity'));
  assert.strictEqual(fm.pain_avg, 4.3, 'average worked out from days 3, 5, 5'); assert.strictEqual(fm.pain_avg_auto, true);
  assert(!m.avgPain, 'no average pain question');
  eps = mig.getEpisodes(); const ep = eps.find((e) => e.days.length);
  const MM = PluginClass._migraine;
  assert.deepStrictEqual([MM.epDayPain(ep, '2026-11-03'), MM.epDayPain(ep, '2026-11-04'), MM.epDayPain(ep, '2026-11-05')], [3, 5, 5], 'day 1 keeps its pain, day 3 follows day 2');
  assert.deepStrictEqual(MM.epDay(ep, '2026-11-05').symptoms, ['Nausea', 'Light sensitivity']);
  assert.strictEqual(MM.epDay(ep, '2026-11-05').logged, false);
  // editing the old episode keeps it without a days list
  const eOld = eps.find((e) => !e.days.length);
  const m2 = new MM.EpisodeModal(mig, eOld); m2.open(); await m2.save(); await flush();
  const oldFm = app.__files.get('Migraine Log/Migraine 2026-10-01.md').fm;
  assert(!('days' in oldFm), 'no days added to old notes');
  assert.strictEqual(oldFm.pain_avg, 3, 'older episode keeps the average entered'); assert(!('pain_avg_auto' in oldFm));
  // an ongoing new episode: average follows the days, and End now works it out again
  registry.commands['migraine-tracker:log-migraine'].callback();
  const mo = Modal.opened[Modal.opened.length - 1];
  mo.startInput.value = '2026-11-08'; mo.endInput.value = ''; mo.maxPain.set(4); mo.updateDuration();
  await mo.save(); await flush();
  const on = mig.getEpisodes().find((e) => !e.end);
  assert.strictEqual(on.painAvg, 4); assert.strictEqual(on.avgAuto, true);
  await mig.endEpisode(on); await flush();
  assert.strictEqual(app.__files.get(on.file.path).fm.pain_avg, 4);
  // resetting a day removes it
  const m3 = new MM.EpisodeModal(mig, ep); m3.open();
  m3.daysBox.querySelectorAll('.mt-day')[1].querySelector('button').click();
  m3.daysBox.querySelectorAll('.mt-day')[0].querySelector('button').click();
  await m3.save(); await flush();
  assert(!('days' in app.__files.get(f).fm), 'days removed when all reset');

  // --- Log day / Migraine started, like periods
  const MM2 = PluginClass._migraine;
  const fmOfDay = (k) => { const f = [...app.__files.keys()].find((x) => x.includes('Migraine ' + k)); return f && app.__files.get(f).fm; };
  // a day with no migraine starts one (ongoing, since it is today)
  let dm = new MM2.MigraineDayModal(mig, new Date(2026, 9, 20)); dm.open();
  assert(dm.contentEl.textContent.includes('starts a new one'), 'says it starts a new migraine');
  dm.maxPain.set(4); dm.headChips.toggle('Left side'); dm.symChips.toggle('Nausea'); dm.reliefChips.toggle('Dark room');
  dm.addMedRow({ name: 'Sumatriptan', dose: '50 mg', date: '', time: '10:00', effect: 'Some relief' });
  dm.endedCb.checked = false;
  await dm.save(); await flush();
  let d1 = fmOfDay('2026-10-20');
  console.log('day 1:', JSON.stringify(d1.days), d1.medications, d1.end);
  assert(!d1.end, 'ongoing'); assert.strictEqual(d1.pain_max, 4); assert.deepStrictEqual(d1.head_location, ['Left side']);
  assert.deepStrictEqual(d1.days[0].relief, ['Dark room']); assert(d1.medications[0].startsWith('Sumatriptan | 50 mg | 2026-10-20'));
  // day 2 is filled in from day 1; log it with lower pain and end it
  dm = new MM2.MigraineDayModal(mig, new Date(2026, 9, 21)); dm.open();
  assert(dm.contentEl.textContent.includes('Day 2 of the migraine'), 'day 2 of the same migraine');
  assert.strictEqual(dm.maxPain.get(), 4, 'pain carried over'); assert.deepStrictEqual(dm.symChips.values(), ['Nausea']);
  assert.strictEqual(dm.medRowEls.length, 0, 'medications are per day');
  dm.maxPain.set(2); dm.endedCb.checked = true;
  await dm.save(); await flush();
  d1 = fmOfDay('2026-10-20');
  assert.strictEqual(d1.end, '2026-10-21'); assert.strictEqual(d1.days.length, 2); assert.strictEqual(d1.pain_max, 4); assert.strictEqual(d1.pain_avg, 3);
  assert.strictEqual(d1.medications.length, 1, 'day 1 medication kept');
  // editing day 1 again replaces only that day's medication
  dm = new MM2.MigraineDayModal(mig, new Date(2026, 9, 20)); dm.open();
  assert.strictEqual(dm.medRowEls.length, 1, 'day 1 medication shown'); assert.deepStrictEqual(dm.reliefChips.values(), ['Dark room']);
  // Migraine started: one tap starts today's episode, then the day window opens
  await mig.migraineStarted(); await new Promise((r) => setTimeout(r, 500));
  // the report explains the change
  assert(Modal.opened[Modal.opened.length - 1] instanceof MM2.MigraineDayModal, 'day window opens after Migraine started');
  console.log('MIGRAINE DAYS OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
