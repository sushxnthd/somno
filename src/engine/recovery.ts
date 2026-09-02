// Semi-Markov sleep-stage engine — what it is for, and what it is not good enough for.
//
// The transition matrices and bump factors come from Somno_03_Technical_Architecture.md §5.2, which
// cites Wang et al. / Jääskinen et al. / Sallinen et al. but gives no Weibull sojourn parameters;
// the ones below are plausible seeds for adult stage durations, not fitted values.
//
// That matters, and it used to matter invisibly. This engine's output was being used to divide the
// user's sleep debt into Wake/NREM/REM hours on the Recovery screen — a number with three
// significant figures resting on unfitted parameters, a matrix incoherence fixed below, and a single
// stochastic realisation of a twenty-step chain. Measured across SDI, that produced REM shares of
// 0%, 17.9%, 9.7%, 38.9% and 0% — noise, presented as a finding. The per-stage split now comes from
// engine/stages.ts, which needs no fitted parameters because it asks a question the published
// architecture already answers.
//
// What remains here is the hypnogram *shape* on the Home screen, which is labelled as modelled
// rather than measured, and `recoveryTrajectory`. Neither claims a precise stage duration. Do not
// route a user-facing number back through this engine without fitting the sojourn parameters first.
//
// Smart Wake used to be the exception, and is not any more: it no longer moves the alarm earlier,
// because doing so meant waking someone in a stage nothing had measured. See alarmScheduler.ts.

export type Stage = 'Wake' | 'NREM' | 'REM';
const STAGES: Stage[] = ['Wake', 'NREM', 'REM'];

export type TransitionMatrix = Record<Stage, Record<Stage, number>>;

export const ALERT_MATRIX: TransitionMatrix = {
  Wake: { Wake: 0, NREM: 0.9632, REM: 0.0368 },
  NREM: { Wake: 0.8093, NREM: 0.0, REM: 0.1907 },
  REM: { Wake: 0.6655, NREM: 0.3345, REM: 0 },
};

export const DROWSY_MATRIX: TransitionMatrix = {
  Wake: { Wake: 0.4645, NREM: 0.4905, REM: 0.045 },
  NREM: { Wake: 0.0172, NREM: 0.9703, REM: 0.0124 },
  REM: { Wake: 0.017, NREM: 0.044, REM: 0.939 },
};

/**
 * Placeholder Weibull(shape k, scale λ) params per stage, in minutes — see file header.
 *
 * **These do not reproduce a published night, and now that the occupancy is solved exactly rather
 * than sampled, that is visible instead of hidden.** `expectedStageProportions` at the alert end
 * returns roughly 17% Wake / 71% NREM / 12% REM, against a consolidated adult night's ~5% / ~75-80%
 * / ~20-25% (Carskadon & Dement 2011).
 *
 * It cannot be fixed by retuning these numbers, which is worth stating because retuning is the
 * obvious move. Occupancy is `π_i · m_i` normalised, and the embedded ALERT chain has
 * π_REM = 0.103: reaching a 20% REM share from a tenth of the transitions requires a mean REM bout
 * of ~49 minutes, against ~41 for NREM. Real REM periods are *shorter* than the NREM periods they
 * follow, so the only sojourn times that would reproduce the right night are ones no night has.
 * The inconsistency is between the transition matrix and the published architecture, not in the
 * sojourn parameters, and closing it means refitting the matrix against the source data.
 *
 * What follows from that, and is enforced by `scripts/test-stages.ts`: no user-facing number is
 * derived from this chain. The per-stage debt split comes from stages.ts, which models curtailment
 * against published within-night architecture directly. The hypnogram drawn from `simulateHypnogram`
 * is labelled as modelled rather than measured everywhere it appears. Smart Wake no longer consults
 * this engine at all — it does not move the alarm — so what remains is the Recovery screen's
 * modelled hypnogram and `recoveryTrajectory`, neither of which claims a stage duration.
 */
export const SOJOURN_WEIBULL: Record<Stage, { k: number; lambda: number }> = {
  Wake: { k: 1.3, lambda: 6 },
  NREM: { k: 1.8, lambda: 24 },
  REM: { k: 1.6, lambda: 16 },
};

/** Weibull distribution mean: λ · Γ(1 + 1/k). Used for deterministic expected sojourn time
 * (the simulation below is run on expectations, not stochastic sampling, so repeated renders
 * of the same inputs are stable). */
