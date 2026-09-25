# Stage 5 — Design system

**Status:** agreed on 2026-09-25.
**Builds on:** stages [1](01-foundations.md) to [4](04-screens.md); the look agreed in D34 and D35.

The design system is everything the screens are made of, written down once: colour for the light
and the dark appearance, type, space, shape, icons, motion, accessibility and the components.

It lives in three places, all built from one source ([`prototype/tokens.py`](prototype/tokens.py)),
so they can't drift apart:

| Where | What it is |
|---|---|
| This document | The decisions, the full token tables and the accessibility report |
| The design system, [Agent V](https://claude.ai/artifact/FChntSLLLZ22gc6gDJuqED) | A browsable reference: the brand book, every token in both themes, 24 components with guidelines and live previews, the icons and the V mark. It is also installed in the design canvas, so the canvas's colour and text-style pickers offer Agent V's tokens |
| The design canvas, page "Stage 5 · Dark appearance" | Every screen again in the dark appearance, generated from the same source as the light screens, fully clickable |

Both links are private until shared from their Share menu.

---

## 1. How colour works

Every colour is a **token** named for its role (`surface`, `ink`, `action`), never for its hue, and
each token has a light and a dark value. Screens use only tokens, so a screen follows the theme by
itself (D71). Colour still carries one meaning each (D27, D35):

- `blue`: needs you, and the agent itself. As text or an icon on a surface: `blue-text`.
- `red`: can't be undone, and nothing else. As text: `red-text`.
- `green`: a working connection, and nothing else. As text: `green-text`.

### Every colour token

| Token | Light | Dark | Use |
|---|---|---|---|
| `ground` | `#EFEFEC` | `#0B0B0D` | The page ground under the blocks on main screens (Today, Jobs, settings). |
| `surface` | `#FFFFFF` | `#19191C` | Blocks, rows, sheets and cards on `ground`. |
| `surface-2` | `#F0F0ED` | `#26262B` | Round marks, small buttons, chips and the tinted row inside a block, on `surface`. |
| `line` | `#E7E7E3` | `#2C2C31` | Hairlines between rows inside a block, and input borders. |
| `line-strong` | `#D4D4CF` | `#3A3A40` | The border of a secondary button, and a switch’s track when off. |
| `control-off` | `#8A8A90` | `#8E8E95` | The ring of a switch that is off, and other control edges that must be seen (3:1 on `surface`). |
| `skeleton` | `#E9E9E5` | `#26262B` | Grey shapes while a screen loads for the first time (D55). |
| `disabled` | `#DCDCD7` | `#2C2C31` | A button that can’t be used right now (signing while offline, Send with nothing written). Its label is `ink-muted`. |
| `ink` | `#111113` | `#F2F2F0` | Primary text and icons on `ground`, `surface` and `surface-2`; also the fill of progress bars and done marks. |
| `ink-muted` | `#6B6B70` | `#9A9AA0` | Secondary text: row details, labels, captions, on `ground`, `surface` and `surface-2`. |
| `on-ink` | `#FFFFFF` | `#111113` | Text and icons on an `ink` fill (a done mark, a Connect button). |
| `action` | `#0C0C0E` | `#F2F2F0` | The one main button on a light screen (Start, Continue, Answer). |
| `on-action` | `#F5F5F4` | `#0C0C0E` | The label of the main button, on `action`. |
| `bar` | `#0C0C0E` | `#26262B` | The hand-off line floating at the bottom of main screens. |
| `on-bar` | `#F5F5F4` | `#F5F5F4` | Text and icons on `bar`. |
| `on-bar-muted` | `#8A8A90` | `#9A9AA0` | The hand-off line’s placeholder, on `bar`. |
| `night` | `#0C0C0E` | `#141417` | The dark top of every main screen, and the ground of full dark screens (speaking, handing off, the live browser). |
| `night-2` | `#17171A` | `#202025` | Dark tiles and panels: the watch tile on Today, the hand-off form, the command list. |
| `night-3` | `#2A2A30` | `#2E2E35` | Your initial and other avatars on `night`. |
| `glass` | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.08)` | Round buttons, chips and tabs on `night`. |
| `on-night` | `#F5F5F4` | `#F5F5F4` | Text and icons on `night`, `night-2` and `glass`. |
| `on-night-muted` | `#8A8A90` | `#8E8E95` | Secondary text on `night` and `night-2`. |
| `on-night-dim` | `#6A6A71` | `#76767D` | The quiet part of Today’s sentence, on `night`. Only at 24px or larger. |
| `glow` | `rgba(51,85,255,0.34)` | `rgba(51,85,255,0.30)` | The soft blue light at the top right of the dark top. Never on controls. |
| `blue` | `#3355FF` | `#3355FF` | Needs you, and the agent itself: the Needs you block, the microphone, the voice orb, where the agent points. Never decoration. |
| `on-blue` | `#FFFFFF` | `#FFFFFF` | Text and icons on a `blue` fill. |
| `on-blue-muted` | `#EDF0FF` | `#EDF0FF` | Secondary text on a `blue` fill. Solid, never white with transparency (that falls under 4.5:1). |
| `blue-deep` | `#2743D9` | `#2743D9` | Chips and small buttons inside a `blue` block, with `on-blue` labels. |
| `blue-text` | `#3355FF` | `#8FA3FF` | Blue as text or an icon on `surface`: “Signature”, “Asks first”, the step that needs you. |
| `blue-on-night` | `#8FA3FF` | `#8FA3FF` | Small blue marks on `night`: the live dot, the Needs you dot, the $ in the command list. |
| `red` | `#C8323A` | `#C8323A` | Can’t be undone: the hold button for it, and Delete. Nothing else is red. |
| `on-red` | `#FFFFFF` | `#FFFFFF` | Text and icons on a `red` fill. |
| `red-text` | `#C8323A` | `#FF7A73` | Red as text or an icon on `surface`: Delete, “Can’t be undone”. |
| `red-on-night` | `#FF7A73` | `#FF7A73` | The can’t-be-undone dot on `night`. |
| `green` | `#1F8A4C` | `#2EA464` | A working connection: the Connected and Working dot, a key that works. Nothing else is green. |
| `green-text` | `#1B7D45` | `#4CC38A` | Green as text on `surface` and `surface-2`: “Connected”, “Working”. Darker than `green` so small text reads (the agreed #1F8A4C was 4.38:1). |
| `on-green` | `#FFFFFF` | `#0B0B0D` | Text and icons on a `green` fill. |
| `scrim` | `rgba(12,12,14,0.55)` | `rgba(0,0,0,0.6)` | Behind a sheet or a preview. |
| `toast` | `#26262B` | `#3A3A41` | The bar that says what just happened, with Undo (D65). |
| `on-toast` | `#F5F5F4` | `#F5F5F4` | Text on `toast`. |
| `focus` | `#3355FF` | `#8FA3FF` | The keyboard focus ring: 2px, 2px away from the control, on every surface. |

### The dark appearance (D72)

- The ground is almost black (`#0B0B0D`). The dark top is lifted a little (`#141417`, with the same
  blue light), so it still reads as the top of the screen. Blocks are `#19191C`.
- Blue, red and green keep their meanings. As fills they stay the same; as words and icons they
  turn lighter (`#8FA3FF`, `#FF7A73`, `#4CC38A`) so they stay readable on dark surfaces.
- The main button turns light on dark (`action` becomes `#F2F2F0`), so it is still the brightest
  thing on the screen.
- Pictures of other things keep their own colours: a website in the live browser, a calendar in a
  replay, the phone's lock screen.
- Appearance follows the phone unless the person picks Light or Dark (D69).

## 2. Accessibility, checked (D73, D74)

The floor is WCAG 2.2 AA, in both themes: 4.5:1 for text; 3:1 for text 24px and larger, for the
edges of controls and for the focus ring. It is checked twice, by script:

1. **Every token pair** that text or a control can sit on (below): `python3 tokens.py`.
2. **Every piece of visible text on every screen, as rendered**, in both themes, against the real
   background behind it: `node contrast-audit.js`. Result: 124 screens, 0 failures.

| Pair | What it is | Needs | Light | Dark |
|---|---|---|---|---|
| `ink` on `ground` | body text on the ground | 4.5:1 | 16.37 | 17.54 |
| `ink` on `surface` | body text in a block | 4.5:1 | 18.86 | 15.65 |
| `ink` on `surface-2` | text on a small button or chip | 4.5:1 | 16.52 | 13.43 |
| `ink-muted` on `ground` | details on the ground | 4.5:1 | 4.60 | 7.03 |
| `ink-muted` on `surface` | row details in a block | 4.5:1 | 5.30 | 6.27 |
| `ink-muted` on `surface-2` | details on a tinted row | 4.5:1 | 4.64 | 5.38 |
| `on-ink` on `ink` | label on an ink fill | 4.5:1 | 18.86 | 16.83 |
| `on-action` on `action` | the main button label | 4.5:1 | 17.91 | 17.43 |
| `on-night` on `night` | text on the dark top | 4.5:1 | 17.91 | 16.85 |
| `on-night` on `night-2` | text on a dark tile | 4.5:1 | 16.40 | 14.87 |
| `on-night-muted` on `night` | details on the dark top | 4.5:1 | 5.69 | 5.65 |
| `on-night-muted` on `night-2` | details on a dark tile | 4.5:1 | 5.21 | 4.98 |
| `on-night-dim` on `night` | the quiet part of Today’s sentence (28px) | 3:1 | 3.64 | 4.08 |
| `on-blue` on `blue` | text on the Needs you block | 4.5:1 | 5.41 | 5.41 |
| `on-blue-muted` on `blue` | secondary text on the Needs you block | 4.5:1 | 4.77 | 4.77 |
| `on-blue` on `blue-deep` | a chip inside the Needs you block | 4.5:1 | 7.26 | 7.26 |
| `on-bar` on `bar` | the hand-off line | 4.5:1 | 17.91 | 13.80 |
| `on-bar-muted` on `bar` | the hand-off line’s placeholder | 4.5:1 | 5.69 | 5.38 |
| `blue-text` on `surface` | blue words in a block | 4.5:1 | 5.41 | 7.39 |
| `blue-on-night` on `night` | blue marks on the dark top | 4.5:1 | 8.24 | 7.75 |
| `on-red` on `red` | the can’t-be-undone button label | 4.5:1 | 5.29 | 5.29 |
| `red-text` on `surface` | red words in a block | 4.5:1 | 5.29 | 6.92 |
| `green-text` on `surface` | Connected, Working | 4.5:1 | 5.16 | 7.92 |
| `green-text` on `surface-2` | Connected on a tinted row | 4.5:1 | 4.52 | 6.80 |
| `on-green` on `green` | the check on a green mark (icon) | 3:1 | 4.38 | 6.19 |
| `on-toast` on `toast` | the Undo bar | 4.5:1 | 13.80 | 10.34 |
| `control-off` on `surface` | the edge of a switch that is off | 3:1 | 3.43 | 5.39 |
| `focus` on `surface` | the focus ring on a block | 3:1 | 5.41 | 7.39 |
| `focus` on `ground` | the focus ring on the ground | 3:1 | 4.69 | 8.29 |
| `ink` on `skeleton` | text never sits on a skeleton; checked so a stray label stays legible | 4.5:1 | 15.49 | 13.43 |

### What the checks found in the agreed screens, and the fixes

| Found | Was | Now |
|---|---|---|
| "Connected" and "Working" in green | `#1F8A4C` on white, 4.38:1 | `green-text` `#1B7D45`, 5.16:1; the green dot keeps `#1F8A4C` |
| Secondary text on the blue Needs you block ("Sends an email as you", "Needs you · 1 of 3") | white at 80–86% opacity, 4.03–4.41:1 | `on-blue-muted` `#EDF0FF`, solid, 4.77:1 |
| The chips inside the blue block ("Seats question") | white on a lighter blue, 4.08:1 | white on `blue-deep` `#2743D9`, 7.26:1 |
| The terms line on Welcome | `#6A6A71` at 12px, 3.64:1 | `on-night-muted`, 5.69:1 |
| A switch that is off | a light grey track with no edge, 1.46:1 | the same track with a 1.5px `control-off` edge, 3.43:1 |
| Blue and red words in the dark appearance | the fill colours, 3.2:1 | `blue-text` and `red-text`, 7.39:1 and 6.92:1 |
| Text fields, menus and radios in the dark appearance | white system controls | follow the theme (`color-scheme`), with token backgrounds |

Other accessibility rules (from stage 2, section 4, and stage 4):

- A visible **focus ring** on every control: 2px `focus`, 2px away from the control (D77).
- **Touch targets** at least 44px (48dp on Android), even when the icon is smaller (`target`).
- **Never colour alone:** blue items say "Needs you", red ones "Can't be undone", switches have an
  edge when off, charts are labelled.
- **Signing without holding:** VoiceOver and TalkBack users double-tap and hold; keyboard and
  switch users hold Enter or Space; a setting replaces holding with a tap and a confirmation.
- **Text size and bold text** follow the phone; rows grow rather than cut; what you sign is never
  cut short (D62).
- **Reduce Motion** stops breathing, pulsing and sliding (D78).

## 3. Type (D75)

One family, **Geist** (400, 500, 600), and **Geist Mono** for commands and file previews, both from
Google Fonts. Numbers are tabular everywhere. 13px is the smallest size for anything people must
read; 12px is only for chart labels and support references.

| Style | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| `figure-xl` | 56px / 1 | 500 | -0.04em | The one large figure of a settings page (the briefing time). |
| `figure-l` | 44px / 1 | 500 | -0.035em | A money figure at the top of a page (this month’s spend, a goal saved). |
| `figure` | 34px / 1 | 500 | -0.03em | The numbers in a dark top’s row of stats. |
| `title-xl` | 34px / 1.12 | 500 | -0.03em | The one question on a full dark screen (What should I take care of?). |
| `title` | 28px / 1.15 | 500 | -0.025em | The page title in the dark top, and Today’s sentence (at 1.2). |
| `title-2` | 24px / 1.2 | 500 | -0.02em | The title inside the Needs you block; a figure on a tile. |
| `title-3` | 20px / 1.25 | 500 | -0.015em | A block’s headline, a sheet’s title, what the agent is doing now. |
| `headline` | 17px / 1.25 | 500 | -0.01em | A tile’s title. |
| `reading` | 18px / 1.55 | 400 | 0 | Content you read or sign in full: an email, a message (D62). |
| `body` | 16px / 1.5 | 400 | 0 | Paragraphs and guides. |
| `button` | 16px / 1.2 | 600 | 0 | Button labels. |
| `row` | 15px / 1.3 | 500 | 0 | A row’s title; menu items at 16. |
| `sub` | 15px / 1.45 | 400 | 0 | The sentence under a page title. |
| `small` | 14px / 1.4 | 500 | 0 | Small buttons, chips, filters. |
| `caption` | 13px / 1.35 | 400 | 0 | Row details, block labels, notes. The smallest size for anything you must read. |
| `micro` | 12px / 1.35 | 400 | 0 | Chart labels and support references only. |
| `code` | 12.5px / 1.7 | 400 | 0 | Commands the agent ran and file previews, in Geist Mono. |

## 4. Space, shape and depth (D76)

| Spacing | px | Use |
|---|---|---|
| `space-2` | 2 | Between a title and its detail. |
| `space-4` | 4 | Between progress segments; tight stacks. |
| `space-6` | 6 | Between chips and tabs. |
| `space-8` | 8 | Between blocks on a screen, and between buttons. |
| `space-10` | 10 | Inside a status chip; between a label and its field. |
| `space-12` | 12 | Screen edge to blocks; a row’s mark to its text. |
| `space-14` | 14 | Between the parts of a card. |
| `space-16` | 16 | Screen edge to bottom buttons. |
| `space-18` | 18 | Inside a block, left and right. |
| `space-20` | 20 | Inside the Needs you block. |
| `space-24` | 24 | Screen edge to text in the dark top. |
| `space-28` | 28 | Bottom actions and the hand-off line above the bottom edge. |
| `space-58` | 58 | The dark top’s content below the phone’s status bar. |

| Radius | Value | Use |
|---|---|---|
| `radius-pill` | 999px | Buttons, chips, tabs, round buttons, the hand-off line. |
| `radius-sheet` | 32px | Sheets, and the dark top’s bottom corners. |
| `radius-block` | 28px | Blocks and tiles. |
| `radius-card` | 24px | Choice cards, question answers, confirmation cards. |
| `radius-row` | 22px | A single rounded row on its own (an idea, a waiting hand-off). |
| `radius-inset` | 18px | The Undo bar and inline confirmations. |
| `radius-small` | 16px | A tinted row inside a block; a file preview table. |
| `radius-field` | 14px | Text fields. |
| `radius-mark` | 13px | The V mark. |
| `radius-bar` | 2px | Progress segments. |

| Size | Value | Use |
|---|---|---|
| `target` | 44px | The smallest touch target, everywhere (48dp on Android). |
| `button` | 56px | Main buttons. |
| `hold` | 60px | Hold-to-sign buttons. |
| `row` | 62px | List rows in blocks (56px in settings, 52px on You). |
| `mark` | 36px | Round icon marks at the start of a row. |
| `icon` | 20px | Icons in buttons and marks (18px in marks, 15px in chips). |

Depth: blocks are flat. Only things that float cast a shadow: the hand-off line (`shadow-bar`), the
Undo bar (`shadow-toast`), a menu over a dark screen (`shadow-menu`) and a switch's knob
(`shadow-knob`).

## 5. Icons and the mark

- One stroke set: a 24-unit grid, 1.75 stroke, round caps and joins, drawn in `currentColor`;
  49 icons, all in the design system's Icons group. Sizes: 20 in buttons, 18 in marks, 15 in chips.
- Icons that mean something are paired with words or carry a label for screen readers.
- The V mark (a V in `night` on an `on-night` square, radius 13 of 40, and its reverse) is the only
  logo. There is no wordmark; the name is set in Geist.

## 6. Motion (D78)

| What | How |
|---|---|
| Something happening now (a working job, the current step, listening) | Breathes: opacity 1 to 0.3 and back over 1.6 s |
| Holding to sign | Fills over 0.9 s; releasing early cancels |
| The Undo bar | Stays 5 s |
| A switch | Slides in 160 ms |
| Replay | Steps every 2.2 s while playing |
| Reduce Motion on | Nothing breathes, pulses or slides; states still change |

## 7. Components (D79)

24 components, each with guidelines (when to use it, what it needs, do's and don'ts) and a live
preview in both themes, in the design system:

| Group | Components |
|---|---|
| Foundations | Icon |
| Screen | DarkTop, StatusChip, IconButton, Stats, AskBar |
| Actions | Button, HoldButton, Switch, ChoiceCard, Filters, Confirm, Sheet |
| Content | Block, Row, Mark, NeedsYou, Tile, Steps (with Meter), StepChart |
| States | UndoBar, Skeleton, Empty, Problem |

They are written for the web (React), to review and build designs with. The app's own components
are built in the framework chosen in stage 6, to this same specification and these same tokens.

## 8. The prototype's source and checks (D80)

The screens on the canvas are generated, not drawn by hand, from
[`docs/design/prototype`](prototype/README.md): the tokens, the screens, the design system and the
checks. `./check.sh` builds everything and runs every check, including that the token tables in this
document equal `tokens.py`; the README there says how.

---

## Decisions in this stage

| ID | Decision | Why |
|---|---|---|
| D71 | One set of design tokens, named by role, each with a light and a dark value, is the single source for the design system, the prototypes and (from stage 6) the app | One change reaches every screen; the dark appearance comes from the same source instead of a repaint |
| D72 | The dark appearance: an almost black ground, the dark top lifted a little, blocks one step lighter; blue, red and green keep their meanings and turn lighter as words; the main button turns light | Dark that keeps the structure and the meanings of light, and stays readable |
| D73 | Accessibility floor: WCAG 2.2 AA for every text and control in both themes, checked by script on the tokens and on every rendered screen | Checked, not assumed; it caught real failures |
| D74 | Fix what the checks found in agreed screens: darker green text, solid secondary text and deeper chips on blue, the Welcome terms line, an edge on switches that are off, lighter blue and red words in dark | Small visual changes that make agreed screens pass; nothing else about them changes |
| D75 | Type: Geist 400/500/600 and Geist Mono, 17 named styles, tabular numbers, 13px the smallest readable size | Matches the agreed screens exactly; one family keeps it calm |
| D76 | Space and shape: named spacing steps, ten radii, flat blocks, shadows only on floating things, 44px touch targets | Matches the agreed screens; depth only where something floats |
| D77 | A 2px focus ring, 2px away, in `focus`, on every control | Keyboard and switch access must always show where you are |
| D78 | Motion is quiet and means something (breathing for now, the hold fill, the Undo bar's 5 s); Reduce Motion stops all of it | Motion as information, never decoration |
| D79 | 24 components, each with guidelines and a live preview; the web versions are for design, the app's are built to the same spec in stage 6 | One vocabulary for designing and building |
| D80 | The prototype's source and checks are kept in `docs/design/prototype` with one check script; generated screens are not kept in git | Anyone can rebuild the canvas and re-run every check |

## Open questions for later stages

| Question | Answered in |
|---|---|
| The app framework, and how tokens reach it (a generated theme file per platform) | Stage 6 |
| Haptics on signing and on the hold completing, per platform | Stage 6 |
| A high-contrast theme, if testing with users shows a need | Stage 7 or later |
