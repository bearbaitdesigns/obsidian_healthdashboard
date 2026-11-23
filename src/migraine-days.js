/* ---- Day by day inside one migraine episode (added by Health Dashboard) ----
   An episode can list days: [{ date, pain, symptoms }]. A day that isn't listed keeps the values of the last
   listed day before it; before any, the episode's own pain and symptoms apply. Episodes without days work as before. */
function parseEpDays(v) {
  if (!Array.isArray(v)) return [];
  return v.map((d) => (d && typeof d === 'object' ? { date: String(d.date || '').slice(0, 10), pain: asPain(d.pain), symptoms: asArray(d.symptoms) } : null))
    .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}
/** Pain and symptoms on one calendar day of an episode */
function epDay(ep, key) {
  let cur = null;
  for (const d of ep.days || []) if (d.date <= key) cur = d;
  if (!cur) return { pain: ep.painMax, symptoms: ep.symptoms, logged: false, from: null };
  return { pain: cur.pain != null ? cur.pain : ep.painMax, symptoms: cur.symptoms, logged: cur.date === key, from: cur.date };
}
const epDayPain = (ep, key) => { const v = (ep.days && ep.days.length) ? epDay(ep, key).pain : ep.painMax; return v == null ? ep.painMax || 0 : v; };
/*@@MODAL@@*/
/** The "Day by day" section of the episode window */
EpisodeModal.prototype.renderDays = function () {
  const sec = this.daysSec;
  if (!sec || !this.startInput) return;
  if (!this.dayState) this.dayState = new Map((this.ep.days || []).map((d) => [d.date, { pain: d.pain, symptoms: d.symptoms.slice() }]));
  if (this.daysBox) this.daysBox.remove();
  const box = sec.createDiv({ cls: 'mt-days' });
  this.daysBox = box;
  const st = parseDT(this.startInput.value);
  if (!st) return;
  const en = parseDT(this.endInput.value) || new Date();
  const n = Math.max(1, Math.min(31, spanDays(st, en < st ? st : en)));
  if (n < 2 && !this.dayState.size) {
    box.createDiv({ cls: 'mt-help', text: 'When a migraine lasts more than a day, you can set the pain and symptoms for each day here. A day you don’t change keeps the day before’s values.' });
    return;
  }
  box.createDiv({ cls: 'mt-help', text: 'A day you don’t change keeps the pain and symptoms of the day before, until you change them or the migraine ends. Day 1 uses the pain and symptoms above unless you change it.' });
  const s = this.plugin.settings;
  let prev = null;
  for (let i = 0; i < n; i++) {
    const key = dayKey(addDays(startOfDay(st), i));
    const logged = this.dayState.get(key);
    const base = i === 0 ? { pain: this.maxPain ? this.maxPain.get() : this.ep.painMax, symptoms: this.symChips ? this.symChips.values() : this.ep.symptoms } : prev;
    const cur = logged ? { pain: logged.pain != null ? logged.pain : base.pain, symptoms: logged.symptoms } : base;
    const row = box.createDiv({ cls: 'mt-day' + (logged ? ' is-logged' : '') });
    const head = row.createDiv({ cls: 'mt-day-head' });
    head.createSpan({ cls: 'mt-day-title', text: 'Day ' + (i + 1) + ' · ' + fmtDate(parseDT(key)) });
    const pill = head.createSpan({ cls: 'mt-pain-pill', text: (cur.pain == null ? '–' : cur.pain) + '/' + PAIN_MAX });
    if (cur.pain) pill.style.background = painColor(cur.pain, 0.75);
    head.createSpan({ cls: 'mt-day-sum', text: (cur.symptoms.join(', ') || 'No symptoms') + (logged ? '' : i === 0 ? ' · from above' : ' · same as day ' + i) });
    const btn = head.createEl('button', { cls: 'mt-small-btn', text: logged ? (i === 0 ? 'Use the values above' : 'Same as day ' + i) : 'Change this day', attr: { type: 'button' } });
    btn.onclick = () => {
      if (logged) this.dayState.delete(key);
      else this.dayState.set(key, { pain: cur.pain, symptoms: cur.symptoms.slice() });
      this.renderDays();
    };
    if (logged) {
      const ed = row.createDiv({ cls: 'mt-day-edit' });
      this.painSelector(ed, 'Pain', cur.pain == null ? 0 : cur.pain, (v) => { logged.pain = v; this.renderDays(); });
      ed.createDiv({ cls: 'mt-label', text: 'Symptoms' });
      new ChipSelect(ed, { options: s.symptoms, selected: logged.symptoms, onChange: (v) => { logged.symptoms = v.slice(); this.renderDays(); } });
    }
    prev = cur;
  }
};
/** Days the person changed, inside the episode's dates */
EpisodeModal.prototype.collectDays = function (start, end) {
  if (!this.dayState) return this.ep.days || [];
  const lo = dayKey(start), hi = dayKey(end || new Date());
  return [...this.dayState.entries()].filter(([k]) => k >= lo && k <= hi).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, pain: v.pain == null ? 0 : v.pain, symptoms: v.symptoms }));
};