function weibullMean(k: number, lambda: number): number {
  return lambda * gamma(1 + 1 / k);
}

// Lanczos approximation for the gamma function (good to ~1e-10 for our small-argument range).
function gamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

export interface PersonalFactors {
  ageOver60?: boolean;
  highStress?: boolean;
  circadianMisaligned?: boolean;
  female?: boolean;
  sedative?: boolean;
  antidepressant?: boolean;
}

type Bump = { from: Stage; to: Stage; mult: number };

function bumpsFor(factors: PersonalFactors): Bump[] {
  const b: Bump[] = [];
  if (factors.ageOver60) {
    b.push({ from: 'Wake', to: 'NREM', mult: 0.9 }, { from: 'Wake', to: 'Wake', mult: 1.1 }, { from: 'NREM', to: 'Wake', mult: 1.2 }, { from: 'REM', to: 'Wake', mult: 1.1 });
  }
  if (factors.highStress) {
    b.push({ from: 'NREM', to: 'Wake', mult: 1.2 }, { from: 'Wake', to: 'NREM', mult: 0.9 }, { from: 'REM', to: 'NREM', mult: 1.1 }, { from: 'REM', to: 'Wake', mult: 1.2 });
  }
  if (factors.circadianMisaligned) {
    b.push({ from: 'Wake', to: 'NREM', mult: 0.9 }, { from: 'REM', to: 'Wake', mult: 1.1 });
  }
  if (factors.female) {
    b.push({ from: 'Wake', to: 'NREM', mult: 1.05 }, { from: 'NREM', to: 'Wake', mult: 0.9 }, { from: 'NREM', to: 'REM', mult: 1.1 });
  }
  if (factors.sedative) {
    b.push({ from: 'NREM', to: 'Wake', mult: 0.8 }, { from: 'Wake', to: 'NREM', mult: 1.1 });
  }
  if (factors.antidepressant) {
    b.push({ from: 'NREM', to: 'REM', mult: 0.7 });
  }
  return b;
}

function applyBumpsAndRenormalize(matrix: TransitionMatrix, factors: PersonalFactors): TransitionMatrix {
  const bumps = bumpsFor(factors);
  const out: TransitionMatrix = { Wake: { ...matrix.Wake }, NREM: { ...matrix.NREM }, REM: { ...matrix.REM } };
  for (const b of bumps) out[b.from][b.to] *= b.mult;
  for (const s of STAGES) {
    const row = out[s];
    const sum = row.Wake + row.NREM + row.REM;
    if (sum > 0) {
      row.Wake /= sum;
      row.NREM /= sum;
      row.REM /= sum;
    }
  }
  return out;
}

/**
 * Converts a per-epoch transition matrix into the embedded jump chain a semi-Markov walk needs.
 *
 * The two matrices above are not the same kind of object, and for a long time this file averaged
 * them as though they were. `ALERT_MATRIX` has a zero diagonal: it is already an embedded chain,
 * saying only which stage follows which, with the sojourn distribution supplying the duration.
 * `DROWSY_MATRIX` has a dominant diagonal — 0.4645, 0.9703, 0.9390 — which is what a *per-epoch*
 * chain looks like, where staying put is most of what happens each epoch and the mean dwell is
 * 1/(1 - p_ii) epochs. At 30-second epochs that is 0.9, 16.9 and 8.2 minutes, which are recognisable
 * NREM and REM bout lengths, so the numbers are coherent — as a different kind of matrix.
 *
 * Mixing them convexly produced a chain that was neither, and then `simulateNight` applied a Weibull
 * sojourn on top, double-counting duration for whichever part came from the per-epoch matrix.
 *
 * The conversion is the standard one: P'(i→j) = P(i→j) / (1 - P(i→i)) for j ≠ i, with a zero
 * diagonal. It preserves the source matrix's relative jump probabilities exactly and moves the
 * dwell information where a semi-Markov process expects it.
 */
