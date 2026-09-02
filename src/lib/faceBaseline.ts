/**
 * The user's own facial baseline, and the z-score of a scan against it.
 *
 * Absolute facial numbers mean nothing across people: skin tone, face shape, glasses, the phone's
 * camera and the light in the room all move them more than tiredness does. What is meaningful is
 * how tonight's face compares to the same face on other nights, from the same camera. So there is
 * no population model here — only a running mean and variance of this person's own measurements,
 * updated after every accepted scan.
 *
 * That has an honest consequence: the first few scans cannot produce a deviation, because there is
 * nothing yet to deviate from. Those return `provisional`, and a provisional score is excluded
 * from the fused SDI rather than being quietly counted as neutral.
 *
 * Pure — no React Native, no storage. Driven directly by scripts/test-face.ts.
 */

export interface RunningStat {
  n: number;
  mean: number;
  /** Sum of squared deviations (Welford's M2), not the variance. */
  m2: number;
}

export interface FaceBaseline {
  periorbital: RunningStat;
  redness: RunningStat;
  eyeContrast: RunningStat;
  motion: RunningStat;
  /**
   * How much of a scan this person's eyes are normally closed for.
   *
   * Optional because it arrived after the other four, and a device that has been scanning for weeks
   * should keep the baseline it has rather than start again. Absent means "not yet measured", and
   * the channel simply does not contribute until it has been.
   */
  closure?: RunningStat;
  /** Eyelid aperture ratio — the measured counterpart to the classifier's closure probability. */
  ear?: RunningStat;
  /** Mouth aperture ratio. */
  mar?: RunningStat;
  /** Under-eye lightness drop in CIELAB L*. */
  periorbitalLab?: RunningStat;
  /** Fraction of the eye opening reading as red in HSV. */
  scleralRedness?: RunningStat;
  /** Cheek chroma — the pallor channel. See ScorableFeatures for why chroma and not lightness. */
  skinToneChroma?: RunningStat;
  /** Mouth-corner droop against this person's own resting mouth. */
  mouthCornerDrop?: RunningStat;
  updatedAt: number;
}

export interface ScorableFeatures {
  periorbital: number;
  redness: number;
  eyeContrast: number;
  motion: number;
  /**
   * Time-weighted fraction of the scan with the eyes closed — see lib/ocular.ts.
   *
   * Undefined when the device could not sample fast enough to measure it, which is a real outcome
   * on a slow phone and must not be confused with "the eyes were open".
   */
  closureFraction?: number;
  /**
   * The spec's geometric and colour-space features, all optional for the same reason
   * `closureFraction` is: each depends on something the detector may not have returned on a given
   * scan — contours for the two ratios, a usable cheek/under-eye pair for the LAB delta — and a
   * channel that was not measured must widen the others' share rather than be folded in as zero.
   */
  ear?: number;
  mar?: number;
  periorbitalLab?: number;
  scleralRedness?: number;
  /**
   * Cheek chroma, sqrt(a*² + b*²) in CIELAB — the spec's skin-tone delta, as the pallor channel.
   *
   * Chroma rather than lightness, deliberately. Pallor is a loss of blood colour in the skin, which
   * shows as chroma falling; L* would also catch it, but L* moves with how brightly the room is lit
   * far more than it moves with how someone slept, so scoring it would make the fatigue score partly
   * a measurement of the lamp. `skinToneL` is still recorded on every scan and kept in the baseline
   * vector the data model asks for — it is just not given a vote.
   */
  skinToneChroma?: number;
  /**
   * Mouth-corner droop, as a fraction of mouth width. The spec's "corner-angle delta".
   *
   * Scored rather than merely recorded, and baseline-normalised for a specific reason: resting
   * mouth shape varies enormously between people, so an absolute droop figure says more about
   * someone's face than about their night. Against their own calibration it says the second thing.
   */
  mouthCornerDrop?: number;
}

/** True once the baseline has collected its full calibration set and stopped moving. */
export function isCalibrated(base: FaceBaseline | null): boolean {
  return (base?.periorbital.n ?? 0) >= CALIBRATION_SCANS;
}

