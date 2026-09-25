// Screenshots every artboard on the given canvas pages with the real runtime, animations stopped,
// real fonts, so two runs can be compared pixel by pixel.
// Usage: node shoot-all.js <outDir> [page ...]   (default pages: clean states)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const { serve } = require('./play');

const [outDir, ...pagesArg] = process.argv.slice(2);
const pages = pagesArg.length ? pagesArg : ['clean', 'states'];
const canvas = JSON.parse(fs.readFileSync(path.join(__dirname, 'appmap/project/canvas.json'), 'utf8'));
const boards = Object.entries(canvas.boards).filter(([, v]) => pages.includes(v.page)).map(([k]) => k).sort();
const cache = new Map();
const curl = (u) => {
  if (!cache.has(u)) cache.set(u, execFileSync('curl', ['-s', '-A', 'Mozilla/5.0 Chrome/120', u], { maxBuffer: 1 << 26 }));
  return cache.get(u);
};

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: curl(r.request().url()).toString() }));
  await ctx.route(/fonts\.gstatic\.com/, (r) => r.fulfill({ status: 200, contentType: 'font/woff2', body: curl(r.request().url()) }));
  for (const file of boards) {
    const p = await ctx.newPage();
    await p.goto(`http://localhost:${server.address().port}/${file}`);
    await p.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelector('main'));
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(outDir, file.replace('.dc.html', '.png')), animations: 'disabled' });
    await p.close();
  }
  await browser.close();
  server.close();
  console.log(`${boards.length} screenshots in ${outDir}`);
})();
