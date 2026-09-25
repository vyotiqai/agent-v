"""Agent V design tokens: the one source for the design system's tokens.json, the prototypes' CSS
variables and the contrast report. Values for the light theme are exactly what the agreed screens use.

Run: python3 tokens.py            -> prints the contrast report, exits 1 if a pair fails
     python3 tokens.py --json out -> writes tokens.json for the Design System artifact
"""
import json
import re
import sys

THEMES = ['light', 'dark']

# name: (light, dark, usage). Order is the order the design system shows them.
COLORS = [
    # The light area: ground, surfaces and lines
    ('ground', '#EFEFEC', '#0B0B0D', 'The page ground under the blocks on main screens (Today, Jobs, settings).'),
    ('surface', '#FFFFFF', '#19191C', 'Blocks, rows, sheets and cards on `ground`.'),
    ('surface-2', '#F0F0ED', '#26262B', 'Round marks, small buttons, chips and the tinted row inside a block, on `surface`.'),
    ('line', '#E7E7E3', '#2C2C31', 'Hairlines between rows inside a block, and input borders.'),
    ('line-strong', '#D4D4CF', '#3A3A40', 'The border of a secondary button, and a switch’s track when off.'),
    ('control-off', '#8A8A90', '#8E8E95', 'The ring of a switch that is off, and other control edges that must be seen (3:1 on `surface`).'),
    ('skeleton', '#E9E9E5', '#26262B', 'Grey shapes while a screen loads for the first time (D55).'),
    ('disabled', '#DCDCD7', '#2C2C31', 'A button that can’t be used right now (signing while offline, Send with nothing written). Its label is `ink-muted`.'),
    # Text on the light area
    ('ink', '#111113', '#F2F2F0', 'Primary text and icons on `ground`, `surface` and `surface-2`; also the fill of progress bars and done marks.'),
    ('ink-muted', '#6B6B70', '#9A9AA0', 'Secondary text: row details, labels, captions, on `ground`, `surface` and `surface-2`.'),
    ('on-ink', '#FFFFFF', '#111113', 'Text and icons on an `ink` fill (a done mark, a Connect button).'),
    ('action', '#0C0C0E', '#F2F2F0', 'The one main button on a light screen (Start, Continue, Answer).'),
    ('on-action', '#F5F5F4', '#0C0C0E', 'The label of the main button, on `action`.'),
    ('bar', '#0C0C0E', '#26262B', 'The hand-off line floating at the bottom of main screens.'),
    ('on-bar', '#F5F5F4', '#F5F5F4', 'Text and icons on `bar`.'),
    ('on-bar-muted', '#8A8A90', '#9A9AA0', 'The hand-off line’s placeholder, on `bar`.'),
    # The dark top and full dark screens
    ('night', '#0C0C0E', '#141417', 'The dark top of every main screen, and the ground of full dark screens (speaking, handing off, the live browser).'),
    ('night-2', '#17171A', '#202025', 'Dark tiles and panels: the watch tile on Today, the hand-off form, the command list.'),
    ('night-3', '#2A2A30', '#2E2E35', 'Your initial and other avatars on `night`.'),
    ('glass', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.08)', 'Round buttons, chips and tabs on `night`.'),
    ('on-night', '#F5F5F4', '#F5F5F4', 'Text and icons on `night`, `night-2` and `glass`.'),
    ('on-night-muted', '#8A8A90', '#8E8E95', 'Secondary text on `night` and `night-2`.'),
    ('on-night-dim', '#6A6A71', '#76767D', 'The quiet part of Today’s sentence, on `night`. Only at 24px or larger.'),
    ('glow', 'rgba(51,85,255,0.34)', 'rgba(51,85,255,0.30)', 'The soft blue light at the top right of the dark top. Never on controls.'),
    # Blue: needs you, and the agent itself (D27, D35)
    ('blue', '#3355FF', '#3355FF', 'Needs you, and the agent itself: the Needs you block, the microphone, the voice orb, where the agent points. Never decoration.'),
    ('on-blue', '#FFFFFF', '#FFFFFF', 'Text and icons on a `blue` fill.'),
    ('on-blue-muted', '#EDF0FF', '#EDF0FF', 'Secondary text on a `blue` fill. Solid, never white with transparency (that falls under 4.5:1).'),
    ('blue-deep', '#2743D9', '#2743D9', 'Chips and small buttons inside a `blue` block, with `on-blue` labels.'),
    ('blue-text', '#3355FF', '#8FA3FF', 'Blue as text or an icon on `surface`: “Signature”, “Asks first”, the step that needs you.'),
    ('blue-on-night', '#8FA3FF', '#8FA3FF', 'Small blue marks on `night`: the live dot, the Needs you dot, the $ in the command list.'),
    # Red: can't be undone, and only that
    ('red', '#C8323A', '#C8323A', 'Can’t be undone: the hold button for it, and Delete. Nothing else is red.'),
    ('on-red', '#FFFFFF', '#FFFFFF', 'Text and icons on a `red` fill.'),
    ('red-text', '#C8323A', '#FF7A73', 'Red as text or an icon on `surface`: Delete, “Can’t be undone”.'),
    ('red-on-night', '#FF7A73', '#FF7A73', 'The can’t-be-undone dot on `night`.'),
    # Green: a working connection, and only that
    ('green', '#1F8A4C', '#2EA464', 'A working connection: the Connected and Working dot, a key that works. Nothing else is green.'),
    ('green-text', '#1B7D45', '#4CC38A', 'Green as text on `surface` and `surface-2`: “Connected”, “Working”. Darker than `green` so small text reads (the agreed #1F8A4C was 4.38:1).'),
    ('on-green', '#FFFFFF', '#0B0B0D', 'Text and icons on a `green` fill.'),
    # Overlays
    ('scrim', 'rgba(12,12,14,0.55)', 'rgba(0,0,0,0.6)', 'Behind a sheet or a preview.'),
    ('toast', '#26262B', '#3A3A41', 'The bar that says what just happened, with Undo (D65).'),
    ('on-toast', '#F5F5F4', '#F5F5F4', 'Text on `toast`.'),
    ('focus', '#3355FF', '#8FA3FF', 'The keyboard focus ring: 2px, 2px away from the control, on every surface.'),
]

