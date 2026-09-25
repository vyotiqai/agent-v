// Renders the design system's cover in both themes into out/cover.png, to look at before publishing.
const fs = require('fs'); const { chromium } = require('playwright'); const { execFileSync } = require('child_process');
const t = JSON.parse(fs.readFileSync('ds/project/tokens.json', 'utf8'));
const v = (th) => t.color.tokens.map((x) => `--${x.name}: ${x.value[th]};`).join(' ');
const css = `:root, [data-theme="light"] { ${v('light')} } [data-theme="dark"] { ${v('dark')} } :root { --font-sans: ${t.type.families.sans}; }`;
const src = fs.readFileSync('ds/project/components/Cover/preview.html', 'utf8');
const bundleCss = fs.readFileSync('ds/project/components/bundle.css', 'utf8');
(async () => {
  const b = await chromium.launch(); const shots = [];
  for (const th of ['light', 'dark']) {
    const p = await b.newPage({ viewport: { width: 960, height: 300 } });
    await p.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ contentType: 'text/css', body: execFileSync('curl', ['-s', '-A', 'Mozilla/5.0 Chrome/120', r.request().url()]).toString() }));
    await p.route(/fonts\.gstatic\.com/, (r) => r.fulfill({ contentType: 'font/woff2', body: execFileSync('curl', ['-s', r.request().url()], { maxBuffer: 1 << 26 }) }));
    await p.setContent(src.replace('<head>', `<head><style>${css}</style><style>${bundleCss}</style>`).replace('<html>', `<html data-theme="${th}">`));
    await p.waitForTimeout(800); shots.push(await p.screenshot());
  }
  const p = await b.newPage({ viewport: { width: 980, height: 630 } });
  await p.setContent(`<body style="margin:0;background:#888;padding:10px;display:flex;flex-direction:column;gap:10px">${shots.map((s) => `<img src="data:image/png;base64,${s.toString('base64')}">`).join('')}</body>`);
  fs.mkdirSync('out', { recursive: true }); await p.screenshot({ path: 'out/cover.png' }); await b.close();
})();
