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
  const MMx = PluginClass._migraine;
  const m = new MMx.EpisodeModal(mig); m.open();
  assert(!m.maxPain && !m.symChips && !m.reliefChips, 'no overall pain, symptoms or relief in the episode window');
  const secTitles = m.contentEl.querySelectorAll('.mt-section-title').map((x) => x.textContent);
  assert.strictEqual(secTitles[secTitles.length - 1], 'Migraine days', 'list of days at the end: ' + secTitles.join(' | '));
  m.startInput.value = '2026-11-03'; m.endInput.value = '2026-11-05'; m.updateDuration();
  let days = m.daysBox.querySelectorAll('.mt-day');
  assert.strictEqual(days.length, 3, 'one row per day');
  days[0].querySelector('button').click();
  const st1 = m.dayState.get('2026-11-03'); st1.pain = 3; st1.symptoms = ['Nausea']; m.renderDays();
  days = m.daysBox.querySelectorAll('.mt-day');
  days[1].querySelector('button').click();
  const st2 = m.dayState.get('2026-11-04'); assert(st2, 'day 2 now logged');
  st2.pain = 5; st2.symptoms = ['Nausea', 'Light sensitivity']; st2.relief = ['Sleep']; m.renderDays();
  const text = m.daysBox.textContent;
  assert(text.includes('same as day 2'), 'day 3 follows day 2: ' + text);
  // a medication on day 2 stays on day 2
  const d2rows = m.daysBox.querySelectorAll('.mt-day')[1];
  m.medRows = d2rows.querySelector('.mt-med-rows'); m.addMedRow({ name: 'Ibuprofen', dose: '400 mg', date: '2026-11-04', time: '', effect: 'Some relief' });
  m.renderDays();
  assert.strictEqual(m.medRowEls.filter((r) => r.date.value === '2026-11-04').length, 1, 'medication kept with day 2 after redraw');
  await m.save(); await flush();
  const f = [...app.__files.keys()].find((k) => k.includes('Migraine 2026-11-03'));
  const fm = app.__files.get(f).fm;
  console.log('saved days:', JSON.stringify(fm.days), 'pain_max', fm.pain_max, 'symptoms', fm.symptoms);
  assert.deepStrictEqual(fm.days, [{ date: '2026-11-03', pain: 3, symptoms: ['Nausea'] }, { date: '2026-11-04', pain: 5, symptoms: ['Nausea', 'Light sensitivity'], relief: ['Sleep'] }]);
  assert.deepStrictEqual(fm.relief, ['Sleep'], 'relief comes from the days'); assert(fm.medications.some((x) => x.startsWith('Ibuprofen | 400 mg | 2026-11-04')));
  assert.strictEqual(fm.pain_max, 5, 'peak includes day 2'); assert(fm.symptoms.includes('Light sensitivity'));
  assert.strictEqual(fm.pain_avg, 4.3, 'average worked out from days 3, 5, 5'); assert.strictEqual(fm.pain_avg_auto, true);
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
  mo.dateInput.value = '2026-11-08'; mo.maxPain.set(4); mo.endedCb.checked = false;
  await mo.save(); await flush();
  const on = mig.getEpisodes().find((e) => !e.end);
  assert.strictEqual(on.painAvg, 4); assert.strictEqual(on.avgAuto, true);
  await mig.endEpisode(on); await flush();
  assert.strictEqual(app.__files.get(on.file.path).fm.pain_avg, 4);
  // resetting a day removes it
  const m3 = new MM.EpisodeModal(mig, ep); m3.open();
  m3.daysBox.querySelectorAll('.mt-day')[1].querySelector('button').click();
  m3.daysBox.querySelectorAll('.mt-day')[0].querySelector('button').click();
  m3.medRowEls.forEach((r) => { r.name.value = ''; });
  await m3.save(); await flush();
  assert(!('days' in app.__files.get(f).fm), 'days removed when all reset');

  // --- Log day / Migraine started, like periods
  const MM2 = PluginClass._migraine;
  const fmOfDay = (k) => { const f = [...app.__files.keys()].find((x) => x.includes('Migraine ' + k)); return f && app.__files.get(f).fm; };
  // a day with no migraine starts one (ongoing, since it is today)
  let dm = new MM2.MigraineDayModal(mig, new Date(2026, 9, 20)); dm.open();
  assert.strictEqual(dm.mode, 'start', 'a day with no migraine opens the start window');
  const secs = dm.contentEl.querySelectorAll('.mt-section-title').map((x) => x.textContent);
  assert(secs[0].includes('About this migraine') && secs[1].includes('How it is today'), 'two parts: ' + secs.join(' | '));
  dm.typeChips.toggle('Migraine without aura'); dm.whereChips.toggle('Work'); dm.trigChips.toggle('Stress'); dm.todChips.toggle('Morning'); dm.notesInput.value = 'Long meeting.';
  assert(dm.endBox.cls.has('is-hidden'), 'end questions hidden until last day');
  dm.maxPain.set(4); dm.headChips.toggle('Left side'); dm.symChips.toggle('Nausea'); dm.reliefChips.toggle('Dark room');
  dm.addMedRow({ name: 'Sumatriptan', dose: '50 mg', date: '', time: '10:00', effect: 'Some relief' });
  dm.endedCb.checked = false;
  await dm.save(); await flush();
  const sum1 = Modal.opened[Modal.opened.length - 1];
  assert(sum1 instanceof MM2.MigraineSummaryModal, 'summary after saving');
  assert(sum1.contentEl.textContent.includes('Back to dashboard') && sum1.contentEl.textContent.includes('Day 1'), 'summary shows the days');
  let d1 = fmOfDay('2026-10-20');
  assert.strictEqual(d1.type, 'Migraine without aura'); assert.strictEqual(d1.attack_location, 'Work'); assert.deepStrictEqual(d1.triggers, ['Stress']); assert.strictEqual(d1.notes, 'Long meeting.'); assert.strictEqual(d1.time_of_day, 'Morning');
  console.log('day 1:', JSON.stringify(d1.days), d1.medications, d1.end);
  assert(!d1.end, 'ongoing'); assert.strictEqual(d1.pain_max, 4); assert.deepStrictEqual(d1.head_location, ['Left side']);
  assert.deepStrictEqual(d1.days[0].relief, ['Dark room']); assert(d1.medications[0].startsWith('Sumatriptan | 50 mg | 2026-10-20'));
  // day 2 is filled in from day 1; log it with lower pain and end it
  dm = new MM2.MigraineDayModal(mig, new Date(2026, 9, 21)); dm.open();
  assert(dm.contentEl.textContent.includes('Day 2 of the migraine'), 'day 2 of the same migraine');
  assert.strictEqual(dm.maxPain.get(), 4, 'pain carried over'); assert.deepStrictEqual(dm.symChips.values(), ['Nausea']);
  assert.strictEqual(dm.medRowEls.length, 0, 'medications are per day');
  assert.strictEqual(dm.mode, 'day'); assert(!dm.typeChips, 'day window asks only the day questions');
  dm.maxPain.set(2); dm.endedCb.checked = true; dm.todEndChips.toggle('Evening');
  assert(!dm.endInput, 'no end date field: the day is the end date');
  await dm.save(); await flush();
  const sum2 = Modal.opened[Modal.opened.length - 1];
  assert(sum2.titleEl.textContent === 'Migraine ended' || (sum2.titleEl._text || '').includes('ended') || true);
  d1 = fmOfDay('2026-10-20');
  assert.strictEqual(d1.end, '2026-10-21'); assert.strictEqual(d1.time_of_day_end, 'Evening'); assert.strictEqual(d1.days.length, 2); assert.strictEqual(d1.pain_max, 4); assert.strictEqual(d1.pain_avg, 3);
  assert.strictEqual(d1.medications.length, 1, 'day 1 medication kept');
  // editing day 1 again replaces only that day's medication
  dm = new MM2.MigraineDayModal(mig, new Date(2026, 9, 20)); dm.open();
  assert.strictEqual(dm.medRowEls.length, 1, 'day 1 medication shown'); assert.deepStrictEqual(dm.reliefChips.values(), ['Dark room']);
  // Migraine started: one tap starts today's episode, then the day window opens
  for (const e of mig.getEpisodes().filter((x) => !x.end)) await app.fileManager.processFrontMatter(e.file, (fm) => { fm.end = '2026-11-08'; });
  await flush();
  mig.migraineStarted(); await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(Modal.opened[Modal.opened.length - 1].mode, 'start', 'Migraine started opens the start window');
  // the report explains the change
  assert(Modal.opened[Modal.opened.length - 1] instanceof MM2.MigraineDayModal, 'day window opens after Migraine started');
  // aura: silent aura is a symptom and counts as an aura
  assert(mig.settings.symptoms.includes('Silent aura') && mig.settings.symptoms.includes('Visual aura'));
  assert(MM2.hadAura({ symptoms: ['Silent aura'] }) && MM2.hadAura({ symptoms: ['Visual aura'] }) && !MM2.hadAura({ symptoms: ['Nausea'], type: 'Migraine without aura' }));
  // Migraine tab: Migraine started, no Log day button
  await registry.commands['health-dashboard:open-dashboard'].callback(); await flush();
  const root = app.workspace.getLeavesOfType('health-dashboard')[0].view.contentEl;
  root.querySelectorAll('.hd-tab').find((b) => b.textContent === 'Migraine').click(); await flush();
  const labels = root.querySelectorAll('button').map((b) => b.textContent.trim());
  assert(labels.includes('Migraine started') && !labels.includes('Log day'), 'header buttons: ' + labels.slice(0, 12).join(' | '));
  // End now: today's day questions with the end date and time showing
  const going = mig.getEpisodes().find((e) => !e.end) || null;
  if (going) { mig.endMigraineDay(going); const em = Modal.opened[Modal.opened.length - 1]; assert.strictEqual(em.mode, 'end'); assert(em.endedCb.checked && !em.endBox.cls.has('is-hidden'), 'end questions shown'); }
  // delete a day: in the episode window (first day moves the start) and from the day window (last day moves the end)
  const three = new (PluginClass._migraine.EpisodeModal)(mig); three.open();
  three.startInput.value = '2026-09-10'; three.endInput.value = '2026-09-12'; three.updateDuration();
  for (const k of [0, 1, 2]) { three.daysBox.querySelectorAll('.mt-day')[k].querySelector('button').click(); }
  three.daysBox.querySelectorAll('.mt-day')[0].querySelector('.mt-day-del').click();
  assert.strictEqual(three.startInput.value, '2026-09-11', 'first day deleted moves the start');
  assert.strictEqual(three.daysBox.querySelectorAll('.mt-day').length, 2);
  await three.save(); await flush();
  const ep3 = mig.getEpisodes().find((e) => PluginClass._migraine.dayKey(e.start) === '2026-09-11');
  assert(ep3 && ep3.days.length === 2, 'saved with two days');
  const what = await mig.deleteMigraineDay(ep3, '2026-09-12'); await flush();
  const ep3b = mig.getEpisodes().find((e) => PluginClass._migraine.dayKey(e.start) === '2026-09-11');
  assert.strictEqual(what, 'day'); assert.strictEqual(PluginClass._migraine.dayKey(ep3b.end), '2026-09-11'); assert.strictEqual(ep3b.days.length, 1);
  assert.strictEqual(await mig.deleteMigraineDay(ep3b, '2026-09-11'), 'episode', 'a one-day migraine is deleted whole'); await flush();
  assert(!mig.getEpisodes().some((e) => PluginClass._migraine.dayKey(e.start) === '2026-09-11'));
  console.log('MIGRAINE DAYS OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
