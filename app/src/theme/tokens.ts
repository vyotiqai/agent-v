// Generated from docs/design/prototype/tokens.py by tools/theme/generate.py. Do not edit:
// change tokens.py, then run `npm run theme`.

export type ThemeName = 'light' | 'dark';

/** Every colour, by role, in each theme (stage 5, section 1). */
export const colors = {
  light: {
    ground: '#EFEFEC',
    surface: '#FFFFFF',
    surface2: '#F0F0ED',
    line: '#E7E7E3',
    lineStrong: '#D4D4CF',
    controlOff: '#8A8A90',
    skeleton: '#E9E9E5',
    disabled: '#DCDCD7',
    ink: '#111113',
    inkMuted: '#6B6B70',
    onInk: '#FFFFFF',
    action: '#0C0C0E',
    onAction: '#F5F5F4',
    bar: '#0C0C0E',
    onBar: '#F5F5F4',
    onBarMuted: '#8A8A90',
    night: '#0C0C0E',
    night2: '#17171A',
    night3: '#2A2A30',
    glass: 'rgba(255,255,255,0.08)',
    onNight: '#F5F5F4',
    onNightMuted: '#8A8A90',
    onNightDim: '#6A6A71',
    glow: 'rgba(51,85,255,0.34)',
    blue: '#3355FF',
    onBlue: '#FFFFFF',
    onBlueMuted: '#EDF0FF',
    blueDeep: '#2743D9',
    blueText: '#3355FF',
    blueOnNight: '#8FA3FF',
    red: '#C8323A',
    onRed: '#FFFFFF',
    redText: '#C8323A',
    redOnNight: '#FF7A73',
    green: '#1F8A4C',
    greenText: '#1B7D45',
    onGreen: '#FFFFFF',
    scrim: 'rgba(12,12,14,0.55)',
    toast: '#26262B',
    onToast: '#F5F5F4',
    focus: '#3355FF',
  },
  dark: {
    ground: '#0B0B0D',
    surface: '#19191C',
    surface2: '#26262B',
    line: '#2C2C31',
    lineStrong: '#3A3A40',
    controlOff: '#8E8E95',
    skeleton: '#26262B',
    disabled: '#2C2C31',
    ink: '#F2F2F0',
    inkMuted: '#9A9AA0',
    onInk: '#111113',
    action: '#F2F2F0',
    onAction: '#0C0C0E',
    bar: '#26262B',
    onBar: '#F5F5F4',
    onBarMuted: '#9A9AA0',
    night: '#141417',
    night2: '#202025',
    night3: '#2E2E35',
    glass: 'rgba(255,255,255,0.08)',
    onNight: '#F5F5F4',
    onNightMuted: '#8E8E95',
    onNightDim: '#76767D',
    glow: 'rgba(51,85,255,0.30)',
    blue: '#3355FF',
    onBlue: '#FFFFFF',
    onBlueMuted: '#EDF0FF',
    blueDeep: '#2743D9',
    blueText: '#8FA3FF',
    blueOnNight: '#8FA3FF',
    red: '#C8323A',
    onRed: '#FFFFFF',
    redText: '#FF7A73',
    redOnNight: '#FF7A73',
    green: '#2EA464',
    greenText: '#4CC38A',
    onGreen: '#0B0B0D',
    scrim: 'rgba(0,0,0,0.6)',
    toast: '#3A3A41',
    onToast: '#F5F5F4',
    focus: '#8FA3FF',
  },
} as const;

export type ColorName = keyof (typeof colors)['light'];
export type Colors = { readonly [K in ColorName]: string };

/** The font files, by the name each is registered under when the app starts. */
export const fonts = {
  sans400: 'Geist-Regular',
  sans500: 'Geist-Medium',
  sans600: 'Geist-SemiBold',
  mono400: 'GeistMono-Regular',
} as const;

/** The 17 type styles (stage 5, section 3). Sizes, line heights and tracking in px. */
export const type = {
  figureXl: { fontFamily: fonts.sans500, fontSize: 56, lineHeight: 56, letterSpacing: -2.24 },
  figureL: { fontFamily: fonts.sans500, fontSize: 44, lineHeight: 44, letterSpacing: -1.54 },
  figure: { fontFamily: fonts.sans500, fontSize: 34, lineHeight: 34, letterSpacing: -1.02 },
  titleXl: { fontFamily: fonts.sans500, fontSize: 34, lineHeight: 38.08, letterSpacing: -1.02 },
  title: { fontFamily: fonts.sans500, fontSize: 28, lineHeight: 32.2, letterSpacing: -0.7 },
  title2: { fontFamily: fonts.sans500, fontSize: 24, lineHeight: 28.8, letterSpacing: -0.48 },
  title3: { fontFamily: fonts.sans500, fontSize: 20, lineHeight: 25, letterSpacing: -0.3 },
  headline: { fontFamily: fonts.sans500, fontSize: 17, lineHeight: 21.25, letterSpacing: -0.17 },
  reading: { fontFamily: fonts.sans400, fontSize: 18, lineHeight: 27.9, letterSpacing: 0 },
  body: { fontFamily: fonts.sans400, fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  button: { fontFamily: fonts.sans600, fontSize: 16, lineHeight: 19.2, letterSpacing: 0 },
  row: { fontFamily: fonts.sans500, fontSize: 15, lineHeight: 19.5, letterSpacing: 0 },
  sub: { fontFamily: fonts.sans400, fontSize: 15, lineHeight: 21.75, letterSpacing: 0 },
  small: { fontFamily: fonts.sans500, fontSize: 14, lineHeight: 19.6, letterSpacing: 0 },
  caption: { fontFamily: fonts.sans400, fontSize: 13, lineHeight: 17.55, letterSpacing: 0 },
  micro: { fontFamily: fonts.sans400, fontSize: 12, lineHeight: 16.2, letterSpacing: 0 },
  code: { fontFamily: fonts.mono400, fontSize: 12.5, lineHeight: 21.25, letterSpacing: 0 },
} as const;

export type TypeStyle = keyof typeof type;

/** Spacing steps (stage 5, section 4): space[12] is 12. */
export const space = {
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  18: 18,
  20: 20,
  24: 24,
  28: 28,
  58: 58,
} as const;

/** Corner radii (stage 5, section 4). */
export const radius = {
  pill: 999,
  sheet: 32,
  block: 28,
  card: 24,
  row: 22,
  inset: 18,
  small: 16,
  field: 14,
  mark: 13,
  bar: 2,
} as const;

/** Fixed sizes: touch targets, buttons, rows, marks and icons (stage 5, section 4). */
export const size = {
  target: 44,
  button: 56,
  hold: 60,
  row: 62,
  mark: 36,
  icon: 20,
} as const;

/** Shadows, only on things that float (stage 5, section 4), as CSS box-shadow. */
export const shadows = {
  light: {
    bar: '0 10px 30px rgba(12,12,14,0.18)',
    toast: '0 10px 30px rgba(12,12,14,0.25)',
    menu: '0 16px 40px rgba(0,0,0,0.4)',
    knob: '0 1px 3px rgba(0,0,0,0.2)',
  },
  dark: {
    bar: '0 10px 30px rgba(0,0,0,0.5)',
    toast: '0 10px 30px rgba(0,0,0,0.5)',
    menu: '0 16px 40px rgba(0,0,0,0.6)',
    knob: '0 1px 3px rgba(0,0,0,0.4)',
  },
} as const;
