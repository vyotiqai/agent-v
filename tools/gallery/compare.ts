// Compares each app component with its design-system preview (stage 7, slice 0: "components match
// the design system's previews in both themes"). Design tooling, run locally like the prototype's
// checks, since the design system's previews need the canvas runtime, which is not kept in git.
//
//   npm run build -w tools/gallery        # the gallery, into tools/gallery/dist
//   node tools/gallery/compare.ts <out>   # writes <out>/<Component>-<theme>.png and a report
//
// For every component, in light and dark, with Reduce Motion on so nothing is mid-breath, it
// photographs the design system's preview and the app's, and measures how many pixels differ by
// more than anti-aliasing does. Each image shows the design system, the app and the difference.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import { chromium, type Page } from 'playwright';

const ROOT = new URL('../../', import.meta.url).pathname;
const DS = join(ROOT, 'docs/design/prototype/ds/project');
const RUNTIME = join(ROOT, 'docs/design/prototype/runtime/artifact-type/dc-runtime.js');
const DIST = join(ROOT, 'tools/gallery/dist');
const out = process.argv[2] ?? 'gallery-compare';

// A pixel counts as different when no pixel of the other image within one pixel of it is within
// this much on every channel: anti-aliasing and half-pixel offsets pass, anything larger doesn't.
const CHANNEL = 48;
// A component matches when at most this share of its pixels differ and its height is within 1px.
// A figure cut to "$0.…" is about 1.5% of its preview, so this catches it.
const MAX_SHARE = 0.005;

for (const [path, how] of [
  [RUNTIME, 'read it from the canvas artifact (see docs/design/prototype/README.md)'],
  [join(DIST, 'index.html'), 'run `npm run build -w tools/gallery`'],
  [join(DS, 'tokens.json'), 'run `python3 ds_build.py` in docs/design/prototype'],
] as const) {
  if (!existsSync(path)) {
    process.stderr.write(`Missing ${path}: ${how}.\n`);
    process.exit(2);
  }
}

// The design system's preview page, exactly as ds-check.js builds it.
const tokens = JSON.parse(readFileSync(join(DS, 'tokens.json'), 'utf8'));
type Tok = { name: string; value: string | { light: string; dark: string } };
const vars = (theme: 'light' | 'dark') =>
  [...tokens.color.tokens, ...tokens.shadow.tokens]
    .map((t: Tok) => `--${t.name}: ${typeof t.value === 'string' ? t.value : t.value[theme]};`)
    .join(' ');
const other =
  [...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.size.tokens]
    .map((t: Tok) => `--${t.name}: ${t.value};`)
    .join(' ') +
  Object.entries(tokens.type.families as Record<string, string>)
    .map(([k, v]) => `--font-${k}: ${v};`)
    .join(' ');
const tokensCss = `:root, [data-theme="light"] { ${vars('light')} } [data-theme="dark"] { ${vars('dark')} } :root { ${other} }`;
const bundleCss = readFileSync(join(DS, 'components/bundle.css'), 'utf8');
const bundleJs = readFileSync(join(DS, 'components/bundle.js'), 'utf8');
const runtime = readFileSync(RUNTIME, 'utf8');
const fetched = new Map<string, Buffer>();
const curl = (u: string): Buffer => {
  if (!fetched.has(u))
    fetched.set(
      u,
      execFileSync('curl', ['-s', '-A', 'Mozilla/5.0 Chrome/120', u], { maxBuffer: 1 << 26 }),
    );
  return fetched.get(u) as Buffer;
};

