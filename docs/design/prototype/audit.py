"""Audits the prototype: every link resolves to a board on the live pages; lists dead-looking affordances."""
import json, re, os, sys
c = json.load(open('appmap/project/canvas.json'))
boards = {k for k, v in c['boards'].items() if v.get('page') in ('clean', 'states', 'dark')}
bad = 0
for f in sorted(boards):
    h = open(os.path.join('appmap/project', f)).read()
    body = h[h.index('<main'):h.index('</main>')]
    for href in re.findall(r'<a href="([^"]*)"', body):
        if href not in boards:
            print(f'{f}: link to {href!r} is not a board'); bad += 1
    # a chevron inside a non-link row looks tappable but goes nowhere
    for m in re.finditer(r'<div style="[^"]*min-height: \d+px[^"]*">(?:(?!</div>).)*?m9 6 6 6-6 6', body, re.S):
        t = re.findall(r'font-weight: 500[^>]*>([^<]+)<', m.group(0))
        print(f'{f}: row with a chevron but no link: {t[:1]}'); bad += 1
    for b in re.findall(r'<button type="button"(?![^>]*(?:on(?:Click|PointerDown|Change)|disabled))[^>]*>(.*?)</button>', body, re.S):
        label = re.sub(r'<[^>]+>', '', b).strip() or re.search(r'aria-label="([^"]+)"', b) and 'icon'
        print(f'{f}: button with no action: {label!r}')
print('problems:', bad)
