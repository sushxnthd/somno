/**
 * Eyelid behaviour over a scan — now measured, not inferred from edge energy.
 *
 * Of everything a camera can see, the measure that actually tracks sleepiness is how much of the
 * time the eyes are closing: PERCLOS, the proportion of a window with the lids mostly shut, which
 * came out of the driving research (Wierwille & Ellsworth 1994; Dinges & Grace 1998) and remains the
 * best-validated ocular index of drowsiness. Skin tone, redness and shadows under the eyes are
 * cosmetic-literature signals; they belong in the fusion as minor terms, not as the headline.
 *
 * ## What changed, and why it matters more than it sounds
 *
 * This file used to derive openness photometrically: edge energy in a guessed eye band, plus the
 * depth of its darkest row, normalised against the 85th percentile of the scan's own values. Two
 * things were wrong with that, and the second was serious.
 *
 * The first is that it was a proxy, and said so. Edge energy is not lid position.
 *
 * The second is that the *within-scan* reference had an inverting failure mode. Dividing every frame
 * by the scan's own 85th percentile makes the measure independent of skin tone, lighting and lens —
 * but only if the scan contains open frames. Eyes shut for the whole six seconds meant the reference
 * was itself a shut eye, every frame divided out to 1.0, and the scan reported *zero* closure for the
 * most impaired state the app can be pointed at. That was patched with an absolute floor
 * (`ABSOLUTE_OPEN_FLOOR`) on a quantity whose scale was only ever empirical.
 *
 * ML Kit's per-eye open probability removes the whole problem rather than patching it. It is an
 * absolute quantity — comparable between frames, scans, people, rooms and phones — so there is no
 * reference to normalise against and no way for an all-closed scan to normalise itself into looking
 * alert. The floor, the quantile and the two-term photometric estimator are all deleted, and the
 * failure mode they were guarding is gone by construction rather than by threshold.
 *
 * ## What is honest to claim now
 *
 * `leftEyeOpenProbability` is a classifier's confidence that an eye is open. It is not a measured
 * lid aperture, so this is still not the infrared oculography PERCLOS was originally defined
 * against. What it *is*: a per-eye, absolutely-scaled, time-weighted closure proportion over a fixed
 * window — the same statistic PERCLOS names, computed from a classifier rather than from lid
 * position. The UI says "eyes closed N% of the scan", which is exactly what this measures and
 * carries no clinical claim.
 */

/**
 * Below this open-probability the eye is counted as closed.
 *
 * ML Kit's probability is not a lid-aperture percentage, so the P80 convention (lids covering 80% or
 * more of the pupil) has no exact translation. 0.4 is the threshold the detector's own documentation
 * uses for "likely closed", and it sits in the trough between the two modes the classifier actually
 * produces: open eyes cluster near 0.9+, closed near 0.05, and genuinely ambiguous mid-blink frames
 * are the minority in between. Being slightly generous about what counts as closed is the safe
 * direction for a drowsiness measure — over-reporting costs a cautious nudge, under-reporting lets
 * somebody drive.
 */
const CLOSED_BELOW = 0.4;

/**
 * How long a closure has to last to count as an episode rather than a blink.
 *
 * A normal blink is 100–400 ms. The drowsiness-specific event is the *slow* closure — lids that
 * drift shut and stay there — which is why the threshold sits above the ordinary blink range.
 */
const LONG_CLOSURE_MS = 400;

/**
 * The slowest sampling that can support any of this.
 *
 * At 350 ms between frames a 400 ms closure might land between two samples. Below that rate the
 * temporal measures are not merely noisy, they are unfounded, and the honest thing is to say so and
 * fall back to what a still image can support.
 */
const MAX_SAMPLE_PERIOD_MS = 350;
const MIN_TEMPORAL_FRAMES = 12;

/** One frame's contribution: when it was taken, and how open the eyes were judged to be. */
export interface OcularSample {
  /** Mean per-eye open probability 0..1, or null when no face was found in this frame. */
  eyeOpen: number | null;
  /** Capture instant, ms. */
  at: number;
}

