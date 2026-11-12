// Real-browser test of the free-form Overview: move, push-down, resize, tidy, reset, narrow stacking, persistence
const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium } = require('playwright');
const src = fs.readFileSync('dist/main.js', 'utf8');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const helpers = cut('/* sortable:start */', '/* sortable:end */') + cut('/* freeboard:start */', '/* freeboard:end */');
let html = fs.readFileSync('test/out-board-light.html', 'utf8');
html = html.replace('</body>', `<script>${helpers};
window.saves = []; window.store = JSON.parse(localStorage.getItem('fb') || '{}');
const board = document.querySelector('.hd-board');
window.fb = freeBoard(board, { itemClass: 'hd-sortable', load: () => window.store,
  save: (l, order) => { window.store = l; localStorage.setItem('fb', JSON.stringify(l)); window.saves.push(order ? order.join(',') : 'reset'); } });
makeSortable(board, { itemClass: 'hd-sortable', enabled: () => board.classList.contains('is-stacked'), onSort: (k) => window.saves.push('sorted:' + k.join(',')) });
</script></body>`);
fs.writeFileSync('test/out-board-free.html', html);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1100, height: 1500 } });
  const p = await ctx.newPage();
  const url = 'http://localhost/';
  await p.route(url, (r) => r.fulfill({ contentType: 'text/html', body: html })); // real origin so localStorage works
  await p.goto(url);
  await p.waitForTimeout(150);
  const rects = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.hd-board > .hd-sortable')].map((c) => {
    const r = c.getBoundingClientRect(), br = c.parentElement.getBoundingClientRect();
    return [c.dataset.key, { x: Math.round(r.left - br.left), y: Math.round(r.top - br.top), w: Math.round(r.width), h: Math.round(r.height) }];
  })));
  const noOverlap = (rs) => {
    const ks = Object.keys(rs);
    for (const a of ks) for (const c of ks) if (a < c) {
      const A = rs[a], C = rs[c];
      const hit = A.x < C.x + C.w && C.x < A.x + A.w && A.y < C.y + C.h && C.y < A.y + A.h;
      assert(!hit, 'overlap ' + a + ' / ' + c + ' ' + JSON.stringify([A, C]));
    }
  };
  let r = await rects();
  console.log('default:', JSON.stringify(r));
  noOverlap(r);
  assert(Object.values(r).every((q) => q.x >= 0 && q.x + q.w <= 1100), 'inside the board');
  await p.screenshot({ path: 'test/free-1-default.png', clip: { x: 0, y: 0, width: 1100, height: 1300 } });

  // 1. move the BP card by its title to an arbitrary pixel spot (not a column)
  const key = Object.keys(r).includes('bp') ? 'bp' : Object.keys(r)[0];
  const h3 = await p.locator(`.hd-board > [data-key=${key}] h3`).boundingBox();
  const board = await p.locator('.hd-board').boundingBox();
  const from = { x: h3.x + 10, y: h3.y + h3.height / 2 };
  const grab = { x: from.x - (board.x + r[key].x), y: from.y - (board.y + r[key].y) };
  const dest = { x: 173, y: 37 }; // where the card's top-left should go
  await p.mouse.move(from.x, from.y); await p.mouse.down();
  for (let i = 1; i <= 20; i++) await p.mouse.move(from.x + (board.x + dest.x + grab.x - from.x) * i / 20, from.y + (board.y + dest.y + grab.y - from.y) * i / 20);
  assert(await p.locator('.hd-ghost').count() === 1, 'ghost shows the drop spot');
  await p.screenshot({ path: 'test/free-2-dragging.png', clip: { x: 0, y: 0, width: 1100, height: 1300 } });
  await p.mouse.up();
  await p.waitForTimeout(200);
  r = await rects();
  console.log('moved', key, '->', JSON.stringify(r[key]));
  assert.strictEqual(r[key].x % 8, 0); assert.strictEqual(r[key].y % 8, 0);
  assert(Math.abs(r[key].x - 176) <= 8 && Math.abs(r[key].y - 40) <= 8, 'landed at the pixel spot, not a column');
  noOverlap(r);
  assert(await p.locator('.hd-ghost').count() === 0, 'ghost removed');
  let saves = await p.evaluate(() => window.saves);
  assert.strictEqual(saves.length, 1);
  assert(saves[0].split(',')[0] === key || saves[0].split(',')[1] === key, 'reading order starts with the moved card: ' + saves[0]);

  // 2. resize the moved card from its corner
  const before = r[key];
  const hd = await p.locator(`.hd-board > [data-key=${key}] > .hd-resize`).boundingBox();
  await p.mouse.move(hd.x + 8, hd.y + 8); await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(hd.x + 8 + 150 * i / 10, hd.y + 8 + 120 * i / 10);
  await p.mouse.up();
  await p.waitForTimeout(200);
  r = await rects();
  console.log('resized', key, JSON.stringify(before), '->', JSON.stringify(r[key]));
  assert(Math.abs(r[key].w - (before.w + 150)) <= 8, 'wider by ~150px');
  assert(r[key].h >= before.h + 110, 'taller by ~120px');
  assert.strictEqual(r[key].x, before.x); assert.strictEqual(r[key].y, before.y);
  noOverlap(r);
  await p.screenshot({ path: 'test/free-3-resized.png', clip: { x: 0, y: 0, width: 1100, height: 1500 } });

  // 3. clicking a control still works (no drag)
  const clicked = await p.evaluate(() => { let n = 0; const btn = document.querySelector('.hd-board .hd-link'); btn.addEventListener('click', () => n++); btn.click(); return n; });
  assert.strictEqual(clicked, 1);

  // 4. layout survives a reload (pixel positions saved)
  const saved = r;
  await p.reload(); await p.waitForTimeout(200);
  r = await rects();
  assert.deepStrictEqual(r[key], saved[key], 'same spot after reload');
  noOverlap(r);

  // 5. narrow pane stacks in reading order, no absolute positions
  await p.setViewportSize({ width: 520, height: 1500 }); await p.waitForTimeout(250);
  const stacked = await p.evaluate(() => document.querySelector('.hd-board').classList.contains('is-stacked'));
  assert(stacked, 'stacked on a narrow pane');
  r = await rects();
  assert(Object.values(r).every((q) => q.x === 0), 'one column');
  await p.screenshot({ path: 'test/free-4-narrow.png', fullPage: false });
  await p.setViewportSize({ width: 1100, height: 1500 }); await p.waitForTimeout(250);
  r = await rects();
  assert.deepStrictEqual(r[key], saved[key], 'back to the saved spot when wide again');

  // 6. tidy up packs from the top with no gaps at the top-left
  await p.evaluate(() => window.fb.tidy()); await p.waitForTimeout(100);
  r = await rects(); noOverlap(r);
  assert(Object.values(r).some((q) => q.x === 0 && q.y === 0), 'something at the top-left');
  assert(Math.abs(r[key].w - saved[key].w) <= 1, 'tidy keeps sizes');
  console.log('tidy:', JSON.stringify(r));
  await p.screenshot({ path: 'test/free-5-tidy.png', clip: { x: 0, y: 0, width: 1100, height: 1500 } });

  // 7. reset goes back to the default columns
  await p.evaluate(() => window.fb.reset()); await p.waitForTimeout(100);
  r = await rects(); noOverlap(r);
  saves = await p.evaluate(() => window.saves);
  assert.strictEqual(saves[saves.length - 1], 'reset');
  assert(Math.abs(r[key].w - before.w) <= 1, 'default width again');
  await b.close();
  console.log('FREE BOARD OK');
})().catch((e) => { console.error(e); process.exit(1); });