export function toEmbeddedChain(matrix: TransitionMatrix): TransitionMatrix {
  const out: TransitionMatrix = { Wake: { ...matrix.Wake }, NREM: { ...matrix.NREM }, REM: { ...matrix.REM } };
  for (const from of STAGES) {
    const selfP = out[from][from];
    out[from][from] = 0;
    const rest = 1 - selfP;
    if (rest <= 1e-9) {
      // A state that never leaves itself cannot be represented as a jump chain; spread it evenly
      // rather than divide by zero, and let the sojourn distribution carry the duration.
      for (const to of STAGES) out[from][to] = to === from ? 0 : 0.5;
      continue;
    }
    for (const to of STAGES) if (to !== from) out[from][to] /= rest;

    // Normalised against the row's own total rather than against `rest`. The source matrix is
    // quoted to four decimal places and one of its rows sums to 0.9999, so dividing by (1 - p_ii)
    // alone leaves a row that is 0.34% short of being a probability distribution. Small, but a
    // transition matrix that does not sum to one is not a transition matrix, and the error
    // compounds over a twenty-step walk.
    const total = out[from].Wake + out[from].NREM + out[from].REM;
    if (total > 0) for (const to of STAGES) out[from][to] /= total;
  }
  return out;
}

/** Convex mix of the alert/drowsy matrices, weighted by normalized sleep-deprivation level x = 1 - SDI/100. */
export function lowVigilanceMatrix(sdi: number, factors: PersonalFactors = {}): TransitionMatrix {
  const x = Math.max(0, Math.min(1, 1 - sdi / 100));
  // Both reduced to embedded chains first, so the mixture is of like with like.
  const alert = applyBumpsAndRenormalize(toEmbeddedChain(ALERT_MATRIX), factors);
  const drowsy = applyBumpsAndRenormalize(toEmbeddedChain(DROWSY_MATRIX), factors);
  const mix: TransitionMatrix = { Wake: { Wake: 0, NREM: 0, REM: 0 }, NREM: { Wake: 0, NREM: 0, REM: 0 }, REM: { Wake: 0, NREM: 0, REM: 0 } };
  for (const from of STAGES) {
    for (const to of STAGES) {
      mix[from][to] = (1 - x) * alert[from][to] + x * drowsy[from][to];
    }
  }
  return mix;
}

export interface StageTimeMinutes {
  Wake: number;
  NREM: number;
  REM: number;
}

// Small deterministic PRNG (mulberry32) so the same inputs always produce the same simulated
// night — the transition *sampling* is stochastic (matching the real probabilities, including
// REM, which a naive "always pick the most likely next stage" walk would never reach since
// NREM->Wake outweighs NREM->REM in both base matrices), but repeated calls with identical
// arguments are stable across re-renders instead of flickering.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

function sampleNextStage(row: Record<Stage, number>, rand: number): Stage {
  const sum = row.Wake + row.NREM + row.REM || 1;
  const r = rand * sum;
  if (r < row.Wake) return 'Wake';
  if (r < row.Wake + row.NREM) return 'NREM';
  return 'REM';
}

/**
 * The stationary distribution of an embedded jump chain — the share of *transitions* into each
 * stage, solved rather than sampled.
 *
 * Solves πP = π subject to Σπ = 1 by Gaussian elimination on (Pᵀ − I) with the last row replaced by
 * the normalisation constraint. Exact for a chain this size, and it terminates: no iteration count,
 * no convergence tolerance, no seed.
 *
 * Power iteration would have been shorter and is the usual reflex, but an embedded chain has a zero
 * diagonal by construction, and a chain with no self-loops can be periodic — in which case power
 * iteration oscillates forever instead of converging. Solving the linear system has no opinion about
 * periodicity.
 */
export function stationaryDistribution(matrix: TransitionMatrix): Record<Stage, number> {
  const n = STAGES.length;
  // Rows of the augmented system. First n-1 rows: (Pᵀ − I)π = 0. Last row: Σπ = 1.
  const a: number[][] = [];
  for (let i = 0; i < n - 1; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) row.push((matrix[STAGES[j]][STAGES[i]] ?? 0) - (i === j ? 1 : 0));
    row.push(0);
    a.push(row);
  }
  a.push([...STAGES.map(() => 1), 1]);

  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) continue;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = a[r][col] / a[col][col];
      for (let c = col; c <= n; c++) a[r][c] -= factor * a[col][c];
    }
  }

  const out = { Wake: 0, NREM: 0, REM: 0 } as Record<Stage, number>;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.abs(a[i][i]) > 1e-12 ? a[i][n] / a[i][i] : 0;
    // Negative mass is numerical dust, not a probability.
    const clamped = Math.max(0, v);
    out[STAGES[i]] = clamped;
    total += clamped;
  }
  if (total <= 0) return { Wake: 1 / 3, NREM: 1 / 3, REM: 1 / 3 } as Record<Stage, number>;
  for (const s of STAGES) out[s] /= total;
  return out;
}