export interface OcularMeasures {
  /** Per-frame open probability for the frames that had a face. 1 = wide, 0 = shut. */
  openness: number[];
  /** Median gap between frames, ms. */
  samplePeriodMs: number;
  /** Time-weighted fraction of the scan with the eyes below the closed threshold. */
  closureFraction: number;
  /** Closure episodes lasting at least LONG_CLOSURE_MS. */
  longClosures: number;
  /** Mean duration of those episodes, ms; 0 when there were none. */
  meanClosureMs: number;
  /** Spread of openness across the scan — lids that waver rather than hold. */
  opennessSd: number;
  /** Whether the achieved sample rate supports the four measures above. */
  temporalValid: boolean;
  /** Frames that carried a usable eye-open reading. */
  frames: number;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const EMPTY: OcularMeasures = {
  openness: [],
  samplePeriodMs: 0,
  closureFraction: 0,
  longClosures: 0,
  meanClosureMs: 0,
  opennessSd: 0,
  temporalValid: false,
  frames: 0,
};

/**
 * Turns a timed series of eye-open probabilities into the eyelid measures.
 *
 * Frames without a face contribute nothing rather than counting as closed. A user who turns away
 * mid-scan has not shut their eyes, and treating a detection gap as a closure would manufacture
 * exactly the drowsiness signal the scan is supposed to detect. Those frames are dropped and the
 * remaining ones are re-timed against each other, so the window shrinks honestly instead of filling
 * with invented closure — and if too few survive, `temporalValid` goes false and the caller drops
 * the measure entirely.
 */
export function ocularMeasures(series: OcularSample[]): OcularMeasures {
  const usable = series
    .filter((s): s is { eyeOpen: number; at: number } => typeof s.eyeOpen === 'number' && Number.isFinite(s.eyeOpen))
    .sort((a, b) => a.at - b.at);

  if (usable.length < 2) return { ...EMPTY, frames: usable.length };

  const openness = usable.map((s) => Math.max(0, Math.min(1, s.eyeOpen)));

  const gaps: number[] = [];
  for (let i = 1; i < usable.length; i++) gaps.push(usable[i].at - usable[i - 1].at);
  const samplePeriodMs = median(gaps);

  const temporalValid =
    usable.length >= MIN_TEMPORAL_FRAMES && samplePeriodMs > 0 && samplePeriodMs <= MAX_SAMPLE_PERIOD_MS;

  // Each frame stands for the interval around it, so a series with uneven gaps still weights
  // correctly: a frame that took twice as long to arrive covers twice as much of the window.
  let closedMs = 0;
  let totalMs = 0;
  const episodes: number[] = [];
  let current = 0;
  for (let i = 0; i < usable.length; i++) {
    const before = i > 0 ? (usable[i].at - usable[i - 1].at) / 2 : 0;
    const after = i < usable.length - 1 ? (usable[i + 1].at - usable[i].at) / 2 : 0;
    const span = before + after;
    totalMs += span;
    if (openness[i] < CLOSED_BELOW) {
      closedMs += span;
      current += span;
    } else if (current > 0) {
      episodes.push(current);
      current = 0;
    }
  }
  if (current > 0) episodes.push(current);

  const long = episodes.filter((d) => d >= LONG_CLOSURE_MS);
  const mean = openness.reduce((a, b) => a + b, 0) / openness.length;
  const variance = openness.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, openness.length - 1);

  return {
    openness: openness.map((o) => Number(o.toFixed(3))),
    samplePeriodMs: Math.round(samplePeriodMs),
    closureFraction: totalMs > 0 ? Number((closedMs / totalMs).toFixed(3)) : 0,
    longClosures: long.length,
    meanClosureMs: long.length ? Math.round(long.reduce((a, b) => a + b, 0) / long.length) : 0,
    opennessSd: Number(Math.sqrt(variance).toFixed(3)),
    temporalValid,
    frames: usable.length,
  };
}

/** What the app is allowed to say about a scan, given what the device managed to sample. */
export function ocularSummary(m: OcularMeasures): string {
  if (!m.temporalValid) {
    return `Eyelid timing needs a faster camera than this one managed (${m.frames} frames, ${m.samplePeriodMs}ms apart).`;
  }
  if (m.longClosures > 0) {
    return `Eyes were mostly closed for ${Math.round(m.closureFraction * 100)}% of the scan, including ${m.longClosures} slow closure${m.longClosures > 1 ? 's' : ''}.`;
  }
  return `Eyes stayed open for ${Math.round((1 - m.closureFraction) * 100)}% of the scan, with no slow closures.`;
}
