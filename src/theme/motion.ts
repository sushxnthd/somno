import { Easing } from 'react-native';

/**
 * The design's motion vocabulary, transcribed from its `@keyframes` and `transition` declarations.
 * Every duration and easing here is the source's, so timing reads the same as the mockup rather
 * than as generic React Native defaults.
 */

/** `cubic-bezier(.22,1,.36,1)` — the design's signature ease-out, on almost every transition. */
export const easeOutExpo = Easing.bezier(0.22, 1, 0.36, 1);
export const easeInOut = Easing.inOut(Easing.ease);
export const easeOut = Easing.out(Easing.ease);
export const linear = Easing.linear;

export const motion = {
  /** `screenin .42s cubic-bezier(.22,1,.36,1) both` — opacity 0->1, translateY 10->0, scale .994->1 */
  screenIn: { duration: 420, easing: easeOutExpo, fromY: 10, fromScale: 0.994 },
  /** `popin .5s cubic-bezier(.22,1,.36,1) both` — opacity 0->1, scale .92->1 */
  popIn: { duration: 500, easing: easeOutExpo, fromScale: 0.92 },
  /** `rise .25s ease` — opacity 0->1, translateY 8->0 */
  rise: { duration: 250, easing: easeInOut, fromY: 8 },
  /** `ripple 2.6s ease-out infinite` — scale .7->1.7, opacity .55->0 */
  ripple: { duration: 2600, easing: easeOut, fromScale: 0.7, toScale: 1.7, fromOpacity: 0.55 },
  /** `breathe Ns ease-in-out infinite` — scale 1->1.05, opacity .85->1 */
  breathe: { easing: easeInOut, toScale: 1.05, fromOpacity: 0.85 },

  /** `transition: left .38s cubic-bezier(.22,1,.36,1)` — the tab bar's sliding indicator. */
  tabIndicator: { duration: 380, easing: easeOutExpo },
  /** `transition: color .26s ease` — tab label tint. */
  tabLabel: { duration: 260, easing: easeInOut },
  /** `transition: transform .52s cubic-bezier(.22,1,.36,1)` — the welcome carousel. */
  carousel: { duration: 520, easing: easeOutExpo },
  /** `transition: width .3s ease` — the tap-test progress bar. */
  progressBar: { duration: 300, easing: easeInOut },
  /** `transition: width .4s cubic-bezier(.22,1,.36,1)` — bar fills that animate to a new value. */
  barFill: { duration: 400, easing: easeOutExpo },
  /** `transition: background .18s ease` — chip and control press feedback. */
  press: { duration: 180, easing: easeInOut },
} as const;
