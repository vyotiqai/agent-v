"""Writes the app's theme from the design's own source (stage 6, D95).

docs/design/prototype/tokens.py is the one source of every colour, type style, space, radius, size
and shadow (D71), and docs/design/prototype/build.py of the 49 icons. This writes them into the
app as typed TypeScript, so the app, the design system and the prototypes can't drift apart.

    python3 tools/theme/generate.py           # write app/src/theme/tokens.ts, pairs.ts, icons.ts
    python3 tools/theme/generate.py --check   # exit 1 if any is not what the design source makes
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'docs/design/prototype'))
import tokens  # noqa: E402
from build import ICONS  # noqa: E402

OUT = ROOT / 'app/src/theme'
HEADER = (
    '// Generated from docs/design/prototype/tokens.py by tools/theme/generate.py. Do not edit:\n'
    '// change tokens.py, then run `npm run theme`.\n'
)

# The font files the app loads, by the name each is registered under (app/src/theme/fonts.ts).
FONTS = {
    ('sans', 400): 'Geist-Regular',
    ('sans', 500): 'Geist-Medium',
    ('sans', 600): 'Geist-SemiBold',
    ('mono', 400): 'GeistMono-Regular',
}


def camel(name):
    """'on-night-muted' -> 'onNightMuted', 'surface-2' -> 'surface2', 'figure-xl' -> 'figureXl'."""
    head, *rest = name.split('-')
    return head + ''.join(p[:1].upper() + p[1:] for p in rest)


def num(x):
    """A number as TypeScript writes it: 56 not 56.0, 19.5, -0.56."""
    x = round(x, 3)
    return str(int(x)) if x == int(x) else repr(x)


def px(value):
    m = re.fullmatch(r'(\d+(?:\.\d+)?)px', value)
    if not m:
        raise ValueError(f'not a px value: {value}')
    return float(m.group(1))


def tokens_ts():
    out = [HEADER]
    out.append("export type ThemeName = 'light' | 'dark';\n")
    out.append('/** Every colour, by role, in each theme (stage 5, section 1). */')
    out.append('export const colors = {')
    for theme, index in (('light', 1), ('dark', 2)):
        out.append(f'  {theme}: {{')
        for row in tokens.COLORS:
            out.append(f"    {camel(row[0])}: '{row[index]}',")
        out.append('  },')
    out.append('} as const;\n')
    out.append('export type ColorName = keyof (typeof colors)[\'light\'];')
    out.append('export type Colors = { readonly [K in ColorName]: string };\n')

    out.append('/** The font files, by the name each is registered under when the app starts. */')
    out.append('export const fonts = {')
    for (family, weight), name in FONTS.items():
        out.append(f"  {family}{weight}: '{name}',")
    out.append('} as const;\n')

    out.append('/** The 17 type styles (stage 5, section 3). Sizes, line heights and tracking in px. */')
    out.append('export const type = {')
    for _group, name, size, lh, weight, ls, _usage, _sample in tokens.TYPE_STYLES:
        family = 'mono' if name == 'code' else 'sans'
        tracking = float(ls.removesuffix('em')) * size if ls != '0' else 0
        out.append(
            f'  {camel(name)}: {{ fontFamily: fonts.{family}{weight}, fontSize: {num(size)}, '
            f'lineHeight: {num(size * lh)}, letterSpacing: {num(tracking)} }},'
        )
    out.append('} as const;\n')
    out.append('export type TypeStyle = keyof typeof type;\n')

    out.append('/** Spacing steps (stage 5, section 4): space[12] is 12. */')
    out.append('export const space = {')
    for name, value, _ in tokens.SPACING:
        out.append(f"  {name.removeprefix('space-')}: {num(value)},")
    out.append('} as const;\n')

    for const, rows, prefix, doc in (
        ('radius', tokens.RADII, 'radius-', 'Corner radii'),
        ('size', tokens.SIZES, '', 'Fixed sizes: touch targets, buttons, rows, marks and icons'),
    ):
        out.append(f'/** {doc} (stage 5, section 4). */')
        out.append(f'export const {const} = {{')
        for name, value, _ in rows:
            out.append(f"  {camel(name.removeprefix(prefix))}: {num(px(value))},")
        out.append('} as const;\n')

    out.append('/** Shadows, only on things that float (stage 5, section 4), as CSS box-shadow. */')
    out.append('export const shadows = {')
    for theme, index in (('light', 1), ('dark', 2)):
        out.append(f'  {theme}: {{')
        for row in tokens.SHADOWS:
            out.append(f"    {camel(row[0].removeprefix('shadow-'))}: '{row[index]}',")
        out.append('  },')
    out.append('} as const;')
    return '\n'.join(out) + '\n'


def pairs_ts():
    out = [HEADER]
    out.append("import type { ColorName } from './tokens.ts';\n")
    out.append('/** Every text or control colour and what it sits on, with the contrast it needs (D73). */')
    out.append('export const pairs: readonly (readonly [ColorName, ColorName, number, string])[] = [')
    for fg, bg, need, what in tokens.PAIRS:
        what_ts = what.replace("'", "\\'")
        out.append(f"  ['{camel(fg)}', '{camel(bg)}', {num(need)}, '{what_ts}'],")
    out.append('];')
    return '\n'.join(out) + '\n'


ELEMENT = re.compile(r'<(path|circle|rect)\s([^>]*?)\s*/>')
ATTR = re.compile(r'([a-z-]+)="([^"]*)"')
NUMERIC = {'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx'}


def icons_ts():
    """Each icon as its drawing parts, on the 24-unit grid (stage 5, section 5)."""
    out = [HEADER]
    out.append('/** One part of an icon: a path, circle or rect; `fill` draws it solid in the text colour. */')
    out.append('export type IconPart =')
    out.append("  | readonly ['path', { readonly d: string; readonly fill?: true }]")
    out.append(
        "  | readonly ['circle', { readonly cx: number; readonly cy: number; readonly r: number; readonly fill?: true }]"
    )
    out.append('  | readonly [')
    out.append("      'rect',")
    out.append('      {')
    out.append('        readonly x: number;')
    out.append('        readonly y: number;')
    out.append('        readonly width: number;')
    out.append('        readonly height: number;')
    out.append('        readonly rx?: number;')
    out.append('      },')
    out.append('    ];\n')
    out.append('/** The 49 icons: stroked in the text colour, 1.75 wide, round caps and joins. */')
    out.append('export const icons = {')
    for name, markup in ICONS.items():
        parts = []
        consumed = ''.join(m.group(0) for m in ELEMENT.finditer(markup))
        if consumed != markup:
            raise ValueError(f'icon {name} has markup this generator does not know')
        for m in ELEMENT.finditer(markup):
            tag, attrs = m.group(1), dict(ATTR.findall(m.group(2)))
            fill = attrs.pop('fill', None)
            if fill not in (None, 'currentColor'):
                raise ValueError(f'icon {name}: fill {fill}')
            fields = []
            for k, v in attrs.items():
                if k in NUMERIC:
                    fields.append(f'{k}: {num(float(v))}')
                elif k == 'd':
                    fields.append(f"d: '{v}'")
                else:
                    raise ValueError(f'icon {name}: attribute {k}')
            if fill:
                fields.append('fill: true')
            parts.append(f"['{tag}', {{ {', '.join(fields)} }}]")
        out.append(f"  {name}: [{', '.join(parts)}],")
    out.append('} as const satisfies Record<string, readonly IconPart[]>;\n')
    out.append('export type IconName = keyof typeof icons;')
    return '\n'.join(out) + '\n'


def formatted(path, text):
    """The text as the repository's formatter lays it out, so the files pass the lint check as made."""
    biome = ROOT / 'node_modules/.bin/biome'
    if not biome.exists():
        sys.exit('Run `npm ci` first: the generator formats its output with Biome.')
    done = subprocess.run(
        [str(biome), 'format', f'--stdin-file-path={path}'],
        input=text, capture_output=True, text=True, cwd=ROOT, check=True,
    )
    return done.stdout


def main():
    made = {'tokens.ts': tokens_ts(), 'pairs.ts': pairs_ts(), 'icons.ts': icons_ts()}
    files = {OUT / name: formatted(OUT / name, text) for name, text in made.items()}
    if '--check' in sys.argv:
        stale = [p for p, text in files.items() if not p.exists() or p.read_text() != text]
        for p in stale:
            print(f'{p.relative_to(ROOT)} is not what the design source makes: run `npm run theme`.')
        sys.exit(1 if stale else 0)
    OUT.mkdir(parents=True, exist_ok=True)
    for p, text in files.items():
        p.write_text(text)
        print('wrote', p.relative_to(ROOT))


if __name__ == '__main__':
    main()