async function designShot(page: Page, component: string, theme: string): Promise<Buffer> {
  const src = readFileSync(join(DS, 'components', component, 'preview.html'), 'utf8');
  const body = src.slice(src.indexOf('<body'), src.lastIndexOf('</body>') + 7);
  await page.setContent(
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${tokensCss}</style><style>${bundleCss}</style></head>${body.replace('<script>', '<script type="text/plain" id="preview">')}</html>`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.addScriptTag({ content: runtime });
  await page.addScriptTag({ content: bundleJs });
  await page.evaluate(() => {
    const s = document.getElementById('preview') as HTMLElement;
    const n = document.createElement('script');
    n.textContent = s.textContent;
    document.body.appendChild(n);
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return page.locator('#root').screenshot();
}

async function appShot(
  page: Page,
  base: string,
  component: string,
  theme: string,
): Promise<Buffer> {
  await page.goto(`${base}/?c=${component}&theme=${theme}`);
  const el = page.locator('[data-testid="preview"]');
  await el.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return el.screenshot();
}

// Serves the built gallery.
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0] as string);
  const file = join(DIST, path === '/' ? 'index.html' : path);
  if (!file.startsWith(DIST) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
server.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const browser = await chromium.launch(
  process.env['CHROMIUM_PATH'] ? { executablePath: process.env['CHROMIUM_PATH'] } : {},
);
const context = await browser.newContext({
  viewport: { width: 390, height: 900 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
await page.route(/fonts\.googleapis\.com/, (r) =>
  r.fulfill({ status: 200, contentType: 'text/css', body: curl(r.request().url()).toString() }),
);
await page.route(/fonts\.gstatic\.com/, (r) =>
  r.fulfill({ status: 200, contentType: 'font/woff2', body: curl(r.request().url()) }),
);
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const judge = await context.newPage();

mkdirSync(out, { recursive: true });
const components = readdirSync(join(DS, 'components'))
  .filter((d) => d !== 'Cover' && existsSync(join(DS, 'components', d, 'preview.html')))
  .sort();
const rows: {
  component: string;
  theme: string;
  ds: string;
  app: string;
  share: number;
  pass: boolean;
}[] = [];
for (const theme of ['light', 'dark']) {
  for (const component of components) {
    const a = await designShot(page, component, theme);
    const b = await appShot(page, base, component, theme);
    // Measure in the browser: draw both, count differing pixels, and lay out ds | app | difference.
    const result = await judge.evaluate(
      async ({ a, b, channel }) => {
        const load = (b64: string) =>
          new Promise<HTMLImageElement>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = `data:image/png;base64,${b64}`;
          });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const w = Math.max(ia.width, ib.width);
        const h = Math.max(ia.height, ib.height);
        const px = (img: HTMLImageElement) => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const x = c.getContext('2d') as CanvasRenderingContext2D;
          x.fillStyle = '#ff00ff';
          x.fillRect(0, 0, w, h);
          x.drawImage(img, 0, 0);
          return x.getImageData(0, 0, w, h);
        };
        const da = px(ia);
        const db = px(ib);
        const sheet = document.createElement('canvas');
        sheet.width = w * 3 + 16;
        sheet.height = h;
        const s = sheet.getContext('2d') as CanvasRenderingContext2D;
        s.fillStyle = '#808080';
        s.fillRect(0, 0, sheet.width, h);
        s.drawImage(ia, 0, 0);
        s.drawImage(ib, w + 8, 0);
        const diff = s.createImageData(w, h);
        // True when pixel (x, y) of `p` has a match in `q` at the same place or one pixel away.
        const near = (p: ImageData, q: ImageData, x: number, y: number) => {
          const i = (y * w + x) * 4;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
              const j = (yy * w + xx) * 4;
              if (
                Math.abs((p.data[i] as number) - (q.data[j] as number)) <= channel &&
                Math.abs((p.data[i + 1] as number) - (q.data[j + 1] as number)) <= channel &&
                Math.abs((p.data[i + 2] as number) - (q.data[j + 2] as number)) <= channel
              ) {
                return true;
              }
            }
          }
          return false;
        };
        let differing = 0;
        for (let i = 0; i < da.data.length; i += 4) {
          const x = (i / 4) % w;
          const y = Math.floor(i / 4 / w);
          const off = !near(da, db, x, y) || !near(db, da, x, y);
          if (off) differing++;
          const g = Math.round(
            ((da.data[i] as number) + (da.data[i + 1] as number) + (da.data[i + 2] as number)) / 12,
          );
          diff.data[i] = off ? 255 : g;
          diff.data[i + 1] = off ? 0 : g;
          diff.data[i + 2] = off ? 0 : g;
          diff.data[i + 3] = 255;
        }
        s.putImageData(diff, w * 2 + 16, 0);
        return {
          share: differing / (w * h),
          ds: `${ia.width}×${ia.height}`,
          app: `${ib.width}×${ib.height}`,
          heights: [ia.height, ib.height],
          sheet: sheet.toDataURL('image/png').split(',')[1] as string,
        };
      },
      { a: a.toString('base64'), b: b.toString('base64'), channel: CHANNEL },
    );
    writeFileSync(join(out, `${component}-${theme}.png`), Buffer.from(result.sheet, 'base64'));
    const [ha, hb] = result.heights as [number, number];
    const pass = result.share <= MAX_SHARE && Math.abs(ha - hb) <= 1;
    rows.push({ component, theme, ds: result.ds, app: result.app, share: result.share, pass });
  }
}
await browser.close();
server.close();

const lines = [
  '| Component | Theme | Design system | App | Pixels that differ | Result |',
  '|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.component} | ${r.theme} | ${r.ds} | ${r.app} | ${(r.share * 100).toFixed(2)}% | ${r.pass ? 'match' : 'DIFFERS'} |`,
  ),
];
writeFileSync(join(out, 'report.md'), `${lines.join('\n')}\n`);
process.stdout.write(`${lines.join('\n')}\n`);
for (const e of errors) process.stdout.write(`PAGE ERROR ${e}\n`);
const failed = rows.filter((r) => !r.pass).length;
process.stdout.write(
  `${rows.length} comparisons, ${failed} differ, ${errors.length} page errors\n`,
);
process.exit(failed || errors.length ? 1 : 0);
