// Renders every design-system component preview as the Design System page does (tokens.css, bundle.css,
// React 18, bundle.js, then the preview), in both themes; fails on any page error or an empty render.
// Usage: node ds-check.js [outSheetPrefix]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const DS = path.join(__dirname, 'ds', 'project');
const tokens = JSON.parse(fs.readFileSync(path.join(DS, 'tokens.json'), 'utf8'));
const light = tokens.color.tokens.map((t) => `--${t.name}: ${t.value.light};`).join(' ')
  + tokens.shadow.tokens.map((t) => `--${t.name}: ${t.value.light};`).join(' ');
const dark = tokens.color.tokens.map((t) => `--${t.name}: ${t.value.dark};`).join(' ')
  + tokens.shadow.tokens.map((t) => `--${t.name}: ${t.value.dark};`).join(' ');
const other = [...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.size.tokens].map((t) => `--${t.name}: ${t.value};`).join(' ')
  + Object.entries(tokens.type.families).map(([k, v]) => `--font-${k}: ${v};`).join(' ');
const tokensCss = `:root, [data-theme="light"] { ${light} } [data-theme="dark"] { ${dark} } :root { ${other} }`;
const bundleCss = fs.readFileSync(path.join(DS, 'components/bundle.css'), 'utf8');
const bundleJs = fs.readFileSync(path.join(DS, 'components/bundle.js'), 'utf8');
const runtime = fs.readFileSync(path.join(__dirname, 'runtime/artifact-type/dc-runtime.js'), 'utf8');
const cache = new Map();
const curl = (u) => { if (!cache.has(u)) cache.set(u, execFileSync('curl', ['-s', '-A', 'Mozilla/5.0 Chrome/120', u], { maxBuffer: 1 << 26 })); return cache.get(u); };

(async () => {
  const comps = fs.readdirSync(path.join(DS, 'components')).filter((d) => d !== 'Cover' && fs.existsSync(path.join(DS, 'components', d, 'preview.html'))).sort();
  const browser = await chromium.launch();
  const problems = [];
  const shots = [];
  for (const theme of ['light', 'dark']) {
    for (const c of comps) {
      const src = fs.readFileSync(path.join(DS, 'components', c, 'preview.html'), 'utf8');
      const width = Number((src.match(/width=(\d+)/) || [0, 390])[1]) || 390;
      const body = src.slice(src.indexOf('<body'), src.lastIndexOf('</body>') + 7);
      const p = await browser.newPage({ viewport: { width, height: 600 } });
      await p.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: curl(r.request().url()).toString() }));
      await p.route(/fonts\.gstatic\.com/, (r) => r.fulfill({ status: 200, contentType: 'font/woff2', body: curl(r.request().url()) }));
      p.on('pageerror', (e) => problems.push(`${c} (${theme}): ${e.message}`));
      await p.setContent(`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${tokensCss}</style><style>${bundleCss}</style></head>${body.replace('<script>', '<script type="text/plain" id="preview">')}</html>`, { waitUntil: 'domcontentloaded' });
      // Libraries first, as the page preloads them, then run the preview again now that they exist.
      await p.addScriptTag({ content: runtime });
      await p.addScriptTag({ content: bundleJs });
      await p.evaluate(() => { const s = document.getElementById('preview'); const n = document.createElement('script'); n.textContent = s.textContent; document.body.appendChild(n); });
      await p.waitForTimeout(700);
      const h = await p.evaluate(() => document.getElementById('root').getBoundingClientRect().height);
      if (h < 20) problems.push(`${c} (${theme}): rendered nothing`);
      const marker = Number((src.match(/height=(\d+)/) || [0, 120])[1]);
      if (h > marker + 4) problems.push(`${c} (${theme}): content ${Math.round(h)}px is taller than its card (${marker}px)`);
      shots.push({ c, theme, png: await p.locator('#root').screenshot() });
      await p.close();
    }
  }
  const prefix = process.argv[2];
  if (prefix) {
    const page = await browser.newPage({ viewport: { width: 1640, height: 800 } });
    for (let i = 0; i < shots.length; i += 8) {
      const group = shots.slice(i, i + 8);
      await page.setContent(`<body style="margin:0;background:#888;display:flex;flex-wrap:wrap;gap:8px;padding:8px;font:12px sans-serif">${group.map((s) => `<figure style="margin:0;width:400px"><figcaption>${s.c} · ${s.theme}</figcaption><img style="width:400px" src="data:image/png;base64,${s.png.toString('base64')}"></figure>`).join('')}</body>`);
      await page.screenshot({ path: `${prefix}-${String(i / 8).padStart(2, '0')}.png`, fullPage: true });
    }
  }
  await browser.close();
  for (const pr of problems) console.log('PROBLEM', pr);
  console.log(`${comps.length} previews x 2 themes, ${problems.length} problems`);
  process.exit(problems.length ? 1 : 0);
})();
