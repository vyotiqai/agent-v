# Tools

Support tools, never part of the app or the server (stage 7, D123).

| Tool | What it does |
|---|---|
| [`theme/generate.py`](theme/generate.py) | Writes the app's theme (`app/src/theme/tokens.ts`, `icons.ts`, `pairs.ts`) from the design's own source, `docs/design/prototype/tokens.py` and `build.py` (D95). `--check` fails when the app's copy is not what the source makes; CI runs it. After changing a token or an icon: `npm run theme` |
| [`gallery/`](gallery/README.md) | Draws the app's components as the design system's previews do, compares the two pixel by pixel, and tests the components' behaviour in a browser |

Later slices add the support lookup (D98) and the release scripts (D115).
