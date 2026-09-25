// Loads artboards with the real Design runtime, for end-to-end interaction tests.
// Usage in tests: const { open } = require('./play'); const page = await open(browser, 'NToday.dc.html');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, 'appmap', 'project');
const RUNTIME = path.join(__dirname, 'runtime', 'artifact-type', 'dc-runtime.js');
function serve() {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      const f = u === '/support.js' ? RUNTIME : path.join(ROOT, u);
      if ((f !== RUNTIME && !f.startsWith(ROOT)) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
      fs.createReadStream(f).pipe(r);
    }).listen(0, () => res(s));
  });
}
async function open(browser, base, file, errors) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(`${file}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${file}: console: ${m.text()}`); });
  await page.goto(`${base}/${file}`);
  await page.waitForFunction(() => document.querySelector('main') && getComputedStyle(document.querySelector('main')).display !== 'none', null, { timeout: 15000 });
  return page;
}
module.exports = { serve, open };
