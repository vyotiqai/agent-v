# The design prototype

The clickable screens on the design canvas and the Agent V design system are generated from the
files here. Nothing on the canvas's current pages ("New direction", "Stage 4 · States",
"Stage 5 · Dark appearance") is drawn by hand. The earlier, rejected directions on other canvas
pages are kept on the canvas only, as a record.

This is design tooling: it is not part of the app, and nothing here ships.

## What is here

| File | What it does |
|---|---|
| `tokens.py` | Every design token (colour for light and dark, type, space, radius, sizes, shadows) and the contrast check. The one source for everything else |
| `doc_tables.py` | Keeps the token tables in [05-design-system.md](../05-design-system.md) equal to `tokens.py`; `--write` rewrites them after a token changes |
| `build.py` | Shared pieces: the tokens as CSS variables, the icons, the page template, the shared logic (the Undo bar, hide and restore, panels, confirmations, the Theme switch) and `write_all()` |
| `screens.py` … `screens7.py` | The screens, in the batches they were designed in. `screens7.py` loads all of them |
| `hand/` | The two full dark screens kept as templates (Hand something off, Speaking) |
| `appmap/project/canvas.json` | The canvas: pages, where each screen sits, titles and notes |
| `ds_build.py`, `ds-src/` | The design system: its brand book, component styles, components, previews and cover |
| `ds_index.py`, `ds-assets.json` | The design system's index, with the ids of the uploaded icons and logos |
| `audit.py`, `play.js`, `e2e.js`, `contrast-audit.js`, `shoot-all.js`, `diff.js`, `ds-check.js`, `cover-check.js` | The checks (below) |
| `check.sh` | Builds everything and runs every check |

## Build

```sh
python3 screens7.py   # every screen, light and dark, into appmap/project/
python3 ds_build.py   # the design system's files, into ds/project/
python3 ds_index.py   # its index (after any new icon or logo is uploaded and added to ds-assets.json)
python3 doc_tables.py --write   # the token tables in 05-design-system.md, after a token changes
```

Each screen is written twice: `NToday.dc.html` (light) and `NTodayDark.dc.html` (dark). The dark
copy is the same file with the theme set to dark and its links pointing at the other dark copies,
so a whole flow stays dark. Every screen also has a Theme switch in the canvas's Tweaks panel.

## Check

```sh
NODE_PATH=$(npm root -g) ./check.sh
```

It needs Python 3, Node with Playwright, and the canvas's own runtime saved as
`runtime/artifact-type/dc-runtime.js` (read it from the canvas artifact at the path
`artifact-type/dc-runtime.js`; it is the canvas's file, so it is not kept in git). The checks:

| Check | What it proves |
|---|---|
| `tokens.py` | Every text and control pair meets its WCAG 2.2 AA minimum in both themes |
| `doc_tables.py` | The stage 5 document's colour, contrast, type, spacing, radius and size tables are exactly what `tokens.py` holds |
| `audit.py` | Every link on the live canvas pages goes to a screen that exists |
| `e2e.js --links` | With the canvas's real runtime, in a browser: every screen boots with no errors; every button has an action or is disabled on purpose; every link is clicked and lands on its screen (in the same theme); and every in-place action (Undo, Restore, Connect, Rename, Replay, filters, forms…) is exercised and its result checked |
| `contrast-audit.js` | Every piece of visible text on every screen, as rendered, against the real background behind it, meets WCAG 2 AA |
| `ds-check.js` | Every design-system component preview renders, with no errors, in both themes |

To prove a change leaves screens untouched, screenshot before and after and compare pixel by pixel:

```sh
node shoot-all.js out/before && <change> && python3 screens7.py && node shoot-all.js out/after && node diff.js out/before out/after
```

## Publish

The canvas and the design system are published with the Artifact tool:

- Canvas: publish `appmap/project/canvas.json` with the changed `.dc.html` files. Read the live
  `canvas.json` first and merge, since people can move things on the canvas.
- Design system: upload new icons or logos as assets first, then publish the files under
  `ds/project/`, with the index `design-system.json` last. When revising, keep the live index's
  `createdOnFiles`.
