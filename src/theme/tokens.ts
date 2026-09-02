// Design tokens ported from "Somno Prototype.dc.html" (Claude Design export).
// Source palette: dark, circadian (indigo-night / amber-morning), glassmorphic.

export const color = {
  bg: '#07060C',
  /** The phone-frame surface colour in the prototype (subtly lighter than the page behind it). */
  bgFrame: '#08070E',
  bgGradTopLeft: 'rgba(109,91,240,0.22)',
  bgGradBottomRight: 'rgba(255,142,90,0.10)',

  text: '#ECEAF6',
  textDim70: 'rgba(236,234,246,0.72)',
  textDim55: 'rgba(236,234,246,0.55)',
  textDim50: 'rgba(236,234,246,0.5)',
  textDim45: 'rgba(236,234,246,0.45)',
  textDim42: 'rgba(236,234,246,0.42)',
  textDim40: 'rgba(236,234,246,0.4)',
  textDim38: 'rgba(236,234,246,0.38)',
  textDim35: 'rgba(236,234,246,0.35)',
  textDim32: 'rgba(236,234,246,0.32)',
  textDim25: 'rgba(236,234,246,0.25)',

  // brand / accent gradients
  violet: '#8A7BFF',
  violetLight: '#B49CFF',
  lilac: '#C9A6FF',
  amber: '#FFB877',
  coral: '#FF8E7A',
  mint: '#7FE9DA',
  sky: '#8FD8FF',
  orchid: '#E07BFF',

  glassFillHi: 'rgba(255,255,255,0.10)',
  glassFillLo: 'rgba(255,255,255,0.04)',
  glassFillFaint: 'rgba(255,255,255,0.055)',
  glassBorder: 'rgba(255,255,255,0.14)',
  glassBorder12: 'rgba(255,255,255,0.12)',
  glassBorderSoft: 'rgba(255,255,255,0.10)',
  glassInsetTop: 'rgba(255,255,255,0.18)',

  chipOn: 'rgba(236,234,246,0.95)',
  chipOff: 'rgba(255,255,255,0.05)',
  chipInkOn: '#0C0A18',
  chipInkOff: 'rgba(236,234,246,0.75)',

  pillBg: 'rgba(255,255,255,0.07)',
  pillBorder: 'rgba(255,255,255,0.10)',

  toggleOn: '#8A7BFF',
  toggleOff: 'rgba(255,255,255,0.16)',

  ink: '#0C0A18',
  ink2: '#150F2C',
  ink3: '#1A1330',

  cardDeep: 'rgba(10,9,18,0.55)',
} as const;

export const gradient = {
  // Primary CTA button
  primaryButton: ['#FFFFFF', '#D6D0FF'] as const, // linear 150deg
  // Ambient blob (used behind gauges/avatars)
  blob: ['#8A7BFF', '#B49CFF', '#C9A6FF', '#FFB877', '#8A7BFF'] as const, // conic
  blobWarm: ['#FFB877', '#E9A2B4', '#C9A6FF', '#8A7BFF', '#FFB877'] as const,
  glassCard: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.04)'] as const, // 160deg
  glassCardSoft: ['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.035)'] as const,
  sdiRing: ['#FFB877', '#C9A6FF', '#8A7BFF'] as const,
  hypnogram: ['#7FE9DA', '#8FD8FF', '#E07BFF', '#7FE9DA'] as const,
  wakeDebt: ['#8A7BFF', '#C4B4FF'] as const,
  nremDebt: ['#FFB877', '#FFD9A8'] as const,
  remDebt: ['#FF8E7A', '#FFB3A3'] as const,
  insightCard: ['rgba(138,123,255,0.22)', 'rgba(138,123,255,0.06)'] as const,
  weekBarHigh: ['#DCD3FF', '#8A7BFF'] as const,
  weekBarMid: ['rgba(201,166,255,0.85)', 'rgba(138,123,255,0.55)'] as const,
  weekBarLow: ['rgba(255,184,119,0.85)', 'rgba(255,142,122,0.5)'] as const,
} as const;

export const font = {
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  sans300: 'Figtree_300Light',
  sans400: 'Figtree_400Regular',
  sans500: 'Figtree_500Medium',
  sans600: 'Figtree_600SemiBold',
  sans700: 'Figtree_700Bold',
} as const;

/**
 * A large display numeral, sized so Android does not cut the top and bottom off it.
 *
 * The design writes its big figures with `font: 700 88px/1` — a line box exactly as tall as the
 * type. CSS is relaxed about that: a glyph taller than its line box simply overflows and is still
 * drawn. Android is not. `Text` clips to the line box, so `fontSize: 88, lineHeight: 88` renders an
 * 88px digit into an 88px slot and shaves the ascender and the descender off it. Every big number
 * in this app was written that way, which is what "the text is cut off" looks like on a phone and
 * why it never appeared in the browser harness or the pixel diff, both of which run on web.
 *
 * `includeFontPadding: false` removes the extra leading Android adds around the glyph box, and is
 * the reason the result still lands on the design's tight metrics instead of growing by a fifth.
 * The explicit `lineHeight` is dropped so the platform uses the font's own ascent and descent,
 * which is the only measurement that is guaranteed to contain the glyph.
 */
export const displayNumeral = (fontSize: number) =>
  ({
    fontSize,
    includeFontPadding: false,
    textAlignVertical: 'center',
  }) as const;

export const radius = {
  xs: 10,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 22,
  xxl: 24,
  huge: 26,
  pill: 29,
  circle: 999,
} as const;

export const space = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 28,
} as const;

// Device frame constants (iPhone-like canvas the prototype was designed at)
export const device = {
  width: 390,
  height: 844,
};

export const layout = {
  /** Height of the status-bar strip the prototype reserves at the top of its 390x844 frame
   * (15px padding + ~15px of glyphs). Screen layouts are measured from below this, so it acts as
   * a minimum top inset — see ScreenContainer. */
  statusBarHeight: 32,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  button: {
    shadowColor: '#7A5CFF',
    shadowOpacity: 0.34,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
} as const;