/** How many more scans the calibration needs. Zero once it is fixed. */
export function calibrationRemaining(base: FaceBaseline | null): number {
  return Math.max(0, CALIBRATION_SCANS - (base?.periorbital.n ?? 0));
}

/**
 * Start the calibration again from nothing.
 *
 * Deliberately destructive and deliberately explicit. A baseline that could be *partially* nudged
 * would drift again by a slower route; the only safe way to move a reference is to replace it, and
 * the only thing that should decide to is a person who knows their face has changed — a new
 * routine, a new medication, a beard, a different room they scan in.
 */
export function recalibrateFaceBaseline(): FaceBaseline {
  return emptyFaceBaseline();
}

/** Scans needed before the comparison means anything. */
export const MIN_BASELINE_SAMPLES = 3;

/**
 * Scans that form the calibration baseline, after which it stops absorbing new ones.
 *
 * This is the fix for a drift that quietly disarmed the whole measurement. Every scan was pushed
 * into the running statistics, so the baseline was a lifetime average that kept moving toward
 * whatever the user currently looked like. Someone sleeping badly for three weeks taught the app
 * that their tired face *was* their normal face, the z-scores collapsed back toward zero, and the
 * score recovered while the person did not — the app was least able to detect chronic fatigue in
 * exactly the population it exists for.
 *
 * A baseline has to be a fixed reference to be a baseline. Five scans is enough for a stable mean
 * without asking for a long calibration ritual, and the architecture spec's data model already
 * anticipates this shape: `BaselineProfile` is a row with a `recalibrated_at`, refreshed
 * deliberately, not a value that follows the user around.
 *
 * Recalibration is therefore an action rather than a side effect — see `recalibrateFaceBaseline`.
 */
export const CALIBRATION_SCANS = 5;

const zero = (): RunningStat => ({ n: 0, mean: 0, m2: 0 });

export const emptyFaceBaseline = (): FaceBaseline => ({
  periorbital: zero(),
  redness: zero(),
  eyeContrast: zero(),
  motion: zero(),
  closure: zero(),
  ear: zero(),
  mar: zero(),
  periorbitalLab: zero(),
  scleralRedness: zero(),
  skinToneChroma: zero(),
  mouthCornerDrop: zero(),
  updatedAt: 0,
});

/** Welford: numerically stable, and it never needs the old samples kept around. */
function push(s: RunningStat, x: number): RunningStat {
  const n = s.n + 1;
  const delta = x - s.mean;
  const mean = s.mean + delta / n;
  return { n, mean, m2: s.m2 + delta * (x - mean) };
}

export function updateFaceBaseline(base: FaceBaseline | null, f: ScorableFeatures, at = Date.now()): FaceBaseline {
  const b = base ?? emptyFaceBaseline();
  // Once calibrated, the reference is fixed. Later scans are measured *against* it rather than
  // folded *into* it; see CALIBRATION_SCANS for why that distinction decides whether the app can
  // see chronic fatigue at all.
  if (isCalibrated(b)) return b;
  return {
    periorbital: push(b.periorbital, f.periorbital),
    redness: push(b.redness, f.redness),
    eyeContrast: push(b.eyeContrast, f.eyeContrast),
    motion: push(b.motion, f.motion),
    // Only when it was actually measured. Folding a missing closure in as zero would teach the
    // baseline that this person never closes their eyes, and every later scan that *did* measure it
    // would then read as catastrophic.
    closure: f.closureFraction != null ? push(b.closure ?? zero(), f.closureFraction) : b.closure,
    ear: f.ear != null ? push(b.ear ?? zero(), f.ear) : b.ear,
    mar: f.mar != null ? push(b.mar ?? zero(), f.mar) : b.mar,
    periorbitalLab: f.periorbitalLab != null ? push(b.periorbitalLab ?? zero(), f.periorbitalLab) : b.periorbitalLab,
    scleralRedness:
      f.scleralRedness != null ? push(b.scleralRedness ?? zero(), f.scleralRedness) : b.scleralRedness,
    skinToneChroma:
      f.skinToneChroma != null ? push(b.skinToneChroma ?? zero(), f.skinToneChroma) : b.skinToneChroma,
    mouthCornerDrop:
      f.mouthCornerDrop != null ? push(b.mouthCornerDrop ?? zero(), f.mouthCornerDrop) : b.mouthCornerDrop,
    updatedAt: at,
  };
}

