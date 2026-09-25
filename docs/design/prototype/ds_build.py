"""Builds the Agent V design system (the Design System artifact's files) from the same sources as the
prototypes: tokens.py for every value, build.ICONS for the icons, ds-src/ for the components.

Run: python3 ds_build.py   -> writes ds/project/** (the index design-system.json is written by ds_index.py, last)
"""
import json
import os
import shutil

import tokens as T
from build import ICONS

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'ds', 'project')


def write(rel, text):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(text)


# ---------------------------------------------------------------- components: guidelines and live previews

def preview(group, height, body_js, title):
    return f'''<!-- @dsCard group="{group}" height={height} -->
<!doctype html>
<html>
<head><meta charset="utf-8"><title>{title} — preview</title></head>
<body style="margin: 0">
<div id="root"></div>
<script>
  var A = window.AgentV, h = React.createElement;
  ReactDOM.createRoot(document.getElementById('root')).render({body_js});
</script>
</body>
</html>
'''


STAGE = "h('div', {className: 'av av-stage'}, "
NIGHT = "h('div', {className: 'av av-stage-night'}, "

COMPONENTS = [
    ('Icon', 'Foundations', 88,
     f"""{STAGE}h('div', {{className: 'av-row-of', style: {{gap: '14px'}}}}, {', '.join(f"h(A.Icon, {{name: '{n}', label: '{n}'}})" for n in ['pen', 'question', 'alert', 'eye', 'globe', 'mail', 'calendar', 'clock', 'check', 'hand', 'face', 'lock', 'key', 'mic', 'search', 'grid', 'sheet', 'terminal'])}))""",
     """One stroke icon from Agent V's set: 24-unit grid, 1.75 stroke, round caps and joins, drawn in `currentColor`.

Provide `name` (see the Icons asset group) and, when the icon stands alone and means something, a `label`; otherwise it is hidden from screen readers. Sizes: 20 in buttons, 18 in marks, 15 in chips.

- Do pair an icon with words when it carries meaning (a status, a warning).
- Don't use emoji, filled icons or a second icon style."""),
    ('DarkTop', 'Screen', 250,
     f"""{STAGE.replace("av-stage'", "av-stage', style: {padding: 0, background: 'var(--ground)'}")}h(A.DarkTop, {{
        leading: h(A.IconButton, {{icon: 'back', label: 'Back'}}),
        chip: h(A.StatusChip, {{live: true}}, 'Working'),
        trailing: h(A.IconButton, {{icon: 'more', label: 'Job options'}}),
        title: 'Compare CRM tools', sub: 'Step 3 of 5, reading reviews.'}}))""",
     """The dark top of every main screen: what matters, in white on `night`, with the soft blue light at the top right.

Provide `leading` (Back or Close), an optional `chip`, `trailing` (a round button or nothing), `title` (up to 2 lines), `sub` and any children such as `Stats` or `Filters`. It sits flush with the top of the screen, 58px of room for the phone's status bar, and ends in 32px rounded corners over `ground`.

- Do keep one title, one sentence and at most one row of numbers or filters.
- Don't put buttons that act (sign, delete) in the dark top; they belong at the bottom of the screen."""),
    ('StatusChip', 'Screen', 160,
     f"""{NIGHT}h('div', {{className: 'av-row-of'}}, h(A.StatusChip, null, 'On duty'), h(A.StatusChip, {{live: true}}, 'Working'), h(A.StatusChip, {{tone: 'needs'}}, 'Needs you · 1 of 3'), h(A.StatusChip, {{tone: 'undone'}}, 'Can’t be undone'), h(A.StatusChip, {{icon: 'offline'}}, 'Offline')))""",
     """A short status on the dark top: what state the screen or job is in.

Provide the words and a `tone`: `working` (white dot; `live` makes it breathe), `needs` (blue: something needs you), `undone` (red: can't be undone), `quiet`; or an `icon` instead of a dot (Offline, Replay).

- Do use one chip per screen, in the centre of the top bar.
- Don't use a colour for anything but its meaning: blue needs you, red can't be undone."""),
    ('IconButton', 'Screen', 100,
     f"""{STAGE}h('div', {{className: 'av-row-of'}}, h('span', {{style: {{background: 'var(--night)', padding: '8px', borderRadius: '999px', display: 'flex', gap: '8px'}}}}, h(A.IconButton, {{icon: 'back', label: 'Back'}}), h(A.IconButton, {{icon: 'search', label: 'Search'}})), h(A.IconButton, {{icon: 'share', label: 'Share', tone: 'surface'}}), h(A.IconButton, {{icon: 'mic', label: 'Speak', tone: 'blue'}})))""",
     """A round 44px button with one icon: Back, Close, Search, More, Share, Speak.

Provide `icon`, `label` (always: it is the button's name for screen readers), `tone` (`night` on the dark top, `surface` on a light area, `blue` only for the microphone) and `href` or `onClick`.

- Do keep 44px even when the icon is small.
- Don't use it for the main action of a screen; that is a `Button`."""),
    ('Stats', 'Screen', 120,
     f"""{NIGHT}h(A.Stats, {{items: [{{value: '3/5', label: 'steps done'}}, {{value: '4', label: 'fit the budget'}}, {{value: '$0.09', label: 'AI cost so far'}}]}}))""",
     """Up to three numbers in the dark top, each with a short label: the glance before the detail.

Provide `items`: `{ value, label }`. Values are short (34px figures): `3/5`, `₹84k`, `$0.09`.

- Do lead with the number people care about.
- Don't use more than three; don't shrink the size to fit a long value, shorten it (`₹1.3k`)."""),
    ('AskBar', 'Screen', 100,
     f"""{STAGE}h(A.AskBar, {{placeholder: 'Hand something off…'}}))""",
     """The floating line at the bottom of main screens: hand something off by typing, attaching or speaking.

Provide the `placeholder` for the screen ("Hand something off…" on Today and Jobs, "Ask about this, or change it…" on a job) and the three handlers. It floats 28px above the bottom edge, 12px from the sides, over the content.

- Do show it on every main screen, so handing off is always one tap away.
- Don't show it on pages that interrupt (Needs you items, setup steps)."""),
    ('Button', 'Actions', 160,
     f"""{STAGE}h('div', {{className: 'av-row-of'}}, h(A.Button, {{variant: 'secondary'}}, 'Change'), h(A.Button, {{grow: true, trailing: 'arrow'}}, 'Start')), h('div', {{className: 'av-row-of'}}, h(A.Button, {{variant: 'small'}}, 'Try again'), h(A.Button, {{disabled: true}}, 'Signing needs a connection')))""",
     """Buttons for everything but signing: the one main action (`primary`), its alternative (`secondary`), small actions inside blocks (`small`) and `danger` for Delete.

Provide the words (a verb that says exactly what happens: Start, Answer, Raise the limit), `variant`, `href` or `onClick`, and `disabled` with the reason nearby when it can't be used now.

- Do have at most one `primary` per screen, full width at the bottom, 16px from the sides.
- Don't use `primary` to approve something the agent will do as you; that is a `HoldButton`."""),
    ('HoldButton', 'Actions', 168,
     f"""{STAGE}h(A.HoldButton, {{tone: 'blue', done: h('div', {{className: 'av-signed'}}, h(A.Mark, {{icon: 'check', tone: 'blue'}}), 'Signed and sent')}}, 'Hold to sign and send'), h(A.HoldButton, {{tone: 'red', faceId: true}}, 'Hold, then confirm with Face ID'))""",
     """Signing: press and hold for under a second to approve what the agent will do as you (D25). It fills while held and cancels if released early.

Provide the words, `tone` (`blue` to act as you; `red` only for what can't be undone, with `faceId`), `onSigned`, and optionally `done` to show in its place once signed. Enter or Space held works the same; screen reader users double-tap and hold; a setting can replace holding with a tap and a confirmation (app map, section 4).

- Do show the full content being signed above it (D62).
- Don't use it for settings or anything the agent won't do in the world."""),
    ('Switch', 'Actions', 80,
     f"""{STAGE}h('div', {{className: 'av-row-of', style: {{gap: '16px'}}}}, h(A.Switch, {{label: 'On', defaultChecked: true}}), h(A.Switch, {{label: 'Off'}})))""",
     """An on/off setting that applies at once, with no Save.

Provide `label` (read by screen readers; the row beside it shows it too), `checked` or `defaultChecked`, and `onChange`. Off has a visible edge (`control-off`, 3:1) so its state never depends on colour alone.

- Do use it for settings, never to approve an action."""),
    ('ChoiceCard', 'Actions', 180,
     f"""{STAGE}h(A.ChoiceCard, {{name: 'limit', checked: true, title: 'Raise by $10', detail: 'For the rest of September'}}), h(A.ChoiceCard, {{name: 'limit', title: 'Raise by $20', detail: 'For the rest of September'}}))""",
     """One choice among a few, as a card with a radio: a model, a provider, a tone, a new limit.

Provide `name` (shared by the group), `title`, optional `detail` and `lead` (a figure or a mark), `checked` and `onChange`. The chosen card has a 2px `ink` edge.

- Do keep to two to four cards; more belongs in a list.
- Don't hide what a choice means; say it in `detail`."""),
    ('Filters', 'Actions', 72,
     f"""{NIGHT}h(A.Filters, {{label: 'Filters', options: ['All', 'Jobs', 'Files', 'Remembered']}}))""",
     """A row of pills on the dark top that narrows what's below: search filters, the Jobs tabs.

Provide `options` and `value` or `defaultValue`, `onChange` and a group `label`. The chosen one is light on dark.

- Do keep labels to one word.
- Don't use it for actions."""),
    ('Confirm', 'Actions', 180,
     f"""{STAGE}h('div', {{className: 'av-block', style: {{padding: '16px 18px'}}}}, h(A.Confirm, {{title: 'Disconnect Gmail?', detail: 'The morning briefing and 1 other job use it and will pause.', confirmLabel: 'Disconnect'}})))""",
     """A question asked in place, for things that are hard to undo but not a signature: disconnect, sign out, stop, delete a job.

Provide `title` (the question: "Disconnect Gmail?"), `detail` (what happens next), `confirmLabel` (the verb again), `danger` for deleting, and both handlers.

- Do say exactly what will pause or be lost.
- Don't use it for small reversible things; they happen at once with Undo (D65)."""),
    ('Sheet', 'Actions', 430,
     f"""{STAGE}h(A.Sheet, {{title: 'Compare CRM tools', onClose: function () {{}}, items: [{{icon: 'clock', label: 'Pause'}}, {{icon: 'repeat', label: 'Repeat…'}}, {{icon: 'edit', label: 'Rename'}}, {{icon: 'archive', label: 'Archive'}}, {{icon: 'trash', label: 'Delete', danger: true}}]}}))""",
     """A menu that rises from the bottom over a `scrim`: a job's or a goal's options, a file preview.

Provide `title` (what it is about), `items` (`{ icon, label, onClick, danger }`) or children, and `onClose`. Only what applies is listed.

- Do keep Delete last, in `red-text`.
- Don't put more than eight items in one sheet."""),
    ('Block', 'Content', 200,
     f"""{STAGE}h(A.Block, {{label: 'Working'}}, h(A.Row, {{icon: 'globe', title: 'Compare CRM tools', detail: 'Step 3 of 5 · 1 follow-up queued', href: '#'}}), h(A.Row, {{icon: 'sheet', title: 'Clean up the Q3 numbers', detail: 'On the computer · step 2 of 4', href: '#'}})))""",
     """A large rounded `surface` block on `ground` that groups related rows under a short label.

Provide `label` (a plain word: Needs you, Working, Repeating) and the rows. Blocks are 12px from the screen edges with 8px between them; they are flat, with no shadow.

- Do use a few big blocks rather than many small cards."""),
    ('Row', 'Content', 240,
     f"""{STAGE}h(A.Block, null, h(A.Row, {{icon: 'pen', markTone: 'blue', title: 'Reply to Sam about Friday', detail: 'Signature', detailTone: 'blue', href: '#'}}), h(A.Row, {{icon: 'trash', markTone: 'blue', title: 'Unsubscribe from 9 newsletters', detail: 'Can’t be undone', detailTone: 'red', href: '#'}}), h(A.Row, {{icon: 'memory', title: 'Maya prefers morning calls', detail: 'From 3 emails', trailing: h(A.Button, {{variant: 'small'}}, 'Forget')}})))""",
     """One line in a block: a mark, a title, one line of detail, and a chevron or a small button.

Provide `icon` (or `lead`), `title` (one line), `detail` (one line; `detailTone` `blue`, `red` or `green` only for those meanings), and `href`/`onClick` or `trailing`. Rows are at least 62px tall (56 in settings) and grow with larger text.

- Do keep the whole row tappable when it opens something.
- Don't put two actions in one row."""),
    ('Mark', 'Content', 72,
     f"""{STAGE}h('div', {{className: 'av-row-of'}}, h(A.Mark, {{icon: 'globe'}}), h(A.Mark, {{icon: 'pen', tone: 'blue'}}), h(A.Mark, {{icon: 'check', tone: 'ink'}}), h(A.Mark, {{icon: 'check', tone: 'green'}})))""",
     """A 36px round mark with one icon, at the start of a row or tile, saying what kind of thing it is.

Provide `icon` and `tone`: default `surface-2`; `blue` for items that need you; `ink` for done; `green` only for a working connection.

- Don't use a mark as a button; the row is the button."""),
    ('NeedsYou', 'Content', 250,
     f"""{STAGE}h(A.NeedsYou, {{count: '1 of 3', title: 'Reply to Sam about Friday', detail: 'Sends an email as you', chips: [{{icon: 'question', label: 'Seats question'}}, {{icon: 'alert', label: '9 newsletters'}}]}}))""",
     """The blue block on Today: the first thing waiting on you, with the others as chips (D26).

Provide `count` ("1 of 3"), `title` (up to 2 lines), `detail` (what it does), `chips` for the next items, and `onOpen`. It is the only large blue area in the app; blue means it needs you.

- Do open items as full pages, in queue order (D51).
- Don't show it when nothing needs you; Today says All clear instead."""),
    ('Tile', 'Content', 190,
     f"""{STAGE}h('div', {{style: {{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px'}}}}, h(A.Tile, {{icon: 'globe', status: 'Working', title: 'Compare CRM tools', href: '#'}}, h('span', {{style: {{display: 'flex', flexDirection: 'column', gap: '8px'}}}}, h('span', {{className: 'av-tile-note'}}, 'Step 3 of 5'), h(A.Steps, {{total: 5, done: 3}}))), h(A.Tile, {{dark: true, icon: 'eye', status: 'Watching', title: 'MacBook Air', href: '#'}}, h('span', null, h('span', {{className: 'av-tile-figure', style: {{display: 'block'}}}}, '₹94,900'), h('span', {{className: 'av-tile-note'}}, 'Alert under ₹90,000')))))""",
     """A square-ish summary of one job on Today: its state, its name and one number or a progress bar.

Provide `icon`, `status`, `title` and the content at the bottom (Steps, or a figure and a note); `dark` for a watch or routine, to tell the two apart at a glance.

- Do show at most two tiles on Today."""),
    ('Steps', 'Content', 104,
     f"""{STAGE}h(A.Block, null, h('div', {{style: {{padding: '12px 0 16px', display: 'flex', flexDirection: 'column', gap: '12px'}}}}, h(A.Steps, {{total: 5, done: 3}}), h(A.Meter, {{value: 41}}))))""",
     """Progress: `Steps` for a job's plan (one segment per step, the current one breathing), `Meter` for an amount (a goal, a limit).

Provide `total` and `done` (Steps, with `live` for the current one) or `value` in percent (Meter). Both carry an accessible label.

- Don't show progress you can't measure; say what's happening instead."""),
    ('StepChart', 'Content', 248,
     f"""{STAGE}h(A.StepChart, {{title: 'Last 30 days', summary: 'Price over the last 30 days, down from ₹99,900 to ₹94,900', points: [99900, 99900, 99900, 98500, 98500, 98500, 97900, 97900, 96900, 96900, 96900, 96900, 94900, 94900, 94900, 94900], min: 88000, max: 101000, alert: 90000, alertLabel: 'Alert under ₹90,000', from: '1 Sep', to: 'Today', width: 320, format: function (v) {{ return '₹' + v.toLocaleString('en-IN'); }}}}))""",
     """A watch's value over time, drawn as steps (a price holds until it changes), with a dashed alert line (D67).

Provide `points`, `min`, `max`, `alert` and `alertLabel`, `format`, the axis ends `from`/`to`, a `title` and a `summary` for screen readers. One series, in `ink`; labels only on the start, the latest value and the alert.

- Do keep it to one series and one alert; touch and hold shows a day's value."""),
    ('UndoBar', 'States', 80,
     f"""{STAGE}h(A.UndoBar, {{onUndo: function () {{}}}}, 'Forgot: Maya prefers morning calls.'))""",
     """The bar that says what just happened, with Undo for 5 seconds, for small reversible actions (D65).

Provide the message (what happened, in the past tense) and `onUndo` when it can be undone. It floats above the bottom actions.

- Do use it after forget, remove, archive, restore.
- Don't use it for errors; those stay in the block that failed (D57)."""),
    ('Skeleton', 'States', 164,
     f"""{STAGE}h(A.Skeleton, {{label: 'Loading your day'}}))""",
     """Grey shapes in the layout of the real content, shown only when nothing is stored on the phone yet and loading takes over 0.3 seconds (D55).

Provide `lines` (`[width, height, isFixedPx]`) that match what will load, and a `label` read once by screen readers.

- Don't use a spinner in the middle of a page."""),
    ('Empty', 'States', 212,
     f"""{STAGE}h(A.Empty, {{icon: 'grid', title: 'No jobs yet', detail: 'What you hand off shows here: what needs you, what’s working and what repeats.'}}))""",
     """What a screen shows the first time, before there is anything in it (D56).

Provide `icon`, `title` and `detail` (what will be here), and a way to start as children or next to it (suggestions to hand off).

- Do always offer something to do.
- Don't use it for all clear; that shows what's coming up instead."""),
    ('Problem', 'States', 180,
     f"""{STAGE}h(A.Problem, {{title: 'Files and memory didn’t load', detail: 'The search took too long. Jobs above are complete.', reference: 'S-4F2A', onRetry: function () {{}}}}))""",
     """An error in place of the block that failed, in plain words, with one action and a support reference (D57).

Provide `title` (what didn't work), `detail` (what is still fine), `onRetry` and `reference`.

- Do keep the rest of the screen working.
- Don't use red, codes or apologies."""),
]

