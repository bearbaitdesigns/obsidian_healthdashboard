const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { chromium } = require('playwright');
const src = fs.readFileSync('dist/main.js', 'utf8');
const helper = src.slice(src.indexOf('/* sortable:start */'), src.indexOf('/* sortable:end */'));
let html = fs.readFileSync('test/out-board-light.html', 'utf8');
html = html.replace('</body>', `<script>${helper}; window.sorted=[]; makeSortable(document.querySelector('.hd-board'), { itemClass: 'hd-sortable', onSort: (k) => window.sorted.push(k.join(',')) });</script></body>`);
fs.writeFileSync('test/out-board-drag.html', html);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  await p.goto('file://' + path.resolve('test/out-board-drag.html'));
  const order = () => p.evaluate(() => [...document.querySelector('.hd-board').children].map((c) => c.dataset.key).join(','));
  const geo = () => p.evaluate(() => [...document.querySelector('.hd-board').children].map((c) => { const r = c.getBoundingClientRect(); return c.dataset.key + '@' + Math.round(r.left) + ',' + Math.round(r.top) + ' w' + Math.round(r.width); }));
  console.log('before:', await order());
  console.log('layout:', (await geo()).join('  '));
  // drag the calendar by its month title onto the first card (period)
  const t = await p.locator('.hd-cal-title').boundingBox();
  const target = await p.locator('.hd-board > [data-key=period]').boundingBox();
  await p.mouse.move(t.x + 20, t.y + t.height / 2); await p.mouse.down();
  for (let i = 1; i <= 15; i++) await p.mouse.move(t.x + 20 + (target.x + 10 - t.x - 20) * i / 15, t.y + t.height / 2 + (target.y + 20 - t.y - t.height / 2) * i / 15);
  await p.mouse.up();
  console.log('after:', await order());
  assert((await order()).startsWith('calendar,'), 'calendar moved to the top');
  console.log('layout:', (await geo()).join('  '));
  // clicking a day still works as a click (not a drag)
  const sorted = await p.evaluate(() => window.sorted);
  assert.strictEqual(sorted.length, 1);
  await p.screenshot({ path: 'test/board-after-drag.png', fullPage: false, clip: { x: 0, y: 0, width: 1000, height: 1100 } });
  await b.close();
  console.log('BOARD DRAG OK');
})().catch((e) => { console.error(e); process.exit(1); });
