function seed(app) {
  const add = (p, fm) => app.vault.create(p, '---\n' + Object.entries(fm).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n');
  const starts = ['2026-05-20', '2026-06-17', '2026-07-15', '2026-08-12', '2026-09-09', '2026-10-07', '2026-11-05'];
  const ps = [];
  for (const s of starts) {
    const d0 = new Date(s + 'T00:00:00Z');
    ['medium', 'heavy', 'medium', 'light', 'light'].forEach((flow, i) => {
      const d = new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10);
      if (d > '2026-11-09') return;
      ps.push(add('Period Tracker/Logs/' + d + '.md', { type: 'period-log', date: d, flow, pain: i < 2 ? 3 : 1, symptoms: ['Cramps'], medications: i === 0 ? ['Ibuprofen'] : [] }));
    });
  }
  const migs = [['2026-06-16', '2026-06-17', 4], ['2026-07-16', '2026-07-16', 3], ['2026-08-12', '2026-08-13', 5], ['2026-08-25', '2026-08-25', 2], ['2026-09-10', '2026-09-11', 4], ['2026-10-20', '2026-10-20', 2], ['2026-11-08', '', 3]];
  for (const [s, e, p] of migs) ps.push(add('Migraine Log/Migraine ' + s + '.md', { entry: 'migraine', start: s, end: e, type: 'Migraine without aura', pain_max: p, pain_avg: p - 1, symptoms: ['Nausea'], triggers: ['Stress'], relief: [], medications: ['Sumatriptan | 50 mg | ' + s + ' |  | Some relief'], head_location: ['Left side'], notes: '' }));
  return Promise.all(ps);
}


module.exports={seed};