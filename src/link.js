/* ================================================================== */
/* Dashboard links in notes                                            */
/*   Block:   ```health-link\nlabel: My health\ntab: bp\n```            */
/*   Inline:  `health-link: label=blood pressure; tab=bp`              */
/*   URL:     [Health](obsidian://health-dashboard?tab=bp)             */
/* ================================================================== */
const LINK_DEFAULTS = { label: 'Health dashboard', icon: 'heart-pulse', image: '', style: 'card', size: 'medium', reuseTab: true };
// Friendly names people may type for a tab
const LINK_TAB_ALIASES = {
  home: 'overview', dashboard: 'overview', all: 'overview',
  periods: 'period', cycle: 'period', menstrual: 'period', menstruation: 'period',
  migraines: 'migraine', headache: 'migraine', headaches: 'migraine',
  visit: 'visits', doctor: 'visits', doctors: 'visits', 'doctor-visits': 'visits', appointments: 'visits',
  'blood-pressure': 'bp', bloodpressure: 'bp', pressure: 'bp',
  sickness: 'illness', sick: 'illness', health: 'illness', 'general-health': 'illness',
  medications: 'meds', medication: 'meds', medicine: 'meds', medicines: 'meds', med: 'meds',
  hba1c: 'a1c', glucose: 'a1c', 'blood-sugar': 'a1c',
};
function linkTab(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '-');
  if (!s) return 'overview';
  if (TABS.some((t) => t.id === s)) return s;
  return LINK_TAB_ALIASES[s] || 'overview';
}

