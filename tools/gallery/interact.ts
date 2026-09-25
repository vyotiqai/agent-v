// Checks that the app's interactive components do what they say, in the browser, through the same
// gallery compare.ts uses (design tooling; never part of the app):
//
//   npm run build -w tools/gallery && node tools/gallery/interact.ts
//
// - HoldButton: holding for 0.9 s signs; letting go early cancels and signs nothing; holding
//   Space from the keyboard signs the same way.
// - Switch: a press turns it on and off, and screen readers are told which.
// - Filters: a press chooses one, and only one, option.
// - The focus ring: 2px in `focus`, 2px away, on a control reached by the keyboard (D77).

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import { after, test } from 'node:test';
import { chromium, type Page } from 'playwright';

const DIST = new URL('./dist/', import.meta.url).pathname;
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.ttf': 'font/ttf',
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
const browser = await chromium.launch();

async function open(component: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.goto(`${base}/?c=${component}`);
  await page.locator('[data-testid="preview"]').waitFor();
  return page;
}

test('holding the sign button for 0.9 s signs', async () => {
  const page = await open('HoldButton');
  const button = page.getByRole('button', { name: 'Hold to sign and send' });
  const box = await button.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
  await page.getByText('Signed and sent').waitFor({ timeout: 2000 });
  await page.close();
});

test('letting go early cancels and signs nothing', async () => {
  const page = await open('HoldButton');
  const button = page.getByRole('button', { name: 'Hold to sign and send' });
  const box = await button.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForTimeout(800);
  assert.equal(await page.getByText('Signed and sent').count(), 0);
  assert.equal(await button.count(), 1);
  await page.close();
});

test('holding Space on the focused sign button signs the same way', async () => {
  const page = await open('HoldButton');
  const button = page.getByRole('button', { name: 'Hold to sign and send' });
  await button.focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(1100);
  await page.keyboard.up('Space');
  await page.getByText('Signed and sent').waitFor({ timeout: 2000 });
  await page.close();
});

test('a switch turns on and off, and says which', async () => {
  const page = await open('Switch');
  const off = page.getByRole('switch', { name: 'Off' });
  assert.equal(await off.getAttribute('aria-checked'), 'false');
  await off.click();
  assert.equal(await off.getAttribute('aria-checked'), 'true');
  await off.click();
  assert.equal(await off.getAttribute('aria-checked'), 'false');
  await page.close();
});

test('filters choose one option at a time', async () => {
  const page = await open('Filters');
  const tab = (name: string) => page.getByRole('tab', { name });
  assert.equal(await tab('All').getAttribute('aria-selected'), 'true');
  await tab('Files').click();
  assert.equal(await tab('Files').getAttribute('aria-selected'), 'true');
  assert.equal(await tab('All').getAttribute('aria-selected'), 'false');
  await page.close();
});

test('a control reached by the keyboard shows the 2px focus ring, 2px away', async () => {
  const page = await open('Switch');
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return {
      role: el.getAttribute('role'),
      width: s.outlineWidth,
      offset: s.outlineOffset,
      style: s.outlineStyle,
      color: s.outlineColor,
    };
  });
  assert.deepEqual(ring, {
    role: 'switch',
    width: '2px',
    offset: '2px',
    style: 'solid',
    color: 'rgb(51, 85, 255)',
  });
  await page.close();
});

after(async () => {
  await browser.close();
  server.close();
});