/**
 * Sample standard deviation, floored.
 *
 * The floor is doing real work: with a handful of samples a feature can look almost perfectly
 * constant by chance, and dividing by that near-zero spread turns a trivial difference into a
 * z-score of 20. The floors are the smallest change in each measurement that could plausibly be a
 * real change in the face rather than sensor noise.
 */
export function stdOf(s: RunningStat, floor: number): number {
  if (s.n < 2) return floor;
  return Math.max(floor, Math.sqrt(s.m2 / (s.n - 1)));
}

const FLOORS = {
  periorbital: 0.02,
  redness: 0.01,
  eyeContrast: 0.05,
  motion: 0.01,
  closure: 0.03,
  // EAR varies by a few hundredths between an alert and a heavy eye, so its floor is tighter.
  ear: 0.015,
  mar: 0.02,
  // L* units, not a 0..1 ratio — a 1.5-unit floor is about the smallest visible difference.
  periorbitalLab: 1.5,
  scleralRedness: 0.02,
  // Chroma units in LAB; cheek chroma sits around 15-25, and a floor of 1 keeps a run of very
  // consistent scans from turning an ordinary reading into a large deviation.
  skinToneChroma: 1,
  // A droop ratio moves by hundredths of the mouth's width between rested and tired.
  mouthCornerDrop: 0.01,
} as const;

/**
 * Weights across the measurements, ordered by how much evidence each one actually has.
 *
 * Eyelid closure dominates, and by a distance. The proportion of a window with the lids shut —
 * PERCLOS and its relatives — is the ocular measure the drowsiness literature is built on, validated
 * against EEG and against driving performance. Periorbital darkness and skin redness come from the
 * cosmetics and dermatology literature; they correlate with a bad night, but nobody has shown they
 * track alertness minute to minute. Sway is real but weak on its own.
 *
 * When closure could not be measured — too slow a camera — its weight is redistributed across the
 * rest rather than counted as zero, so a scan without it is scored on what was measured, honestly
 * and with the reduced confidence the app already reports.
 */
const WEIGHTS = {
  // Eyelid behaviour still dominates, now split across two measurements of the same thing: the
  // classifier's closure proportion and the geometry's aperture ratio. They are given comparable
  // weight rather than one being folded into the other, because they fail differently — closure is
  // robust to head pose and blind to how *far* the lid travelled, EAR is the reverse.
  closure: 0.3,
  ear: 0.22,
  eyeContrast: 0.1,
  // The spec's LAB periorbital measurement supersedes the luma ratio as the darkness channel, so it
  // carries the larger share of the two. The older one stays as a cheap corroborator.
  periorbitalLab: 0.13,
  periorbital: 0.06,
  scleralRedness: 0.07,
  redness: 0.04,
  motion: 0.06,
  // Mouth geometry is the weakest of the spec's features by its own account — a yawn is obvious and
  // rare, and resting jaw slackness is subtle. Carried, recorded and weighted accordingly.
  mar: 0.02,
  // Pallor. Real in the literature the spec cites, and confounded by illumination colour even in
  // chroma, so it gets a small share rather than none.
  skinToneChroma: 0.04,
  // Corner droop, alongside MAR as the other half of the spec's mouth geometry. It was computed,
  // stored and synced while contributing nothing — a feature by every appearance except the one
  // that counts. Weighted with MAR, low, for the same reason: the cue is real and subtle.
  mouthCornerDrop: 0.02,
} as const;

export interface FaceScore {
  /** Positive = more alert than this user's own average. Clamped to +/-2.5. */
  zScore: number;
  /** True while the baseline is too thin to compare against; the score must not be fused. */
  provisional: boolean;
  /** Per-feature deviations, kept for the "why" copy and for debugging a suspect score. */
  perFeature: {
    periorbital: number;
    redness: number;
    eyeContrast: number;
    motion: number;
    closure: number;
    ear: number;
    mar: number;
    periorbitalLab: number;
    scleralRedness: number;
    skinToneChroma: number;
    mouthCornerDrop: number;
  };
  /** Whether eyelid closure — the heaviest channel — was among the measurements. */
  usedClosure: boolean;
}

