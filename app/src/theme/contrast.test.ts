import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairs } from './pairs.ts';
import { colors, type ThemeName } from './tokens.ts';

// The contrast check on the app's own theme (stage 7, slice 0), computed here from the generated
// values, independently of the design tooling's check: every text and control pair meets WCAG 2.2
// AA in both themes (D73).

type Rgba = [number, number, number, number];

function parse(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1] as string, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!rgba) throw new Error(`Not a colour: ${value}`);
  const [r, g, b, a = 1] = (rgba[1] as string).split(',').map(Number) as number[];
  return [r as number, g as number, b as number, a];
}

function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function luminance(c: Rgba): number {
  const ch = (x: number) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
}

/** WCAG 2 contrast. A translucent background is laid over the dark top, as in the design check. */
export function contrast(fg: string, bg: string): number {
  let back = parse(bg);
  if (back[3] < 1) back = over(back, parse('#0C0C0E'));
  const front = over(parse(fg), back);
  const [hi, lo] = [luminance(front), luminance(back)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

test('every text and control pair meets its minimum in both themes', () => {
  assert.equal(pairs.length, 30);
  for (const theme of ['light', 'dark'] as ThemeName[]) {
    for (const [fg, bg, need, what] of pairs) {
      const ratio = contrast(colors[theme][fg], colors[theme][bg]);
      assert.ok(
        ratio >= need,
        `${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}, needs ${need} (${what})`,
      );
    }
  }
});

test('the calculation matches the published figures in stage 5', () => {
  // Three rows of the table in 05-design-system.md, section 2.
  assert.equal(contrast(colors.light.ink, colors.light.ground).toFixed(2), '16.37');
  assert.equal(contrast(colors.light.greenText, colors.light.surface).toFixed(2), '5.16');
  assert.equal(contrast(colors.dark.onNightDim, colors.dark.night).toFixed(2), '4.08');
});

test('both themes define every colour', () => {
  assert.deepEqual(Object.keys(colors.dark).sort(), Object.keys(colors.light).sort());
});
