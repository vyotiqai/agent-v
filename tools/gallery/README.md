# Component gallery

Design tooling, never part of the app: a web page that draws the app's own components (from
`app/src/components`) the way the design system's previews draw the web ones, so the two can be
compared, and the components' behaviour tested in a real browser (D133). The app's bundle never
includes it: it is a separate package with its own entry point.

`previews.tsx` holds one preview per component, with the same content as the design system's
preview of it (`docs/design/prototype/ds_build.py`). The page shows one at a time:
`?c=Button&theme=dark`.

```sh
npm run build -w tools/gallery            # the page, into tools/gallery/dist
node tools/gallery/compare.ts <folder>    # compare with the design system (below)
node --test tools/gallery/interact.ts     # behaviour (below)
```

Both need Playwright's Chromium (`npx playwright install chromium`, or `PLAYWRIGHT_BROWSERS_PATH`
where it is already installed).

## Comparing with the design system: `compare.ts`

For each of the 24 components, in light and dark, with Reduce Motion on so nothing is mid-breath,
it photographs the design system's preview and the app's, and counts the pixels that differ: a
pixel differs when nothing within one pixel of it in the other image has the same colour, so
anti-aliasing and half-pixel offsets pass, and anything larger doesn't. A component matches when
at most 0.5% of its pixels differ and its height is within 1px. Each comparison is saved as an
image (design system, app, difference in red) with a report.

It runs locally, like the prototype's own checks, because the design system's previews need the
canvas runtime, which is not kept in git (see `docs/design/prototype/README.md`).

**Result on 2026-09-25:** 48 comparisons (24 components, 2 themes), all match. 22 components are
identical to the pixel in both themes. The two others:

| Component | Differs | Why |
|---|---|---|
| ChoiceCard | 0.07% light, 0.48% dark | The design system's radio is the browser's own control; the app draws its own, a ring and a dot, to the same size and colours |
| StepChart | 0.37% light, 0.32% dark | The chart's figures are set with tabular digits, as all numbers are. On phones `react-native-svg` applies that; its web renderer, used only by this gallery, does not, so the web page draws proportional digits. Not yet confirmed on a phone |

What the comparison found and fixed on the way: every label sat 1px off (the design system's CSS
leaves single-line labels at the font's own line height, D132); the Stats columns were unequal;
"$0.09" was cut to "$0…." in Stats; the status chip sat at the top of the dark top instead of the
middle; the chart's title lacked its 2px margin; the radio was drawn differently. And one fix went
the other way: the design system's Tile preview laid the watch tile's figure and note out
differently from the agreed Today screen, so the preview was corrected (D134).

## Behaviour: `interact.ts`

In the browser, through the same page: holding the sign button for 0.9 s signs; letting go early
signs nothing; holding Space signs the same way; a switch turns on and off and tells screen readers
which; filters choose one option at a time; a control reached by the keyboard shows the 2px focus
ring, 2px away. CI runs it on every change.
