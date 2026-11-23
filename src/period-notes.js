
  /* ---------- One note per period (inserted into the Period tracker plugin class by build.js) ---------- */
  isBleedingFlow(flow) { return FLOW_SCORE[flow] >= 2 || (this.settings.countSpotting && flow === 'spotting'); }
  dayObj(st) {
    const o = { date: fromDayNum(st.day), flow: st.flow };
    if (st.pain != null) o.pain = st.pain;
    o.symptoms = st.symptoms || [];
    o.medications = st.medications || [];
    if (st.notes && String(st.notes).trim()) o.notes = String(st.notes).trim();
    return o;
  }
  periodSpan(days) {
    const bleed = days.filter((d) => this.isBleedingFlow(String((d && d.flow) || 'none'))).map((d) => String(d.date)).sort();
    const all = days.map((d) => String(d.date)).sort();
    return { start: bleed[0] || all[0] || '', end: bleed[bleed.length - 1] || all[all.length - 1] || '' };
  }
  /** Period notes as { file, days: [dayNum], bleed: [dayNum] }, oldest first */
  periodNotes() {
    const out = new Map();
    for (const e of this.getEntries()) {
      if (e.kind !== 'period') continue;
      if (!out.has(e.file.path)) out.set(e.file.path, { file: e.file, days: [], bleed: [] });
      const n = out.get(e.file.path);
      n.days.push(e.day);
      if (this.isBleedingFlow(e.flow)) n.bleed.push(e.day);
    }
    return [...out.values()].sort((a, b) => Math.min(...a.days) - Math.min(...b.days));
  }
  /**
   * Which period note a day belongs to. A bleeding day joins the period it continues (gap of 2 days or less,
   * before or after); otherwise it starts a new period. A day without bleeding joins the cycle it falls in.
   */
  periodNoteFor(day, bleeding, notes) {
    const first = (n) => (n.days.length ? Math.min(...n.days) : Infinity);
    const near = (n) => n.bleed.some((b) => Math.abs(b - day) <= 2);
    if (bleeding) {
      const hit = notes.find(near);
      if (hit) return { note: hit };
    }
    const prev = notes.filter((n) => first(n) <= day).pop();
    if (!prev) return { note: null };
    if (!bleeding || !prev.bleed.length) return { note: prev };
    return prev.bleed.some((b) => b > day) ? { note: null } : { note: null, splitFrom: prev };
  }
  async createPeriodNote(days) {
    const folder = normalizePath(this.settings.logFolder);
    await this.ensureFolder(folder);
    days = days.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const span = this.periodSpan(days);
    const base = 'Period ' + (span.start || days[0].date);
    let path = normalizePath(folder + '/' + base + '.md');
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(folder + '/' + base + ' (' + i + ').md');
    const file = await this.app.vault.create(path, '');
    await this.app.fileManager.processFrontMatter(file, (fm) => { fm.type = 'period'; Object.assign(fm, span); fm.days = days; fm.tags = ['period']; });
    await this.writeDayTable(file, days);
    return file;
  }
  /** A readable table of the days below the properties (the properties hold the data) */
  async writeDayTable(file, days) {
    const cell = (v) => String(v == null ? '' : v).replace(/\|/g, '/').replace(/\n/g, ' ');
    const rows = days.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map((d) => '| ' + [fmtDate(toDayNum(d.date)), FLOW_LABEL[d.flow] || d.flow || '', d.pain == null ? '' : d.pain + '/' + PAIN_MAX, toList(d.symptoms).join(', '), toList(d.medications).join(', '), cell(d.notes)].join(' | ') + ' |');
    const table = '<!-- period-days:start -->\n| Day | Flow | Pain | Symptoms | Medications | Notes |\n| --- | --- | --- | --- | --- | --- |\n' + rows.join('\n') + '\n<!-- period-days:end -->';
    const span = this.periodSpan(days);
    const RE = /<!-- period-days:start -->[\s\S]*?<!-- period-days:end -->/;
    const edit = (text) => {
      const m = /^---\n[\s\S]*?\n---\n?/.exec(text);
      const head = m ? m[0] : '', body = m ? text.slice(head.length) : text;
      const nb = RE.test(body) ? body.replace(RE, table)
        : '\n# Period · ' + fmtDate(toDayNum(span.start || days[0].date)) + '\n\n' + table + '\n\nAnything else about this period can go below the table.\n' + body;
      return head + nb;
    };
    if (this.app.vault.process) await this.app.vault.process(file, edit);
    else await this.app.vault.modify(file, edit(await this.app.vault.read(file)));
  }
  async trashNote(file) {
    if (this.app.fileManager.trashFile) await this.app.fileManager.trashFile(file);
    else await this.app.vault.trash(file, true);
  }
  async savePeriodDay(st, existing) {
    const obj = this.dayObj(st);
    let file = existing && existing.kind === 'period' ? existing.file : null;
    if (!file) {
      const pick = this.periodNoteFor(st.day, this.isBleedingFlow(st.flow), this.periodNotes());
      if (pick.note) file = pick.note.file;
      else {
        // A new period inside an earlier note's cycle: the later days of that note move to the new one
        let moved = [];
        if (pick.splitFrom) {
          const later = this.getEntries().filter((e) => e.file === pick.splitFrom.file && e.day > st.day);
          if (later.length) {
            moved = later.map((e) => this.dayObj(e));
            let left = [];
            await this.app.fileManager.processFrontMatter(pick.splitFrom.file, (fm) => {
              fm.days = (fm.days || []).filter((d) => toDayNum(d && d.date) < st.day);
              left = fm.days.slice();
              Object.assign(fm, this.periodSpan(fm.days));
            });
            await this.writeDayTable(pick.splitFrom.file, left);
          }
        }
        await this.createPeriodNote([obj].concat(moved));
        this.requestRefresh();
        return;
      }
    }
    let days = [];
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.type = 'period';
      fm.days = (Array.isArray(fm.days) ? fm.days : []).filter((d) => toDayNum(d && d.date) !== st.day).concat([obj]).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      Object.assign(fm, this.periodSpan(fm.days));
      days = fm.days.slice();
    });
    await this.writeDayTable(file, days);
    this.requestRefresh();
  }
  /** Move every one-note-per-day log into period notes; the day notes go to the trash */
  async convertDayNotes() {
    const old = this.getEntries().filter((e) => e.kind === 'day').sort((a, b) => a.day - b.day);
    if (!old.length) return 0;
    const notes = this.periodNotes().map((n) => Object.assign({ add: [] }, n));
    for (const e of old) {
      const bleeding = this.isBleedingFlow(e.flow);
      const pick = this.periodNoteFor(e.day, bleeding, notes);
      let n = pick.note;
      if (!n) {
        n = { file: null, days: [], bleed: [], add: [] };
        notes.push(n);
      }
      n.days.push(e.day);
      if (bleeding) n.bleed.push(e.day);
      n.add.push(this.dayObj(e));
      notes.sort((a, b) => Math.min(...a.days) - Math.min(...b.days));
    }
    for (const n of notes) {
      if (!n.add.length) continue;
      if (n.file) {
        let days = [];
        await this.app.fileManager.processFrontMatter(n.file, (fm) => {
          const have = new Set((fm.days || []).map((d) => String(d.date)));
          fm.days = (fm.days || []).concat(n.add.filter((d) => !have.has(d.date))).sort((a, b) => String(a.date).localeCompare(String(b.date)));
          Object.assign(fm, this.periodSpan(fm.days));
          days = fm.days.slice();
        });
        await this.writeDayTable(n.file, days);
      } else await this.createPeriodNote(n.add);
    }
    for (const e of old) await this.trashNote(e.file);
    this.requestRefresh();
    return old.length;
  }
  confirmConvert(after) {
    const n = this.getEntries().filter((e) => e.kind === 'day').length;
    if (!n) { new Notice('All your days are already in period notes.'); return; }
    const m = new Modal(this.app);
    m.titleEl.setText('Combine day notes into period notes?');
    m.contentEl.createEl('p', { text: n + ' day notes will be combined into one note per period in "' + this.settings.logFolder + '". Every day keeps its flow, pain, symptoms, medications and notes. The old day notes are moved to the trash, so you can get them back.' });
    const row = m.contentEl.createDiv({ cls: 'mt-footer' });
    row.createDiv({ cls: 'mt-spacer' });
    row.createEl('button', { text: 'Cancel' }).onclick = () => m.close();
    row.createEl('button', { text: 'Combine', cls: 'mod-cta' }).onclick = async () => {
      m.close();
      try { const k = await this.convertDayNotes(); new Notice('Combined ' + k + ' day notes into period notes.'); } catch (e) { console.error(e); new Notice('Could not combine the notes: ' + e.message); }
      if (after) after();
    };
    m.open();
  }