/**
 * How a night divides between the stages — the exact expectation of the semi-Markov process.
 *
 * This is the standard limiting result for a semi-Markov process, and it is worth writing out
 * because the distinction it turns on is exactly the one the old code got wrong:
 *
 *     p_i  =  π_i · m_i  /  Σ_j π_j · m_j
 *
 * π is the stationary distribution of the *embedded jump chain* — how often the process enters each
 * stage. m is the *mean sojourn time* in each stage. The share of transitions is not the share of
 * time: Wake is entered often and left quickly, NREM is entered less and held for far longer, and
 * only the product of the two is an occupancy. π alone would say a night is mostly Wake.
 *
 * What this replaces was a forward walk: sample a next stage from the row, dwell for its Weibull
 * mean, repeat, and total it up. That is a single realisation of a stochastic process being used as
 * a point estimate, and across a ~20-jump night its variance is enormous — the REM share swung
 * between 0% and 39% depending only on the seed. Every one of those walks was an unbiased draw from
 * the distribution whose mean is the line above, so computing the mean directly is not an
 * approximation of the simulation. It is what the simulation was noisily trying to estimate.
 *
 * Deterministic by construction: same inputs, same answer, no seed anywhere.
 */
export function expectedStageProportions(sdi: number, factors: PersonalFactors = {}): StageTimeMinutes {
  const embedded = lowVigilanceMatrix(sdi, factors);
  const pi = stationaryDistribution(embedded);

  let total = 0;
  const weighted = {} as StageTimeMinutes;
  for (const s of STAGES) {
    const { k, lambda } = SOJOURN_WEIBULL[s];
    const occupancy = pi[s] * weibullMean(k, lambda);
    weighted[s] = occupancy;
    total += occupancy;
  }
  if (total <= 0) return { ...HEALTHY_REFERENCE_PROPORTIONS };
  for (const s of STAGES) weighted[s] /= total;
  return weighted;
}

/**
 * Minutes in each stage across a night of `totalMinutes`.
 *
 * Now the exact expectation scaled to the night's length, rather than one seeded walk through it.
 * `startStage` no longer appears: a starting state matters for the first twenty minutes of a night
 * and not for its totals, and pretending otherwise was part of what made the old answer swing.
 */
export function simulateNight(sdi: number, totalMinutes = 480, factors: PersonalFactors = {}): StageTimeMinutes {
  const p = expectedStageProportions(sdi, factors);
  return { Wake: p.Wake * totalMinutes, NREM: p.NREM * totalMinutes, REM: p.REM * totalMinutes };
}

export interface HypnogramSegment {
  stage: Stage;
  /** Minutes from the start of the night at which this segment begins. */
  atMin: number;
  /** How long the walk stays in this stage. */
  durationMin: number;
}

/**
 * The same walk as `simulateNight`, but keeping the sequence rather than only the totals.
 *
 * This is a *model* of a night, not a measurement of one, and the UI has to say so: without a
 * wearable there is no way to know when someone actually entered REM. What makes it worth showing
 * anyway is that it is driven entirely by that user's own inputs — the duration they logged, their
 * measured SDI, their own personalisation factors — so it is the app's honest best estimate of the
 * shape of their night rather than a stock illustration.
 *
 * Seeded on the same inputs, so the same night always draws the same chart.
 */
export function simulateHypnogram(
  sdi: number,
  totalMinutes = 480,
  factors: PersonalFactors = {},
  startStage: Stage = 'Wake'
): HypnogramSegment[] {
  const P = lowVigilanceMatrix(sdi, factors);
  const rand = mulberry32(
    hashSeed(
      sdi,
      totalMinutes,
      startStage,
      factors.ageOver60 ? 1 : 0,
      factors.highStress ? 1 : 0,
      factors.circadianMisaligned ? 1 : 0,
      factors.female ? 1 : 0,
      factors.sedative ? 1 : 0,
      factors.antidepressant ? 1 : 0
    )
  );
  const out: HypnogramSegment[] = [];
  let stage = startStage;
  let elapsed = 0;
  let guard = 0;
  while (elapsed < totalMinutes && guard < 400) {
    guard++;
    const { k, lambda } = SOJOURN_WEIBULL[stage];
    const dwell = Math.min(weibullMean(k, lambda), totalMinutes - elapsed);
    out.push({ stage, atMin: elapsed, durationMin: dwell });
    elapsed += dwell;
    stage = sampleNextStage(P[stage], rand());
  }
  return out;
}