# Text or marks that must be legible: (foreground, background, minimum ratio, what it is)
PAIRS = [
    ('ink', 'ground', 4.5, 'body text on the ground'),
    ('ink', 'surface', 4.5, 'body text in a block'),
    ('ink', 'surface-2', 4.5, 'text on a small button or chip'),
    ('ink-muted', 'ground', 4.5, 'details on the ground'),
    ('ink-muted', 'surface', 4.5, 'row details in a block'),
    ('ink-muted', 'surface-2', 4.5, 'details on a tinted row'),
    ('on-ink', 'ink', 4.5, 'label on an ink fill'),
    ('on-action', 'action', 4.5, 'the main button label'),
    ('on-night', 'night', 4.5, 'text on the dark top'),
    ('on-night', 'night-2', 4.5, 'text on a dark tile'),
    ('on-night-muted', 'night', 4.5, 'details on the dark top'),
    ('on-night-muted', 'night-2', 4.5, 'details on a dark tile'),
    ('on-night-dim', 'night', 3.0, 'the quiet part of Today’s sentence (28px)'),
    ('on-blue', 'blue', 4.5, 'text on the Needs you block'),
    ('on-blue-muted', 'blue', 4.5, 'secondary text on the Needs you block'),
    ('on-blue', 'blue-deep', 4.5, 'a chip inside the Needs you block'),
    ('on-bar', 'bar', 4.5, 'the hand-off line'),
    ('on-bar-muted', 'bar', 4.5, 'the hand-off line’s placeholder'),
    ('blue-text', 'surface', 4.5, 'blue words in a block'),
    ('blue-on-night', 'night', 4.5, 'blue marks on the dark top'),
    ('on-red', 'red', 4.5, 'the can’t-be-undone button label'),
    ('red-text', 'surface', 4.5, 'red words in a block'),
    ('green-text', 'surface', 4.5, 'Connected, Working'),
    ('green-text', 'surface-2', 4.5, 'Connected on a tinted row'),
    ('on-green', 'green', 3.0, 'the check on a green mark (icon)'),
    ('on-toast', 'toast', 4.5, 'the Undo bar'),
    ('control-off', 'surface', 3.0, 'the edge of a switch that is off'),
    ('focus', 'surface', 3.0, 'the focus ring on a block'),
    ('focus', 'ground', 3.0, 'the focus ring on the ground'),
    ('ink', 'skeleton', 4.5, 'text never sits on a skeleton; checked so a stray label stays legible'),
]

TYPE_FAMILIES = {
    'sans': '"Geist", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    'mono': '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace',
}

