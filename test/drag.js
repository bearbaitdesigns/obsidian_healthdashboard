// Runs the real makeSortable code from the built plugin in Chromium and drags with mouse and touch
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const src = fs.readFileSync(path.resolve(process.argv[2] || 'dist/main.js'), 'utf8');
const helper = src.slice(src.indexOf('/* sortable:start */'), src.indexOf('/* sortable:end */'));
const css = fs.readFileSync(path.resolve('dist/styles.css'), 'utf8');
const page = `<!doctype html><meta charset=utf-8><style>${css}
body{font-family:sans-serif;margin:20px} .hd-tabs{display:flex;gap:4px;flex-wrap:wrap;width:520px} .hd-tab{padding:8px 14px}
.hd-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:600px;margin-top:30px} .hd-sortable{height:80px;border:1px solid #999;padding:8px}</style>
<div class="hd-tabs" id="tabs"><button class="hd-tab" data-key="overview">Overview</button>
${['period', 'migraine', 'visits', 'bp', 'illness', 'meds', 'a1c'].map((k) => `<button class="hd-tab hd-tab-sortable" data-key="${k}"><span>${k}</span></button>`).join('')}</div>
<div class="hd-summary" id="cards">${['period', 'migraine', 'visits', 'bp'].map((k) => `<div class="hd-card hd-sum hd-sortable" data-key="${k}"><b>${k}</b> <button class="hd-link">Open</button></div>`).join('')}</div>
<script>${helper}
window.log = { sorts: [], clicks: [] };
document.querySelectorAll('.hd-tab').forEach((b) => b.addEventListener('click', () => log.clicks.push(b.dataset.key)));
document.querySelectorAll('.hd-link').forEach((b) => b.addEventListener('click', () => log.clicks.push('open:' + b.parentElement.dataset.key)));
makeSortable(document.getElementById('tabs'), { itemClass: 'hd-tab-sortable', horizontal: true, onSort: (k) => log.sorts.push('tabs:' + k.join(',')) });
makeSortable(document.getElementById('cards'), { itemClass: 'hd-sortable', onSort: (k) => log.sorts.push('cards:' + k.join(',')) });
window.order = (id) => [...document.getElementById(id).children].map((c) => c.dataset.key).join(',');
</script>`;
const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  await p.setContent(page);
  const box = async (sel) => p.locator(sel).boundingBox();
  const center = (r) => [r.x + r.width / 2, r.y + r.height / 2];
  const log = () => p.evaluate(() => JSON.parse(JSON.stringify(window.log)));
  const drag = async (fromSel, toXY) => {
    const [fx, fy] = center(await box(fromSel));
    await p.mouse.move(fx, fy); await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(fx + ((toXY[0] - fx) * i) / 12, fy + ((toXY[1] - fy) * i) / 12);
    await p.mouse.up();
  };
  // 1. plain click opens the tab, no reorder
  await p.click('#tabs [data-key=bp]');
  let L = await log();
  assert.deepStrictEqual(L.clicks, ['bp']); assert.deepStrictEqual(L.sorts, []);
  // 2. drag "a1c" onto the left half of "period" -> becomes first sortable tab, Overview stays first, no click
  const per = await box('#tabs [data-key=period]');
  await drag('#tabs [data-key=a1c]', [per.x + 5, per.y + per.height / 2]);
  L = await log();
  console.log('tabs after drag:', await p.evaluate(() => order('tabs')));
  assert.strictEqual(await p.evaluate(() => order('tabs')), 'overview,a1c,period,migraine,visits,bp,illness,meds');
  assert.deepStrictEqual(L.sorts, ['tabs:a1c,period,migraine,visits,bp,illness,meds']);
  assert.deepStrictEqual(L.clicks, ['bp'], 'drop did not click');
  // 3. tiny wobble is still a click
  const [mx, my] = center(await box('#tabs [data-key=meds]'));
  await p.mouse.move(mx, my); await p.mouse.down(); await p.mouse.move(mx + 3, my + 1); await p.mouse.up();
  L = await log();
  assert.deepStrictEqual(L.clicks, ['bp', 'meds']); assert.strictEqual(L.sorts.length, 1);
  // 4. drag a card in a 2-column grid: period (top-left) to bottom-right
  const bpCard = await box('#cards [data-key=bp]');
  await drag('#cards [data-key=period] b', [bpCard.x + bpCard.width - 10, bpCard.y + bpCard.height / 2]);
  console.log('cards after drag:', await p.evaluate(() => order('cards')));
  assert.strictEqual(await p.evaluate(() => order('cards')), 'migraine,visits,bp,period');
  // 5. dragging from the "Open" button inside a card does not move the card (and still clicks)
  const vis = await box('#cards [data-key=visits]');
  await drag('#cards [data-key=migraine] .hd-link', [vis.x + 20, vis.y + 20]);
  assert.strictEqual(await p.evaluate(() => order('cards')), 'migraine,visits,bp,period');
  // 6. card moved upward across rows: period (bottom-right) to top-left
  const mig = await box('#cards [data-key=migraine]');
  await drag('#cards [data-key=period] b', [mig.x + 10, mig.y + 10]);
  assert.strictEqual(await p.evaluate(() => order('cards')), 'period,migraine,visits,bp');
  // 7. touch: press and hold, then move -> reorders
  const touchDrag = (sel, tx, ty, holdMs) => p.evaluate(async ([sel, tx, ty, holdMs]) => {
    const el = document.querySelector(sel), r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const ev = (type, x, y, t) => (t || el).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: type === 'pointerdown' ? 0 : -1, clientX: x, clientY: y }));
    ev('pointerdown', x0, y0);
    await new Promise((res) => setTimeout(res, holdMs));
    for (let i = 1; i <= 8; i++) ev('pointermove', x0 + ((tx - x0) * i) / 8, y0 + ((ty - y0) * i) / 8, document);
    ev('pointerup', tx, ty, document);
  }, [sel, tx, ty, holdMs]);
  const v2 = await box('#cards [data-key=visits]');
  await touchDrag('#cards [data-key=bp] b', v2.x + 10, v2.y + v2.height / 2, 420);
  console.log('cards after touch hold-drag:', await p.evaluate(() => order('cards')));
  assert.strictEqual(await p.evaluate(() => order('cards')), 'period,migraine,bp,visits');
  // 8. touch: quick swipe (a scroll) does not reorder
  const before = await p.evaluate(() => order('cards'));
  const m2 = await box('#cards [data-key=period]');
  await touchDrag('#cards [data-key=visits] b', m2.x + 10, m2.y + 10, 30);
  assert.strictEqual(await p.evaluate(() => order('cards')), before, 'swipe is a scroll, not a drag');
  L = await log();
  console.log('onSort calls:', L.sorts.length, '| clicks:', L.clicks.join(','));
  assert.strictEqual(L.sorts.length, 4);
  await p.screenshot({ path: 'test/drag-final.png' });
  await b.close();
  console.log('DRAG OK');
})().catch((e) => { console.error(e); process.exit(1); });