/**
 * How easily someone can be woken from each stage, highest first.
 *
 * Waking out of deep NREM is what produces the worst sleep inertia; REM and light sleep are far
 * kinder. This ordering is the whole basis of a smart-wake window.
 */

/*
 * `smartWakeOffsetMin` and its WAKEABILITY table were removed here rather than deprecated.
 *
 * They simulated the night forward and rang the alarm at the "most wakeable" minute of a 30-minute
 * window. Nothing in this app measures sleep stages — no wearable, no microphone, no motion — so
 * the stage it woke someone in was a property of a population model seeded with yesterday's score,
 * not of the person in the bed. Costing a user up to twenty-nine minutes of real sleep on an
 * unmeasured prediction is not a feature, and the debt ledger would then have counted the shortfall.
 *
 * Smart Wake now means: the alarm fires when set, offers a wake check-in, and adapts the *snooze*
 * to the SDI that check-in measured moments earlier. `simulateHypnogram` remains for the Recovery
 * screen's modelled night, which is labelled as modelled everywhere it appears.
 */

/** A healthy adult's typical 8h stage-time proportions, used as the recovery reference. */
export const HEALTHY_REFERENCE_PROPORTIONS: StageTimeMinutes = { Wake: 0.05, NREM: 0.75, REM: 0.2 };

export interface DebtHours {
  wakeDebtHours: number;
  nremDebtHours: number;
  remDebtHours: number;
  compositeDebtHours: number;
}

/**
 * The per-stage split used to live here, and no longer does — see engine/stages.ts.
 *
 * Deleted rather than deprecated. It was the only thing turning this engine's output into a number
 * the user read, and leaving a working function behind is an invitation to wire it back in the next
 * time a screen wants a stage breakdown. `HEALTHY_REFERENCE_PROPORTIONS` stays because stages.ts's
 * own table is checked against it.
 */

/** Recovery isn't 1-for-1 (Carskadon & Dement, per the doc): each additional night of good
 * sleep repays a shrinking fraction of the outstanding debt, producing the plateau shape the
 * Recovery tab is meant to show rather than a naive linear subtraction. */
export function recoveryTrajectory(startingDebtHours: number, nights: number, nightlyRepayFraction = 0.35): number[] {
  const out: number[] = [];
  let debt = startingDebtHours;
  for (let i = 0; i < nights; i++) {
    out.push(Number(debt.toFixed(1)));
    debt = Math.max(0, debt - debt * nightlyRepayFraction);
  }
  return out;
}

/** Recommended bedtime tonight: pull earlier roughly in proportion to composite debt, capped at
 * 45 minutes, on top of the user's usual bedtime. The cap is deliberately modest — the design
 * recommends 45 minutes against a 4.2h debt, and a shift much larger than that is not a change
 * most people actually make, so it would cost adherence rather than buy sleep. */
export const MAX_BEDTIME_PULL_MIN = 45;
export function recommendedBedtimeMin(usualBedMin: number, compositeDebtHours: number): number {
  const pullMinutes = Math.min(MAX_BEDTIME_PULL_MIN, Math.round(compositeDebtHours * 20));
  return (((usualBedMin - pullMinutes) % 1440) + 1440) % 1440;
}

/** A short afternoon nap window is suggested once debt crosses a noticeable threshold. */
export function napWindow(compositeDebtHours: number): { startMin: number; endMin: number } | null {
  if (compositeDebtHours < 2) return null;
  // Early afternoon, inside the post-lunch circadian dip and far enough from evening not to eat
  // into sleep pressure for the night. 30 minutes keeps the nap short of slow-wave sleep, so it
  // ends without sleep inertia.
  const startMin = 13 * 60 + 30;
  return { startMin, endMin: startMin + 30 };
}
