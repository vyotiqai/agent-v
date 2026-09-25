"""Keeps the token tables in docs/design/05-design-system.md equal to tokens.py.

Run: python3 doc_tables.py          -> exits 1 if any table in the document differs from tokens.py
     python3 doc_tables.py --write  -> rewrites those tables from tokens.py

Each table is found by its header row and runs to the next blank line.
"""
import os
import sys

import tokens as T

DOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '05-design-system.md')


def _num(x):
    return f'{x:g}'


def tables():
    colors = ['| Token | Light | Dark | Use |', '|---|---|---|---|']
    colors += [f'| `{n}` | `{l}` | `{d}` | {u} |' for n, l, d, u in T.COLORS]

    rows = {(th, fg, bg): r for th, fg, bg, r, *_ in T.report()[0]}
    contrast = ['| Pair | What it is | Needs | Light | Dark |', '|---|---|---|---|---|']
    contrast += [f'| `{fg}` on `{bg}` | {what} | {_num(need)}:1 | '
                 f'{rows["light", fg, bg]:.2f} | {rows["dark", fg, bg]:.2f} |'
                 for fg, bg, need, what in T.PAIRS]

    type_ = ['| Style | Size / line height | Weight | Tracking | Use |', '|---|---|---|---|---|']
    type_ += [f'| `{n}` | {s}px / {_num(lh)} | {w} | {ls} | {u} |'
              for _, n, s, lh, w, ls, u, _ in T.TYPE_STYLES]

    spacing = ['| Spacing | px | Use |', '|---|---|---|']
    spacing += [f'| `{n}` | {v} | {u} |' for n, v, u in T.SPACING]
    radii = ['| Radius | Value | Use |', '|---|---|---|']
    radii += [f'| `{n}` | {v} | {u} |' for n, v, u in T.RADII]
    sizes = ['| Size | Value | Use |', '|---|---|---|']
    sizes += [f'| `{n}` | {v} | {u} |' for n, v, u in T.SIZES]
    return [colors, contrast, type_, spacing, radii, sizes]


def sync(write):
    lines = open(DOC, encoding='utf-8').read().split('\n')
    stale = []
    for table in tables():
        head = table[0]
        if lines.count(head) != 1:
            sys.exit(f'05-design-system.md: expected one table headed {head!r}, found {lines.count(head)}')
        start = lines.index(head)
        end = start
        while end < len(lines) and lines[end].startswith('|'):
            end += 1
        if lines[start:end] != table:
            stale.append(head)
            lines[start:end] = table
    if write:
        open(DOC, 'w', encoding='utf-8').write('\n'.join(lines))
    return stale


if __name__ == '__main__':
    write = '--write' in sys.argv
    stale = sync(write)
    for head in stale:
        print(('rewrote: ' if write else 'differs from tokens.py: ') + head)
    if stale and not write:
        sys.exit('05-design-system.md is out of date: run python3 doc_tables.py --write')
    print('05-design-system.md tables match tokens.py' if not stale or write else '')