D_TS = '''// Agent V components (window.AgentV). Every component reads its colours from the tokens, so it follows
// [data-theme="light" | "dark"] on any ancestor. React 18 is expected on the page.
import * as React from 'react';

export type IconName = ''' + ' | '.join(f"'{n}'" for n in ICONS) + ''';

export function Icon(p: { name: IconName; size?: number; stroke?: number; label?: string }): React.ReactElement;
export function DarkTop(p: { leading?: React.ReactNode; chip?: React.ReactNode; trailing?: React.ReactNode; title?: string; sub?: string; glow?: boolean; children?: React.ReactNode }): React.ReactElement;
export function StatusChip(p: { tone?: 'working' | 'needs' | 'undone' | 'quiet'; live?: boolean; icon?: IconName; children: React.ReactNode }): React.ReactElement;
export function IconButton(p: { icon: IconName; label: string; tone?: 'night' | 'surface' | 'blue'; href?: string; onClick?: () => void }): React.ReactElement;
export function Button(p: { variant?: 'primary' | 'secondary' | 'small' | 'danger'; grow?: boolean; icon?: IconName; trailing?: IconName; disabled?: boolean; href?: string; onClick?: () => void; children: React.ReactNode }): React.ReactElement;
export function HoldButton(p: { tone?: 'blue' | 'red'; faceId?: boolean; icon?: IconName; duration?: number; onSigned?: () => void; done?: React.ReactNode; children: React.ReactNode }): React.ReactElement;
export function Block(p: { label?: string; children: React.ReactNode }): React.ReactElement;
export function Row(p: { icon?: IconName; markTone?: 'ink' | 'blue' | 'green'; lead?: React.ReactNode; title: React.ReactNode; detail?: React.ReactNode; detailTone?: 'blue' | 'red' | 'green'; trailing?: React.ReactNode; href?: string; onClick?: () => void }): React.ReactElement;
export function Mark(p: { icon: IconName; tone?: 'ink' | 'blue' | 'green'; label?: string }): React.ReactElement;
export function NeedsYou(p: { count?: string; icon?: IconName; title: string; detail?: string; chips?: { icon: IconName; label: string; onClick?: () => void }[]; onOpen?: () => void }): React.ReactElement;
export function Tile(p: { icon: IconName; status: string; title: string; dark?: boolean; href?: string; onClick?: () => void; children?: React.ReactNode }): React.ReactElement;
export function Stats(p: { items: { value: string; label: string }[] }): React.ReactElement;
export function Steps(p: { total: number; done: number; live?: boolean }): React.ReactElement;
export function Meter(p: { value: number }): React.ReactElement;
export function AskBar(p: { placeholder?: string; onOpen?: () => void; onAttach?: () => void; onSpeak?: () => void }): React.ReactElement;
export function Switch(p: { label: string; checked?: boolean; defaultChecked?: boolean; onChange?: (on: boolean) => void }): React.ReactElement;
export function ChoiceCard(p: { name: string; title: string; detail?: string; lead?: React.ReactNode; checked?: boolean; onChange?: () => void }): React.ReactElement;
export function Filters(p: { options: string[]; label: string; value?: number; defaultValue?: number; onChange?: (i: number) => void }): React.ReactElement;
export function Sheet(p: { title?: string; items?: { icon: IconName; label: string; danger?: boolean; onClick?: () => void }[]; onClose?: () => void; children?: React.ReactNode }): React.ReactElement;
export function UndoBar(p: { onUndo?: () => void; children: React.ReactNode }): React.ReactElement;
export function Confirm(p: { title: string; detail?: string; confirmLabel: string; cancelLabel?: string; danger?: boolean; onConfirm?: () => void; onCancel?: () => void }): React.ReactElement;
export function Skeleton(p: { lines?: [number, number, boolean?][]; label?: string }): React.ReactElement;
export function Empty(p: { icon?: IconName; title: string; detail: string; children?: React.ReactNode }): React.ReactElement;
export function Problem(p: { title: string; detail: string; reference?: string; onRetry?: () => void; retryLabel?: string }): React.ReactElement;
export function StepChart(p: { title: string; summary: string; points: number[]; min: number; max: number; alert: number; alertLabel: string; from: string; to: string; format: (v: number) => string; width?: number; height?: number }): React.ReactElement;
'''


