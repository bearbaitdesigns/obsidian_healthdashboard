const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); 
for (const [f, w] of process.argv.slice(2).map(x => x.split(':'))) { const p = await b.newPage({ viewport: { width: +w, height: 900 } }); await p.goto('file://' + require('path').resolve(f)); await p.screenshot({ path: f.replace('.html', '-' + w + '.png'), fullPage: true }); }
await b.close(); })();