# (group, name, size, line height, weight, letter spacing, usage, sample)
TYPE_STYLES = [
    ('Figures', 'figure-xl', 56, 1, 500, '-0.04em', 'The one large figure of a settings page (the briefing time).', '7:30'),
    ('Figures', 'figure-l', 44, 1, 500, '-0.035em', 'A money figure at the top of a page (this month’s spend, a goal saved).', '$3.10'),
    ('Figures', 'figure', 34, 1, 500, '-0.03em', 'The numbers in a dark top’s row of stats.', '3/5'),
    ('Titles', 'title-xl', 34, 1.12, 500, '-0.03em', 'The one question on a full dark screen (What should I take care of?).', 'What should I take care of?'),
    ('Titles', 'title', 28, 1.15, 500, '-0.025em', 'The page title in the dark top, and Today’s sentence (at 1.2).', 'Compare CRM tools'),
    ('Titles', 'title-2', 24, 1.2, 500, '-0.02em', 'The title inside the Needs you block; a figure on a tile.', 'Reply to Sam about Friday'),
    ('Titles', 'title-3', 20, 1.25, 500, '-0.015em', 'A block’s headline, a sheet’s title, what the agent is doing now.', 'Reading reviews of the 4 tools'),
    ('Titles', 'headline', 17, 1.25, 500, '-0.01em', 'A tile’s title.', 'MacBook Air'),
    ('Text', 'reading', 18, 1.55, 400, '0', 'Content you read or sign in full: an email, a message (D62).', 'Friday at 3 works for me.'),
    ('Text', 'body', 16, 1.5, 400, '0', 'Paragraphs and guides.', 'I read, search and draft on my own.'),
    ('Text', 'button', 16, 1.2, 600, '0', 'Button labels.', 'Take control'),
    ('Text', 'row', 15, 1.3, 500, '0', 'A row’s title; menu items at 16.', 'Morning briefing'),
    ('Text', 'sub', 15, 1.45, 400, '0', 'The sentence under a page title.', 'It sends an invite in your name.'),
    ('Text', 'small', 14, 1.4, 500, '0', 'Small buttons, chips, filters.', 'Try again'),
    ('Text', 'caption', 13, 1.35, 400, '0', 'Row details, block labels, notes. The smallest size for anything you must read.', 'Weekdays at 7:30'),
    ('Text', 'micro', 12, 1.35, 400, '0', 'Chart labels and support references only.', 'Ref. S-4F2A'),
    ('Mono', 'code', 12.5, 1.7, 400, '0', 'Commands the agent ran and file previews, in Geist Mono.', '$ python compare.py'),
]

SPACING = [
    ('space-2', 2, 'Between a title and its detail.'),
    ('space-4', 4, 'Between progress segments; tight stacks.'),
    ('space-6', 6, 'Between chips and tabs.'),
    ('space-8', 8, 'Between blocks on a screen, and between buttons.'),
    ('space-10', 10, 'Inside a status chip; between a label and its field.'),
    ('space-12', 12, 'Screen edge to blocks; a row’s mark to its text.'),
    ('space-14', 14, 'Between the parts of a card.'),
    ('space-16', 16, 'Screen edge to bottom buttons.'),
    ('space-18', 18, 'Inside a block, left and right.'),
    ('space-20', 20, 'Inside the Needs you block.'),
    ('space-24', 24, 'Screen edge to text in the dark top.'),
    ('space-28', 28, 'Bottom actions and the hand-off line above the bottom edge.'),
    ('space-58', 58, 'The dark top’s content below the phone’s status bar.'),
]

RADII = [
    ('radius-pill', '999px', 'Buttons, chips, tabs, round buttons, the hand-off line.'),
    ('radius-sheet', '32px', 'Sheets, and the dark top’s bottom corners.'),
    ('radius-block', '28px', 'Blocks and tiles.'),
    ('radius-card', '24px', 'Choice cards, question answers, confirmation cards.'),
    ('radius-row', '22px', 'A single rounded row on its own (an idea, a waiting hand-off).'),
    ('radius-inset', '18px', 'The Undo bar and inline confirmations.'),
    ('radius-small', '16px', 'A tinted row inside a block; a file preview table.'),
    ('radius-field', '14px', 'Text fields.'),
    ('radius-mark', '13px', 'The V mark.'),
    ('radius-bar', '2px', 'Progress segments.'),
]

SIZES = [
    ('target', '44px', 'The smallest touch target, everywhere (48dp on Android).'),
    ('button', '56px', 'Main buttons.'),
    ('hold', '60px', 'Hold-to-sign buttons.'),
    ('row', '62px', 'List rows in blocks (56px in settings, 52px on You).'),
    ('mark', '36px', 'Round icon marks at the start of a row.'),
    ('icon', '20px', 'Icons in buttons and marks (18px in marks, 15px in chips).'),
]

