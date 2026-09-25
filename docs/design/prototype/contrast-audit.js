// Measures the contrast of every piece of visible text on every artboard, as rendered:
// the text's colour against the solid background behind it (alpha blended up the tree).
// WCAG 2: 4.5:1, or 3:1 for text 24px and up, or 18.66px bold (700) and up.
// Usage: node contrast-audit.js [page ...]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./play');

const pages = process.argv.slice(2).length ? process.argv.slice(2) : ['clean', 'states'];
const canvas = JSON.parse(fs.readFileSync(path.join(__dirname, 'appmap/project/canvas.json'), 'utf8'));
const boards = Object.entries(canvas.boards).filter(([, v]) => pages.includes(v.page)).map(([k]) => k).sort();

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  let fails = 0;
  for (const file of boards) {
    const p = await ctx.newPage();
    await p.goto(`http://localhost:${server.address().port}/${file}`);
    await p.waitForFunction(() => document.querySelector('main'));
    await p.waitForTimeout(300);
    const bad = await p.evaluate(() => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(',').map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
      const over = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
      const lum = (c) => { const ch = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]); };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const bgOf = (el) => {
        const stack = [];
        for (let e = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          const c = parse(cs.backgroundColor);
          if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; }
        }
        let b = [255, 255, 255, 1];
        for (let i = stack.length - 1; i >= 0; i--) b = over(stack[i], b);
        return b;
      };
      const out = [];
      const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent.trim();
        if (!t) continue;
        const el = n.parentElement;
        if (el.closest('[aria-hidden="true"]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > 844) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
        const bg = bgOf(el);
        let fg = parse(cs.color); fg = [fg[0], fg[1], fg[2], fg[3] * op];
        const cr = ratio(over(fg, bg), bg);
        const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight);
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const disabled = el.closest('button:disabled, [aria-disabled="true"]');
        const need = large ? 3 : 4.5;
        if (cr < need && !disabled) out.push(`${cr.toFixed(2)} < ${need}  ${size}px/${weight}  "${t.slice(0, 50)}"  ${cs.color} on rgb(${bg.slice(0, 3).map(Math.round).join(',')})`);
      }
      return out;
    });
    for (const b of bad) console.log(`${file.replace('.dc.html', '')}: ${b}`);
    fails += bad.length;
    await p.close();
  }
  await browser.close();
  server.close();
  console.log(`${boards.length} artboards, ${fails} text contrast failures`);
  process.exit(fails ? 1 : 0);
})();