export function scoreAgainstBaseline(f: ScorableFeatures, base: FaceBaseline | null): FaceScore {
  const b = base ?? emptyFaceBaseline();
  const z = (x: number, s: RunningStat, floor: number) => (s.n < 1 ? 0 : (x - s.mean) / stdOf(s, floor));

  const closureBase = b.closure ?? zero();
  const usedClosure = f.closureFraction != null && closureBase.n >= 1;

  /** A channel contributes only when it was measured *and* the baseline has seen it before. */
  const optional = (v: number | undefined, stat: RunningStat | undefined, floor: number) =>
    v != null && stat && stat.n >= 1 ? z(v, stat, floor) : null;

  const zEar = optional(f.ear, b.ear, FLOORS.ear);
  const zMar = optional(f.mar, b.mar, FLOORS.mar);
  const zPeriLab = optional(f.periorbitalLab, b.periorbitalLab, FLOORS.periorbitalLab);
  const zSclera = optional(f.scleralRedness, b.scleralRedness, FLOORS.scleralRedness);
  const zChroma = optional(f.skinToneChroma, b.skinToneChroma, FLOORS.skinToneChroma);
  const zDroop = optional(f.mouthCornerDrop, b.mouthCornerDrop, FLOORS.mouthCornerDrop);

  const perFeature = {
    periorbital: z(f.periorbital, b.periorbital, FLOORS.periorbital),
    redness: z(f.redness, b.redness, FLOORS.redness),
    eyeContrast: z(f.eyeContrast, b.eyeContrast, FLOORS.eyeContrast),
    motion: z(f.motion, b.motion, FLOORS.motion),
    closure: usedClosure ? z(f.closureFraction as number, closureBase, FLOORS.closure) : 0,
    ear: zEar ?? 0,
    mar: zMar ?? 0,
    periorbitalLab: zPeriLab ?? 0,
    scleralRedness: zSclera ?? 0,
    skinToneChroma: zChroma ?? 0,
    mouthCornerDrop: zDroop ?? 0,
  };

  // Fatigue reads as eyes closed for more of the scan than usual, darker eye sockets, redder skin,
  // softer eye edges and more sway. Negated at the end so the result matches every other signal in
  // the app: positive means more alert.
  const terms: { w: number; v: number }[] = [
    { w: WEIGHTS.periorbital, v: perFeature.periorbital },
    { w: WEIGHTS.redness, v: perFeature.redness },
    { w: WEIGHTS.motion, v: perFeature.motion },
    { w: WEIGHTS.eyeContrast, v: -perFeature.eyeContrast },
  ];
  if (usedClosure) terms.push({ w: WEIGHTS.closure, v: perFeature.closure });
  // A *smaller* aperture than usual is the fatigue direction, so EAR is negated like eyeContrast.
  if (zEar != null) terms.push({ w: WEIGHTS.ear, v: -zEar });
  if (zMar != null) terms.push({ w: WEIGHTS.mar, v: zMar });
  if (zPeriLab != null) terms.push({ w: WEIGHTS.periorbitalLab, v: zPeriLab });
  if (zSclera != null) terms.push({ w: WEIGHTS.scleralRedness, v: zSclera });
  // Pallor is chroma *below* the personal baseline, so the sign is inverted like EAR's.
  if (zChroma != null) terms.push({ w: WEIGHTS.skinToneChroma, v: -zChroma });
  // Corners *lower* than this person's own resting mouth is the fatigue direction, so positive.
  if (zDroop != null) terms.push({ w: WEIGHTS.mouthCornerDrop, v: zDroop });

  // Renormalised over whatever was measured, exactly as the SDI fusion does with its signals: a
  // missing channel widens the others' share rather than silently pulling the score towards zero.
  const weightSum = terms.reduce((a, t) => a + t.w, 0);
  const fatigue = terms.reduce((a, t) => a + (t.w / weightSum) * t.v, 0);

  const provisional = Math.min(b.periorbital.n, b.eyeContrast.n) < MIN_BASELINE_SAMPLES;
  const zScore = Math.max(-2.5, Math.min(2.5, -fatigue));

  return { zScore: Number(zScore.toFixed(2)), provisional, perFeature, usedClosure };
}
