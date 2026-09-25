// Generated from docs/design/prototype/tokens.py by tools/theme/generate.py. Do not edit:
// change tokens.py, then run `npm run theme`.

import type { ColorName } from './tokens.ts';

/** Every text or control colour and what it sits on, with the contrast it needs (D73). */
export const pairs: readonly (readonly [ColorName, ColorName, number, string])[] = [
  ['ink', 'ground', 4.5, 'body text on the ground'],
  ['ink', 'surface', 4.5, 'body text in a block'],
  ['ink', 'surface2', 4.5, 'text on a small button or chip'],
  ['inkMuted', 'ground', 4.5, 'details on the ground'],
  ['inkMuted', 'surface', 4.5, 'row details in a block'],
  ['inkMuted', 'surface2', 4.5, 'details on a tinted row'],
  ['onInk', 'ink', 4.5, 'label on an ink fill'],
  ['onAction', 'action', 4.5, 'the main button label'],
  ['onNight', 'night', 4.5, 'text on the dark top'],
  ['onNight', 'night2', 4.5, 'text on a dark tile'],
  ['onNightMuted', 'night', 4.5, 'details on the dark top'],
  ['onNightMuted', 'night2', 4.5, 'details on a dark tile'],
  ['onNightDim', 'night', 3, 'the quiet part of Today’s sentence (28px)'],
  ['onBlue', 'blue', 4.5, 'text on the Needs you block'],
  ['onBlueMuted', 'blue', 4.5, 'secondary text on the Needs you block'],
  ['onBlue', 'blueDeep', 4.5, 'a chip inside the Needs you block'],
  ['onBar', 'bar', 4.5, 'the hand-off line'],
  ['onBarMuted', 'bar', 4.5, 'the hand-off line’s placeholder'],
  ['blueText', 'surface', 4.5, 'blue words in a block'],
  ['blueOnNight', 'night', 4.5, 'blue marks on the dark top'],
  ['onRed', 'red', 4.5, 'the can’t-be-undone button label'],
  ['redText', 'surface', 4.5, 'red words in a block'],
  ['greenText', 'surface', 4.5, 'Connected, Working'],
  ['greenText', 'surface2', 4.5, 'Connected on a tinted row'],
  ['onGreen', 'green', 3, 'the check on a green mark (icon)'],
  ['onToast', 'toast', 4.5, 'the Undo bar'],
  ['controlOff', 'surface', 3, 'the edge of a switch that is off'],
  ['focus', 'surface', 3, 'the focus ring on a block'],
  ['focus', 'ground', 3, 'the focus ring on the ground'],
  ['ink', 'skeleton', 4.5, 'text never sits on a skeleton; checked so a stray label stays legible'],
];
