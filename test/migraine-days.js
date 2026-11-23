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
  eps = mig.getEpisodes(); const ep = eps.find((e) => e.days.length);
  const MM = PluginClass._migraine;
  assert.deepStrictEqual([MM.epDayPain(ep, '2026-11-03'), MM.epDayPain(ep, '2026-11-04'), MM.epDayPain(ep, '2026-11-05')], [3, 5, 5], 'day 1 keeps its pain, day 3 follows day 2');
  assert.deepStrictEqual(MM.epDay(ep, '2026-11-05').symptoms, ['Nausea', 'Light sensitivity']);
  assert.strictEqual(MM.epDay(ep, '2026-11-05').logged, false);
  // editing the old episode keeps it without a days list
  const eOld = eps.find((e) => !e.days.length);
  const m2 = new MM.EpisodeModal(mig, eOld); m2.open(); await m2.save(); await flush();
  assert(!('days' in app.__files.get('Migraine Log/Migraine 2026-10-01.md').fm), 'no days added to old notes');
  // resetting a day removes it
  const m3 = new MM.EpisodeModal(mig, ep); m3.open();
  m3.daysBox.querySelectorAll('.mt-day')[1].querySelector('button').click();
  m3.daysBox.querySelectorAll('.mt-day')[0].querySelector('button').click();
  await m3.save(); await flush();
  assert(!('days' in app.__files.get(f).fm), 'days removed when all reset');
  console.log('MIGRAINE DAYS OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