function parseLinkOptions(src) {
  const o = {};
  for (const line of String(src || '').split('\n')) {
    const m = line.match(/^\s*([a-zA-Z]+)\s*:\s*(.*?)\s*$/);
    if (m) o[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
}
const LINK_SIZES = { tiny: 0.7, xs: 0.7, small: 0.85, sm: 0.85, medium: 1, normal: 1, md: 1, large: 1.3, lg: 1.3, xl: 1.7, 'x-large': 1.7, xxl: 2.2, huge: 2.2 };
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** size: preset name, multiplier (1.5), percent (150%) or pixels (22px). Returns {scale} or {px}. */
function linkSize(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return { scale: 1 };
  if (LINK_SIZES[s]) return { scale: LINK_SIZES[s] };
  let m = s.match(/^(\d+(?:\.\d+)?)\s*px$/);
  if (m) return { px: clampN(Number(m[1]), 8, 96) + 'px' };
  m = s.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (m) return { scale: clampN(Number(m[1]) / 100, 0.5, 4) };
  m = s.match(/^(\d+(?:\.\d+)?)x?$/);
  if (m) return { scale: clampN(Number(m[1]), 0.5, 4) };
  return { scale: 1 };
}
const LINK_INLINE_ONE = /^health-link(?:\s*[:\s].*)?$/;
const LINK_INLINE_RE = /`(health-link(?:[:\s][^`\n]*)?)`/g;
/** Inline options: `health-link: label=My health; tab=bp; size=small` (separators ; or |, key=value or key: value). */
function parseLinkInline(src) {
  const o = {};
  const body = String(src).trim().replace(/^health-link\s*:?\s*/, '');
  for (const part of body.split(/[;|]/)) {
    const m = part.match(/^\s*([a-zA-Z]+)\s*[=:]\s*(.*?)\s*$/);
    if (m) o[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
    else if (part.trim() && !o.label) o.label = part.trim(); // bare text is the label
  }
  return o;
}
const LINK_SNIPPET = (tab) => '```health-link\nlabel: Health dashboard\n' + (tab && tab !== 'overview' ? 'tab: ' + tab + '\n' : '') + '```\n';
const LINK_INLINE_SNIPPET = () => '`health-link: label=Health dashboard`';
const LINK_IMAGE_EXT = /^(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i;

/**
 * Live Preview: show inline `health-link …` code as the clickable link (the raw text comes back when the cursor is on it).
 * Uses the CodeMirror modules Obsidian ships; if they aren't available, inline links still render in Reading view.
 */
function buildLivePreviewLinks(plugin) {
  let view, state, language;
  try { view = require('@codemirror/view'); state = require('@codemirror/state'); } catch (e) { return null; }
  try { language = require('@codemirror/language'); } catch (e) { language = null; }
  const { ViewPlugin, Decoration, WidgetType } = view || {};
  const { RangeSetBuilder } = state || {};
  if (!ViewPlugin || !Decoration || !WidgetType || !RangeSetBuilder) return null;
  class LinkWidget extends WidgetType {
    constructor(src) { super(); this.src = src; }
    eq(other) { return other.src === this.src; }
    toDOM() {
      const holder = document.createElement('span');
      holder.className = 'hd-link-inline-holder';
      plugin.mountLink(holder, parseLinkInline(this.src), true);
      return holder;
    }
    ignoreEvent() { return true; }
  }
  const isLivePreview = (v) => {
    try { return obsidian.editorLivePreviewField ? v.state.field(obsidian.editorLivePreviewField) : true; } catch (e) { return true; }
  };
  const inCodeBlock = (st, pos) => {
    if (!language || !language.syntaxTree) return false;
    try { const n = language.syntaxTree(st).resolveInner(pos, 1); return /codeblock|code-block|hmd-codeblock/i.test(n.name); } catch (e) { return false; }
  };
  const build = (v) => {
    const b = new RangeSetBuilder();
    if (!isLivePreview(v)) return b.finish();
    const ranges = v.state.selection.ranges;
    for (const { from, to } of v.visibleRanges) {
      const text = v.state.doc.sliceString(from, to);
      LINK_INLINE_RE.lastIndex = 0;
      let m;
      while ((m = LINK_INLINE_RE.exec(text))) {
        const start = from + m.index, end = start + m[0].length;
        if (ranges.some((r) => r.from <= end && r.to >= start)) continue; // editing it: show the source
        if (inCodeBlock(v.state, start)) continue;
        b.add(start, end, Decoration.replace({ widget: new LinkWidget(m[1]) }));
      }
    }
    return b.finish();
  };
  return ViewPlugin.fromClass(class {
    constructor(v) { this.decorations = build(v); }
    update(u) { this.decorations = build(u.view); }
  }, { decorations: (p) => p.decorations });
}

class LinkImagePickModal extends obsidian.FuzzySuggestModal {
  constructor(app, onPick) { super(app); this.onPick = onPick; this.setPlaceholder('Pick an image from your vault…'); }
  getItems() { return this.app.vault.getFiles().filter((f) => LINK_IMAGE_EXT.test(f.extension)); }
  getItemText(f) { return f.path; }
  onChooseItem(f) { this.onPick(f.path); }
}

const LinkMethods = {
  linkSettings() {
    const s = this.settings;
    // fill in missing keys in place, so settings code holding this object keeps writing to the saved one
    if (!s.link || typeof s.link !== 'object') s.link = {};
    for (const k of Object.keys(LINK_DEFAULTS)) if (s.link[k] == null) s.link[k] = LINK_DEFAULTS[k];
    return s.link;
  },

  registerLinks() {
    this.linkEmbeds = new Set();
    this.registerMarkdownCodeBlockProcessor('health-link', (src, el) => {
      this.mountLink(el.createDiv(), parseLinkOptions(src), false);
    });
    this.registerMarkdownPostProcessor((el) => {
      el.querySelectorAll('code').forEach((code) => {
        if (code.parentElement && code.parentElement.tagName === 'PRE') return;
        const txt = code.textContent.trim();
        if (!LINK_INLINE_ONE.test(txt)) return;
        const holder = document.createElement('span');
        holder.className = 'hd-link-inline-holder';
        code.replaceWith(holder);
        this.mountLink(holder, parseLinkInline(txt), true);
      });
    });
    // Live Preview support is optional: if it can't load, inline links still render in Reading view
    try { const ext = buildLivePreviewLinks(this); if (ext) this.registerEditorExtension(ext); }
    catch (e) { console.warn('Health Dashboard: inline links in Live Preview unavailable', e); }
    // Also works as a plain Markdown link: [Health](obsidian://health-dashboard?tab=bp)
    this.registerObsidianProtocolHandler('health-dashboard', (params) => this.activateView(linkTab(params.tab), { fromLink: true }));
    this.addCommand({ id: 'insert-link', name: 'Insert dashboard link in this note', editorCallback: (editor) => editor.replaceSelection(LINK_SNIPPET()) });
    this.addCommand({ id: 'insert-inline-link', name: 'Insert inline dashboard link (inside a sentence)', editorCallback: (editor) => editor.replaceSelection(LINK_INLINE_SNIPPET()) });
  },

  /** Turn a vault path, [[wikilink]] or URL into something an <img> can load */
  resolveImage(src) {
    if (!src) return null;
    src = String(src).trim();
    if (/^(https?:|data:|app:|capacitor:)/i.test(src)) return src;
    const clean = src.replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
    const file = this.app.vault.getAbstractFileByPath(normalizePath(clean))
      || (this.app.metadataCache.getFirstLinkpathDest && this.app.metadataCache.getFirstLinkpathDest(clean, ''));
    return file && file.extension ? this.app.vault.getResourcePath(file) : null;
  },

  /** Render a link into a holder element and keep it updated when link settings change */
  mountLink(holder, opts, inline) {
    if (!this.linkEmbeds) this.linkEmbeds = new Set();
    this.linkEmbeds.add({ el: holder, opts, inline });
    this.renderLink(holder, opts, inline);
  },
  refreshLinks() {
    for (const l of [...(this.linkEmbeds || [])]) {
      if (l.el.isConnected === false) { this.linkEmbeds.delete(l); continue; }
      this.renderLink(l.el, l.opts, l.inline);
    }
  },

  /**
   * Options (block: one per line; inline: key=value separated by ; or |), all optional:
   * label, tab, icon (Lucide name), image (vault path, [[wikilink]] or URL), style (card|button|icon),
   * size (tiny|small|medium|large|xl|xxl, 1.5, 150% or 22px), subtitle, and for blocks: align, float, width.
   */
  renderLink(el, o, inline) {
    o = o || {};
    const L = this.linkSettings();
    const label = o.label || o.title || L.label || 'Health dashboard';
    let tab = linkTab(o.tab);
    if (!this.tabVisible(tab)) tab = 'overview'; // that tracker is turned off
    const tabDef = TABS.find((t) => t.id === tab);
    const styles = ['card', 'button', 'icon'];
    // Inline links default to the compact button so they sit naturally in a line of text
    const style = styles.includes(o.style) ? o.style : inline ? 'button' : (styles.includes(L.style) ? L.style : 'card');
    const imgSrc = o.image != null ? o.image : (o.icon ? '' : L.image);
    const iconName = o.icon || (o.tab && tab !== 'overview' && !L.image && !o.image ? tabDef.icon : '') || L.icon || 'heart-pulse';
    const size = linkSize(o.size != null ? o.size : inline ? 'medium' : L.size);

    el.empty();
    if (!inline) { // block placement: alignment, floating with text wrap, or full width
      el.className = 'hd-link-block';
      const align = ['left', 'center', 'right'].includes(o.align) ? o.align : 'left';
      el.addClass('is-align-' + align);
      if (o.float === 'left' || o.float === 'right') el.addClass('is-float-' + o.float);
    }
    const a = el.createEl(inline ? 'span' : 'div', {
      cls: 'hd-link-embed is-' + style + (inline ? ' is-inline' : '') + (!inline && o.width === 'full' && style !== 'icon' ? ' is-full' : ''),
      attr: { role: 'link', tabindex: '0', 'aria-label': 'Open ' + label + ' (' + tabDef.label + ') in a new tab' },
    });
    if (size.px) a.style.fontSize = size.px; else a.style.setProperty('--hd-link-scale', String(size.scale));
    const media = a.createEl('span', { cls: 'hd-link-media' });
    const drawIcon = () => { media.empty(); media.addClass('is-icon'); setIcon(media, iconName); if (!media.querySelector('svg')) setIcon(media, 'heart-pulse'); };
    const url = this.resolveImage(imgSrc);
    if (url) {
      media.removeClass('is-icon');
      const img = media.createEl('img', { attr: { src: url, alt: '' } });
      img.addEventListener('error', drawIcon); // broken picture: fall back to the icon
    } else drawIcon();
    if (style !== 'icon') {
      const tx = a.createEl('span', { cls: 'hd-link-text' });
      tx.createEl('span', { cls: 'hd-link-title', text: label });
      if (style === 'card') tx.createEl('span', { cls: 'hd-link-sub', text: o.subtitle || (tab === 'overview' ? 'Open dashboard' : 'Open ' + tabDef.label) });
      setIcon(a.createSpan({ cls: 'hd-link-arrow' }), 'external-link');
    } else a.setAttr('title', label);
    const go = (e) => { e.preventDefault(); e.stopPropagation(); this.activateView(tab, { fromLink: true }); };
    a.addEventListener('click', go);
    // Keep the editor from moving the cursor into the link's source when it's clicked
    a.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
  },
};
Object.assign(HealthDashboardPlugin.prototype, LinkMethods);

/** Settings → Health Dashboard → Dashboard link */
HubSettingTab.prototype.displayLinkSettings = function (containerEl) {
  const p = this.host;
  const L = p.linkSettings();
  const save = async () => { await p.saveHub(); p.refreshLinks(); drawPreview(); };
  new Setting(containerEl).setName('Dashboard link').setHeading();
  containerEl.createEl('p', { cls: 'setting-item-description', text: 'Add a clickable link to any note that opens the dashboard in a new tab. Run “Insert dashboard link in this note” from the command palette, or paste the code below.' });
  const preview = containerEl.createDiv({ cls: 'hd-link-preview' });
  const block = preview.createDiv();
  const sentence = preview.createEl('p', { cls: 'hd-link-preview-inline' });
  sentence.appendText('Inline: check my ');
  const inl = sentence.createSpan({ cls: 'hd-link-inline-holder' });
  sentence.appendText(' before the appointment.');
  const drawPreview = () => { p.renderLink(block, {}, false); p.renderLink(inl, { label: 'blood pressure', tab: 'bp' }, true); };
  drawPreview();

  new Setting(containerEl).setName('Link text').setDesc('Default label. A link can override it with “label: …”.')
    .addText((t) => t.setValue(L.label).onChange(async (v) => { L.label = v.trim() || 'Health dashboard'; await save(); }));
  new Setting(containerEl).setName('Size').setDesc('Default size for block links. Any link can use “size: …” (tiny, small, large, xl, xxl, 1.5, 150%, 22px). Inline links follow the size of the surrounding text.')
    .addDropdown((d) => {
      for (const [v, l] of [['tiny', 'Tiny'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['xl', 'Extra large'], ['xxl', 'Huge']]) d.addOption(v, l);
      d.setValue(L.size || 'medium').onChange(async (v) => { L.size = v; await save(); });
    });
  new Setting(containerEl).setName('Style')
    .addDropdown((d) => d.addOption('card', 'Card (picture, title, subtitle)').addOption('button', 'Compact button').addOption('icon', 'Picture only')
      .setValue(L.style || 'card').onChange(async (v) => { L.style = v; await save(); }));
  const iconSetting = new Setting(containerEl).setName('Icon').setDesc('Any Lucide icon name (lucide.dev), e.g. heart-pulse, stethoscope, activity, pill. Used when no picture is set. A link to one tracker’s tab shows that tracker’s icon unless you set a picture.');
  const iconPrev = iconSetting.controlEl.createSpan({ cls: 'hd-icon-preview' });
  const drawIconPrev = () => { iconPrev.empty(); setIcon(iconPrev, L.icon || 'heart-pulse'); };
  iconSetting.addText((t) => t.setPlaceholder('heart-pulse').setValue(L.icon).onChange(async (v) => { L.icon = v.trim() || 'heart-pulse'; drawIconPrev(); await save(); }));
  drawIconPrev();

  const pic = new Setting(containerEl).setName('Picture').setDesc(L.image ? 'Using: ' + L.image : 'Replace the icon with your own picture: choose one from your vault, upload one, or paste a vault path or image URL.');
  pic.addText((t) => t.setPlaceholder('e.g. Attachments/health.png or https://…').setValue(L.image).onChange(async (v) => { L.image = v.trim(); await save(); }));
  pic.addButton((b) => b.setButtonText('Choose…').setTooltip('Pick an image already in your vault').onClick(() => new LinkImagePickModal(this.app, async (path) => { L.image = path; await save(); this.display(); }).open()));
  pic.addButton((b) => b.setButtonText('Upload…').setTooltip('Upload a picture from your computer into your vault').onClick(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const folder = normalizePath(p.settings.notesFolder || 'Health Notes');
        if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
        const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const path = folder + '/link-picture.' + ext;
        const buf = await file.arrayBuffer();
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing) await this.app.vault.modifyBinary(existing, buf); else await this.app.vault.createBinary(path, buf);
        L.image = path; await save(); this.display();
        new Notice('Saved picture to ' + path);
      } catch (e) { new Notice('Couldn’t save the picture: ' + (e.message || e)); }
    });
    input.click();
  }));
  if (L.image) pic.addExtraButton((b) => b.setIcon('x').setTooltip('Remove picture (use the icon)').onClick(async () => { L.image = ''; await save(); this.display(); }));

  new Setting(containerEl).setName('Always open a new tab').setDesc('Off: if the dashboard is already open, the link switches to it. On: every click opens another tab.')
    .addToggle((t) => t.setValue(L.reuseTab === false).onChange(async (v) => { L.reuseTab = !v; await p.saveHub(); }));
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); new Notice(what + ' copied — paste it into a note.'); }
    catch (e) { new Notice('Couldn’t copy. Use the “Insert dashboard link” commands instead.'); }
  };
  new Setting(containerEl).setName('Link code').setDesc('Block link: its own line, can be sized, aligned (align: center) or floated beside text (float: right). Inline link: goes anywhere inside a sentence, list item, callout or table.')
    .addButton((b) => b.setButtonText('Copy block link').onClick(() => copy(LINK_SNIPPET(), 'Block link')))
    .addButton((b) => b.setButtonText('Copy inline link').onClick(() => copy(LINK_INLINE_SNIPPET(), 'Inline link')));
};

module.exports._link = { parseLinkOptions, parseLinkInline, linkSize, linkTab, LINK_SNIPPET, LINK_INLINE_SNIPPET, LINK_INLINE_RE };
