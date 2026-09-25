// Generated from docs/design/prototype/tokens.py by tools/theme/generate.py. Do not edit:
// change tokens.py, then run `npm run theme`.

/** One part of an icon: a path, circle or rect; `fill` draws it solid in the text colour. */
export type IconPart =
  | readonly ['path', { readonly d: string; readonly fill?: true }]
  | readonly [
      'circle',
      { readonly cx: number; readonly cy: number; readonly r: number; readonly fill?: true },
    ]
  | readonly [
      'rect',
      {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly rx?: number;
      },
    ];

/** The 49 icons: stroked in the text colour, 1.75 wide, round caps and joins. */
export const icons = {
  x: [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
  back: [['path', { d: 'm15 18-6-6 6-6' }]],
  more: [
    ['circle', { cx: 5, cy: 12, r: 1, fill: true }],
    ['circle', { cx: 12, cy: 12, r: 1, fill: true }],
    ['circle', { cx: 19, cy: 12, r: 1, fill: true }],
  ],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  mic: [
    ['rect', { x: 9, y: 3, width: 6, height: 11, rx: 3 }],
    ['path', { d: 'M5 11a7 7 0 0 0 14 0M12 18v3' }],
  ],
  pen: [
    ['path', { d: 'M4 20h4L19 9l-4-4L4 16z' }],
    ['path', { d: 'm13 7 4 4' }],
  ],
  edit: [
    ['path', { d: 'M12 20h9' }],
    ['path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' }],
  ],
  mail: [
    ['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }],
    ['path', { d: 'm3 7 9 6 9-6' }],
  ],
  clock: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 7v5l3 2' }],
  ],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  eye: [
    ['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  globe: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18' }],
  ],
  list: [['path', { d: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01' }]],
  arrow: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
  up_right: [['path', { d: 'M7 17 17 7M8 7h9v9' }]],
  lock: [
    ['rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }],
    ['path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }],
  ],
  hand: [
    ['path', { d: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12' }],
    ['path', { d: 'M11 11.5v-7a1.5 1.5 0 0 1 3 0V12' }],
    ['path', { d: 'M14 11.5V6.5a1.5 1.5 0 0 1 3 0V14' }],
    [
      'path',
      {
        d: 'M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L4.3 15.2a1.6 1.6 0 0 1 2.4-2.1L8 14.5',
      },
    ],
  ],
  share: [
    ['path', { d: 'M12 3v12M7 8l5-5 5 5' }],
    ['path', { d: 'M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6' }],
  ],
  face: [
    [
      'path',
      {
        d: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2',
      },
    ],
    ['path', { d: 'M9 9v1M15 9v1M12 9v4h-1M9.5 16a4 4 0 0 0 5 0' }],
  ],
  memory: [
    [
      'path',
      {
        d: 'M12 3a6 6 0 0 0-6 6c0 2.4 1.4 3.9 2.5 5 .6.6 1 1.3 1 2.1V17h5v-.9c0-.8.4-1.5 1-2.1 1.1-1.1 2.5-2.6 2.5-5a6 6 0 0 0-6-6z',
      },
    ],
    ['path', { d: 'M10 21h4' }],
  ],
  calendar: [
    ['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }],
    ['path', { d: 'M3 10h18M8 3v4M16 3v4' }],
  ],
  cursor: [['path', { d: 'm5 3 14 7-6 2-2 6z', fill: true }]],
  user: [
    ['circle', { cx: 12, cy: 8, r: 4 }],
    ['path', { d: 'M4 21a8 8 0 0 1 16 0' }],
  ],
  key: [
    ['circle', { cx: 8, cy: 15, r: 4 }],
    ['path', { d: 'm10.8 12.2 8.2-8.2M16 7l3 3M14 9l2 2' }],
  ],
  link: [
    ['path', { d: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7' }],
    ['path', { d: 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7' }],
  ],
  shield: [
    ['path', { d: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  bell: [
    ['path', { d: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z' }],
    ['path', { d: 'M10 20a2 2 0 0 0 4 0' }],
  ],
  sun: [
    ['circle', { cx: 12, cy: 12, r: 4 }],
    [
      'path',
      {
        d: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
      },
    ],
  ],
  help: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01' }],
  ],
  download: [
    ['path', { d: 'M12 4v11M7 10l5 5 5-5' }],
    ['path', { d: 'M5 20h14' }],
  ],
  sparkle: [
    [
      'path',
      {
        d: 'M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5',
      },
    ],
  ],
  alert: [
    ['path', { d: 'M12 4 2.5 20h19z' }],
    ['path', { d: 'M12 10v4M12 17.5v.01' }],
  ],
  flag: [
    ['path', { d: 'M5 21V4' }],
    ['path', { d: 'M5 4h11l-2 4 2 4H5' }],
  ],
  terminal: [
    ['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }],
    ['path', { d: 'm7 9 3 3-3 3M13 15h4' }],
  ],
  file: [
    ['path', { d: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z' }],
    ['path', { d: 'M14 3v6h6' }],
  ],
  sheet: [
    ['rect', { x: 4, y: 3, width: 16, height: 18, rx: 2 }],
    ['path', { d: 'M4 9h16M4 15h16M10 3v18' }],
  ],
  search: [
    ['circle', { cx: 11, cy: 11, r: 7 }],
    ['path', { d: 'm20 20-3.5-3.5' }],
  ],
  play: [['path', { d: 'M7 4v16l13-8z', fill: true }]],
  prev: [['path', { d: 'M18 6 9 12l9 6zM6 6v12' }]],
  next: [['path', { d: 'm6 6 9 6-9 6zM18 6v12' }]],
  grid: [
    ['rect', { x: 4, y: 4, width: 7, height: 7, rx: 2 }],
    ['rect', { x: 13, y: 4, width: 7, height: 7, rx: 2 }],
    ['rect', { x: 4, y: 13, width: 7, height: 7, rx: 2 }],
    ['rect', { x: 13, y: 13, width: 7, height: 7, rx: 2 }],
  ],
  repeat: [
    ['path', { d: 'm17 2 4 4-4 4' }],
    ['path', { d: 'M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4' }],
    ['path', { d: 'M21 13v2a3 3 0 0 1-3 3H3' }],
  ],
  question: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01' }],
  ],
  chevron: [['path', { d: 'm9 6 6 6-6 6' }]],
  archive: [
    ['rect', { x: 3, y: 4, width: 18, height: 5, rx: 1 }],
    ['path', { d: 'M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4' }],
  ],
  vmark: [['path', { d: 'm7 8 5 9 5-9' }]],
  mic_off: [
    ['path', { d: 'M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3' }],
    ['path', { d: 'M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.4 2.3M12 18v3M3 3l18 18' }],
  ],
  offline: [
    ['path', { d: 'M12 20h.01' }],
    ['path', { d: 'M8.5 16.4a5 5 0 0 1 7 0' }],
    ['path', { d: 'M5 12.9a10 10 0 0 1 5.2-2.8' }],
    ['path', { d: 'M19 12.9a10 10 0 0 0-2.3-1.6' }],
    ['path', { d: 'M2 8.8a15 15 0 0 1 4.2-2.7' }],
    ['path', { d: 'M22 8.8A15 15 0 0 0 10.7 5.1' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
  trash: [['path', { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' }]],
} as const satisfies Record<string, readonly IconPart[]>;

export type IconName = keyof typeof icons;
