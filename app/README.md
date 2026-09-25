# Agent V app

The app for Android and iPhone: React Native with Expo SDK 57, in TypeScript (stage 6, D82). No UI
kit: the components are our own, built to the design system's specification (stage 5, D79).

## What is here (slice 0)

| Part | Files | What it does |
|---|---|---|
| The shell | `src/App.tsx`, `index.ts` | Loads the fonts while the splash screen shows, follows the phone's light or dark appearance (D69), keeps the window behind the app the ground colour, and shows a plain message if a screen fails to draw. Screens come with the slices that make them work (stage 7): until slice 1 the app shows only its ground |
| The theme | `src/theme/` | `tokens.ts`, `icons.ts` and `pairs.ts` are **generated** from the design's own source (`docs/design/prototype/tokens.py` and `build.py`) by `tools/theme/generate.py`; never edit them by hand. `theme.tsx` gives every component the current theme; `fonts.ts` registers Geist and Geist Mono (SIL Open Font License) |
| The components | `src/components/` | The 24 components of stage 5 (listed in `index.ts`), plus `Text` (the 17 type styles, tabular numbers), `Tap` (every pressable thing: the focus ring, 44px touch areas) and `Breathing` (motion that stops with Reduce Motion) |

## Rules the components keep

- **Colours only from the theme**, never a hex of their own, except the few fixed values the
  design system itself uses (white on the Needs you block's open button, the translucent whites on
  the dark top).
- **Line heights as the design system's CSS has them** (D132): the type style's line height where
  the design sets one, the font's own (about 1.3 times the size) for single-line labels where it
  doesn't. Checked pixel for pixel against the design system's previews.
- **Every control at least 44 tall to touch**, even when drawn smaller (`Tap`'s `drawnHeight`).
- **A 2px focus ring, 2px away**, in `focus`, on every control reached by keyboard or switch
  access (D77).
- **Screen readers are told the state** with `role` and `aria-*` props (D135), which React Native
  and its web renderer both read: a switch's `aria-checked`, a filter's `aria-selected`, a
  disabled button's `aria-disabled`.
- **Figures are never cut short**: a figure that doesn't fit its column reaches into the space
  beside it, as in the design, rather than ending in "…".
- **Reduce Motion** stops breathing and sliding; states still change (D78).
- **Signing** fills over 0.9 s while held, cancels if let go early, with a light tap as it starts,
  a firm success when it completes and an error pattern if cancelled (stage 6, section 2).

## Checks

From the repository root:

```sh
npm run typecheck                         # includes the app
npm test                                  # includes the contrast check on the app's own theme
python3 tools/theme/generate.py --check   # the generated theme is current
cd app && npx expo export --platform android --platform ios --output-dir /tmp/bundles
```

The contrast check (`src/theme/contrast.test.ts`) computes WCAG 2 contrast from the generated
values, independently of the design tooling, for all 30 text and control pairs in both themes, and
reproduces the published figures in stage 5.

How the components were checked against the design system, and how they behave, is in
[tools/gallery](../tools/gallery/README.md).

## Running it

`npm run android` or `npm run ios` here starts Expo's development server. A development build on a
real phone needs the app's store identity (its package name and bundle id), which is set with the
domain (stage 7, D124).
