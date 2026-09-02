// Sleep Deprivation Index (SDI) fusion — transparent weighted linear model.
// Ported from Somno_03_Technical_Architecture.md §5.1:
//   SDI = 50 + 10 * [ w_pvt·z_pvt + w_face·z_face + w_kss·z_kss + w_debt·z_debt ]
// Weights renormalize (still sum to 1) over whichever signals were actually collected.

export interface SDIInputs {
  zPvt?: number | null;
  zFace?: number | null;
  zKss?: number | null;
  zDebt?: number | null;
  /** Relative measurement quality of the two objective signals, 0..1. See `precisionOf`. */
  precision?: { pvt: number; face: number };
}

export interface SDIResult {
  sdi: number;
  confidence: 'high' | 'medium' | 'low';
  signalsUsed: number;
}

/**
 * Weights across the four signals — and what each number is actually claiming.
 *
 * These were 0.30 / 0.40 / 0.13 / 0.17, and three of those four digits could not be defended. There
 * is no validation set behind this app: nothing here has been scored against polysomnography or
 * against a criterion measure of alertness, so any claim that the face scan is worth exactly 1.33
 * reaction tests was a guess wearing a decimal point. Dawes (1979) is the standard result on
 * precisely this situation — where weights cannot be estimated from data, equal weighting is
 * usually more accurate than weights chosen by judgement, because the judgement adds error without
 * adding information.
 *
 * So the ordering below is only what can be argued from published findings, and nothing finer:
 *
 *  - **The reaction test leads.** The PVT is the single best-validated field measure of
 *    sleep-loss-related impairment there is, and the architecture spec sets it at 0.40 on that
 *    basis. An earlier revision here moved it to 0.35 to match the face scan, on the argument that
 *    no evidence available *in this repo* ranked the two. That argument was about the absence of
 *    local evidence, not about the literature, and it quietly overrode a specified default with a
 *    preference. The spec's weights are the defaults again.
 *  - **The face scan is the second objective signal, at 0.25.** Same direction of evidence, much
 *    shallower validation base.
 *  - **Self-report is worth less, at 0.15.** Not a guess: Van Dongen et al. (2003) found subjective
 *    sleepiness ratings drifting apart from objective performance under chronic restriction, with
 *    ratings near-stable while lapse rates climbed for two weeks. A signal known to under-report the
 *    thing being measured, in exactly the population this app is for, is weighted accordingly.
 *  - **Sleep debt is a prediction, not a measurement, at 0.20.** It says what the last fortnight
 *    should have cost, not what is true right now, so it anchors rather than decides.
 *
 * On top of the defaults — not instead of them — `precisionOf` scales the two objective weights by
 * how well each was actually measured on that check-in. A five-trial alarm test and a scan whose
 * frame rate could not support the eyelid channel are both weaker instances of their signal than a
 * full one, and saying so is what the spec's own confidence badge is for. The base ordering is the
 * spec's; the per-check-in adjustment is an extension of it.
 */
const BASE_WEIGHTS = { pvt: 0.4, face: 0.25, kss: 0.15, debt: 0.2 };

/** Trials in a full baseline run, the reference a shorter run's precision is measured against. */
const REFERENCE_PVT_TRIALS = 9;

/**
 * How much of its full precision each objective signal actually achieved, 0..1.
 *
 * Inverse-variance weighting is the standard way to combine noisy estimates of the same quantity,
 * and both of these have a variance the app can see rather than assume.
 *
 * For the reaction test, the standard error of a session mean falls as 1/sqrt(n), so precision — the
 * inverse variance — rises linearly with trial count. The five-trial run taken at the alarm is
 * genuinely a weaker estimate than the nine-trial daily one, and now counts as one.
 *
 * For the face scan, the split is between methods rather than sample sizes. A scan whose frame rate
 * supported the eyelid measures produced the ocular index the drowsiness literature is built on; a
 * scan that fell back to still-image photometry produced something considerably weaker, and says so
 * to the user already. The floor keeps a degraded signal contributing rather than discarded — it is
 * still a measurement of the face.
 */
export function precisionOf(quality: {
  pvtTrials?: number | null;
  faceHasEyelidMeasures?: boolean;
}): { pvt: number; face: number } {
  const trials = quality.pvtTrials ?? REFERENCE_PVT_TRIALS;
  return {
    pvt: Math.max(0.5, Math.min(1, trials / REFERENCE_PVT_TRIALS)),
    face: quality.faceHasEyelidMeasures ? 1 : 0.6,
  };
}

/** KSS (1-9, higher = sleepier) converted to a z-score-like signal: 5 is neutral, each point
 * away from 5 is worth roughly 0.5 SD, sign-flipped so higher z = more alert (consistent with
 * the other signals, where positive z means better-than-baseline). */
export function kssToZ(kss: number): number {
  return (5 - kss) * 0.5;
}

/**
 * Sleep debt converted to a z-score-like signal: every ~2h owed costs about 1 SD of alertness.
 *
 * Bounded, which it was not. The ledger can legitimately reach 24 hours, and `-(24/2)` is a z of
 * -12 — twelve standard deviations. In a weighted average of z-scores where every other term lives
 * inside roughly ±3, a term that large stops being one input among four and becomes the answer: the
 * reaction test, the face scan and the user's own rating are arithmetically unable to move a score
 * that debt has already pinned to zero. Clamped at -3, which is the edge of the range the other
 * three signals can reach, so debt can dominate the fusion only as far as any other signal could.
 */
export const MAX_ABS_Z = 3;

export function debtToZ(compositeDebtHours: number): number {
  return Math.max(-MAX_ABS_Z, -(compositeDebtHours / 2));
}

export function fuseSDI({ zPvt, zFace, zKss, zDebt, precision }: SDIInputs): SDIResult {
  // Defaults to full precision so a caller with nothing to say about measurement quality gets the
  // base weights unchanged.
  const q = precision ?? { pvt: 1, face: 1 };
  const parts: { z: number; w: number }[] = [];
  if (zPvt != null) parts.push({ z: zPvt, w: BASE_WEIGHTS.pvt * q.pvt });
  if (zFace != null) parts.push({ z: zFace, w: BASE_WEIGHTS.face * q.face });
  if (zKss != null) parts.push({ z: zKss, w: BASE_WEIGHTS.kss });
  if (zDebt != null) parts.push({ z: zDebt, w: BASE_WEIGHTS.debt });

  const signalsUsed = parts.length;
  if (signalsUsed === 0) {
    return { sdi: 50, confidence: 'low', signalsUsed: 0 };
  }

  const weightSum = parts.reduce((a, p) => a + p.w, 0);
  const weighted = parts.reduce((a, p) => a + (p.w / weightSum) * p.z, 0);

  const sdi = Math.max(0, Math.min(100, Math.round(50 + 10 * weighted)));
  const confidence = signalsUsed >= 4 ? 'high' : signalsUsed >= 2 ? 'medium' : 'low';

  return { sdi, confidence, signalsUsed };
}

export function sdiWord(sdi: number): string {
  return sdi >= 70 ? 'Sharp' : sdi >= 50 ? 'Running low' : 'Depleted';
}