SHADOWS = [
    ('shadow-bar', '0 10px 30px rgba(12,12,14,0.18)', '0 10px 30px rgba(0,0,0,0.5)', 'The hand-off line floating over content.'),
    ('shadow-toast', '0 10px 30px rgba(12,12,14,0.25)', '0 10px 30px rgba(0,0,0,0.5)', 'The Undo bar.'),
    ('shadow-menu', '0 16px 40px rgba(0,0,0,0.4)', '0 16px 40px rgba(0,0,0,0.6)', 'A small menu over a dark screen (Attach).'),
    ('shadow-knob', '0 1px 3px rgba(0,0,0,0.2)', '0 1px 3px rgba(0,0,0,0.4)', 'A switch’s knob.'),
]


# ---------------------------------------------------------------- contrast (WCAG 2)

def _rgba(v):
    v = v.strip()
    if v.startswith('#'):
        h = v[1:]
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (1.0,)
    m = re.match(r'rgba?\(([^)]*)\)', v)
    parts = [float(x) for x in m.group(1).split(',')]
    return (parts[0], parts[1], parts[2], parts[3] if len(parts) > 3 else 1.0)


def _over(fg, bg):
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3)) + (1.0,)


def _lum(c):
    def ch(x):
        x /= 255
        return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c[i]) for i in range(3))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg, under=None):
    b = _rgba(bg)
    if b[3] < 1:
        b = _over(b, _rgba(under or '#0C0C0E'))
    f = _over(_rgba(fg), b)
    l1, l2 = sorted((_lum(f), _lum(b)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


def value(name, theme):
    for n, light, dark, _ in COLORS:
        if n == name:
            return light if theme == 'light' else dark
    raise KeyError(name)


def report():
    fails = 0
    rows = []
    for theme in THEMES:
        for fg, bg, need, what in PAIRS:
            r = contrast(value(fg, theme), value(bg, theme))
            ok = r >= need
            fails += not ok
            rows.append((theme, fg, bg, r, need, ok, what))
    return rows, fails


def tokens_json():
    return {
        'name': 'Agent V',
        'version': 1,
        'meta': {'source': 'docs/design (stages 2 to 5); values are the agreed screens’ own'},
        'color': {
            'themes': [{'id': 'light', 'name': 'Light'}, {'id': 'dark', 'name': 'Dark'}],
            'tokens': [{'name': n, 'value': {'light': l, 'dark': d}, 'usage': u} for n, l, d, u in COLORS],
        },
        'type': {
            'families': TYPE_FAMILIES,
            'groups': [
                {'name': g, 'family': 'mono' if g == 'Mono' else 'sans',
                 'styles': [{'name': n, 'fontSize': f'{s}px', 'lineHeight': lh, 'fontWeight': w,
                             'letterSpacing': ls, 'usage': u, 'sample': smp}
                            for gg, n, s, lh, w, ls, u, smp in TYPE_STYLES if gg == g]}
                for g in dict.fromkeys(x[0] for x in TYPE_STYLES)
            ],
        },
        'spacing': {'tokens': [{'name': n, 'value': f'{v}px', 'usage': u} for n, v, u in SPACING]},
        'radius': {'tokens': [{'name': n, 'value': v, 'usage': u} for n, v, u in RADII]},
        'size': {'note': 'Fixed sizes that keep touch targets and rhythm consistent.',
                 'tokens': [{'name': n, 'value': v, 'usage': u} for n, v, u in SIZES]},
        'shadow': {'note': 'Only floating things cast a shadow; blocks are flat.',
                   'tokens': [{'name': n, 'value': {'light': l, 'dark': d}, 'usage': u} for n, l, d, u in SHADOWS]},
    }


def css_vars():
    """CSS custom properties for the prototypes: light on <main>, dark under main[data-theme="dark"]."""
    light = ' '.join(f'--{n}: {l};' for n, l, d, _ in COLORS) + ' ' + ' '.join(f'--{n}: {l};' for n, l, d, _ in SHADOWS)
    dark = ' '.join(f'--{n}: {d};' for n, l, d, _ in COLORS if d != l) + ' ' + ' '.join(f'--{n}: {d};' for n, l, d, _ in SHADOWS)
    return f':root,main{{color-scheme:light;{light}}}\nmain[data-theme="dark"]{{color-scheme:dark;{dark}}}'


if __name__ == '__main__':
    if '--json' in sys.argv:
        out = sys.argv[sys.argv.index('--json') + 1]
        with open(out, 'w') as f:
            json.dump(tokens_json(), f, indent=2, ensure_ascii=False)
            f.write('\n')
        print('wrote', out)
    rows, fails = report()
    for theme, fg, bg, r, need, ok, what in rows:
        print(f'{"ok  " if ok else "FAIL"} {theme:5} {fg:15} on {bg:10} {r:5.2f} (needs {need}) {what}')
    print(f'{len(rows)} pairs, {fails} failing')
    sys.exit(1 if fails else 0)
