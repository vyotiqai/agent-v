Agent V is a personal AI agent for iPhone and Android: you hand work off, it plans and works around the clock, and it brings you only what needs you. The design is calm and structured, and it is built to be read at a glance: a dark top that says what matters, and a light area of a few large rounded blocks below it.

## The three rules everything follows

1. **Colour carries meaning, and only that.** `blue` means something needs you, and marks the agent itself (the microphone, the voice orb, where it points in the live browser). `red` means it can't be undone, and nothing else is red. `green` means a connection works, and nothing else is green. Everything else is ink, greys and white.
2. **One main action per screen.** It sits at the bottom, full width, 16px from the sides: a `Button` (`action` on light screens), or a `HoldButton` when you are approving something the agent will do as you.
3. **Glance first.** Every main screen opens with its dark top: the page in one sentence or title, and at most three numbers (`Stats`). Detail comes below, in blocks.

## Screens

- Main screens (Today, Jobs, a job, settings) are a `DarkTop` on `night`, then blocks on `ground`. Blocks (`Block`, `Tile`, `NeedsYou`) are 12px from the screen edges with 8px between them.
- Pages that interrupt (a signature, a question, can't be undone) use the same dark top with Close, the item in full below, and the decision at the bottom.
- Speaking, handing off, the live browser and signing in are full dark screens on `night`, with the soft blue light of `glow`.
- The hand-off line (`AskBar`) floats at the bottom of every main screen.

## Colour

Use the tokens, never raw values; each token has a light and a dark value, so a screen follows the theme by itself.

- Grounds: `ground` under the blocks, `surface` for blocks and sheets, `surface-2` for marks, chips and small buttons. `line` separates rows; `line-strong` edges secondary buttons.
- Text: `ink` for primary text, `ink-muted` for details, on `ground`, `surface` and `surface-2`. On `night`: `on-night`, `on-night-muted`, and `on-night-dim` only for the quiet part of Today's sentence (28px).
- Fills with their text: `action`/`on-action` (the main button), `ink`/`on-ink` (done marks, Connect), `blue`/`on-blue`/`on-blue-muted` (the Needs you block; chips in it use `blue-deep`), `red`/`on-red`, `green`/`on-green`, `bar`/`on-bar`, `toast`/`on-toast`.
- Blue, red and green as words or icons on a surface use `blue-text`, `red-text` and `green-text`: they are lighter in the dark theme so they stay readable.
- Every text pair above is checked at 4.5:1 or better in both themes (3:1 for 24px text, control edges and focus rings).

## Type

One family, Geist (400, 500, 600), and Geist Mono for commands and file previews. Numbers are tabular.

- `title` for page titles and Today's sentence; `title-2` inside the Needs you block; `title-3` for a block's headline; `headline` for tiles.
- `figure`, `figure-l` and `figure-xl` for numbers that are the point of the screen.
- `reading` (18px) for anything you read or sign in full; `body` for paragraphs; `row` and `caption` for rows; `small` for chips and small buttons; `micro` only for chart labels and references.
- Titles take up to 2 lines; row titles and details take 1 line each. With larger text sizes, rows grow; what you sign is never cut short.

## Shape, space and depth

- Corners: `radius-pill` for buttons, chips and the hand-off line; `radius-block` for blocks and tiles; `radius-sheet` for sheets and the dark top's bottom corners; `radius-card` for choice cards.
- Space: `space-12` from screen edges to blocks, `space-24` for text in the dark top, `space-8` between blocks, `space-18` inside blocks, `space-28` from the bottom edge to bottom actions.
- Blocks are flat. Only floating things cast a shadow: the hand-off line (`shadow-bar`), the Undo bar (`shadow-toast`), menus over dark screens (`shadow-menu`).
- Touch targets are at least `target` (44px; 48dp on Android), even when the icon is small.

## Words

Agent V speaks in the first person, calm and brief, like a very good assistant. No exclamation marks, no emoji, no apologies. Sentence case everywhere.

- Name things by what people recognise: "Needs you", "Hand something off", "Take control".
- Buttons say exactly what happens: "Hold to sign and send", "Raise the limit", "Try again".
- Errors say what happened and what is still fine: "Files and memory didn't load. The search took too long. Jobs above are complete."
- Instead of "Task 4f2a failed due to error 503": "The airline's site is down. I'll try again at 6 pm."

## Motion

Motion is quiet and means something.

- `live` breathing (opacity 1 to 0.3 over 1.6 seconds) marks what is happening now: a working job, the current step, listening.
- Holding to sign fills the button over 0.9 seconds and cancels on release.
- The Undo bar stays 5 seconds. Sheets rise from the bottom; switches slide in 160ms.
- With Reduce Motion on, nothing breathes, pulses or slides; states still change.

## Accessibility

- Every text pair meets WCAG 2.2 AA in both themes; the report is in the design documents (stage 5).
- Keyboard focus shows a 2px `focus` ring, 2px away from the control, on every surface.
- Nothing is told by colour alone: blue items say "Needs you", red ones "Can't be undone", switches have an edge when off.
- Signing has alternatives: VoiceOver and TalkBack users double-tap and hold; keyboard and switch users hold Enter or Space; a setting replaces holding with a tap and a confirmation.
- Text follows the phone's size and bold settings; layouts grow rather than cut.

## Icons and the mark

Icons are one stroke set on a 24-unit grid, 1.75 stroke, round caps and joins, drawn in `currentColor` (see the Icons group and the `Icon` component). The V mark is the only logo; there is no wordmark.