def icon_svg(name, ink='#111113'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" '
            f'stroke="{ink}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'
            + ICONS[name].replace('currentColor', ink) + '</svg>\n')


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    write('tokens.json', json.dumps(T.tokens_json(), indent=2, ensure_ascii=False) + '\n')
    with open(os.path.join(ROOT, 'ds-src', 'README.md')) as f:
        write('README.md', f.read())
    with open(os.path.join(ROOT, 'ds-src', 'bundle.src.js')) as f:
        bundle = f.read().replace('__ICONS__', json.dumps(ICONS))
    assert '</script' not in bundle and '<!--' not in bundle
    write('components/bundle.js', bundle)
    with open(os.path.join(ROOT, 'ds-src', 'bundle.css')) as f:
        write('components/bundle.css', f.read())
    write('components/index.d.ts', D_TS)
    with open(os.path.join(ROOT, 'ds-src', 'cover.html')) as f:
        write('components/Cover/preview.html', f.read())
    for name, group, height, js, readme in COMPONENTS:
        write(f'components/{name}/preview.html', preview(group, height, js, name))
        write(f'components/{name}/README.md', f'# {name}\n\n{readme}\n')
    for name in ICONS:
        write(f'assets/Icons/{name}.svg', icon_svg(name))
    write('assets/Icons/README.md', 'Agent V’s stroke icons: a 24-unit grid, 1.75 stroke, round caps and joins. '
          'The files are drawn in `#111113` (`ink`, light theme); in the app, use the `Icon` component, which draws in `currentColor`.\n')
    write('assets/Logos/agent-v-mark.svg',
          '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="13" fill="#F5F5F4"/>'
          '<path d="M15.42 16.33 L20.0 24.58 L24.58 16.33" fill="none" stroke="#0C0C0E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>\n')
    write('assets/Logos/agent-v-mark-dark.svg',
          '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="13" fill="#0C0C0E"/>'
          '<path d="M15.42 16.33 L20.0 24.58 L24.58 16.33" fill="none" stroke="#F5F5F4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>\n')
    write('assets/Logos/README.md', 'The V mark: a V in `night` on an `on-night` rounded square (radius 13 of 40), and the reverse for light grounds. '
          'It is the only logo; there is no wordmark, and the name is set in Geist.\n')
    print('components:', len(COMPONENTS), 'icons:', len(ICONS))


if __name__ == '__main__':
    main()
