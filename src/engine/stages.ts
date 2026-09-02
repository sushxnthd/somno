/**
 * Which kind of sleep a short night actually costs you.
 *
 * This replaces a stage split derived from the semi-Markov simulation in recovery.ts, which could
 * not support one. Three separate faults, each demonstrable:
 *
 *  1. **Two incompatible matrices were being averaged.** `ALERT_MATRIX` has a zero diagonal, which
 *     makes it an *embedded jump chain* — it says which stage comes next, and the sojourn
 *     distribution says how long you stay. `DROWSY_MATRIX` has a dominant diagonal (0.46 / 0.97 /
 *     0.94), which makes it a *per-epoch* chain — the diagonal is the dwell time, and at 30-second
 *     epochs it implies bouts of 1.9, 33.7 and 16.4 epochs, i.e. about 1, 17 and 8 minutes. Those
 *     are two different mathematical objects. Convex-mixing them is not a model of anything, and
 *     applying a Weibull sojourn on top of the mixture double-counts duration for one of them.
 *
 *  2. **A single stochastic realisation was used as a point estimate.** An eight-hour night is
 *     roughly twenty jumps of a three-state chain. One walk of twenty steps has enormous variance,
 *     so the "stage proportions" swung with the seed rather than with the input: REM came out at
 *     0.0%, 17.9%, 9.7%, 38.9% and 0.0% for SDI 50, 40, 30, 20 and 10. Not monotonic, not stable,
 *     not a measurement.
 *
 *  3. **The result was structurally wrong even on average.** The simulation produced 3-10% REM
 *     against its own healthy reference of 20%, so `ref.REM - sim.REM` was always large and always
 *     dominated the normalisation. Every user was told that essentially all of their sleep debt was
 *     REM debt and none of it was NREM, regardless of what they had slept.
 *
 * What replaces it needs no free parameters and no simulation, because the question is simpler than
 * the old code treated it. Sleep architecture is not uniform across the night: slow-wave sleep is
 * concentrated in the first half and REM periods lengthen towards morning, so *which* sleep you lose
 * depends on *where* the loss falls. Curtailment — going to bed late, or waking early, which is what
 * a short night is — removes sleep from the end. The end is the REM-rich part. So a short night
 * costs disproportionately more REM than NREM, and the size of that skew follows directly from the
 * published within-night distribution rather than from anything fitted here.
 *
 * References
 *  - Carskadon MA, Dement WC (2011). Normal human sleep: an overview. *Principles and Practice of
 *    Sleep Medicine*, 5th ed., 16–26. — the canonical description of the night's architecture:
 *    SWS dominant in the first third, REM periods lengthening across successive cycles, and the
 *    ~20-25% REM / ~75-80% NREM split of a consolidated adult night.
 *  - Van Cauter E, Spiegel K, Tasali E, Leproult R (2008). Metabolic consequences of sleep and sleep
 *    loss. *Sleep Medicine* 9(Suppl 1):S23-S28. — curtailment removes late sleep preferentially.
 *  - Born J, Rasch B, Gais S (2006). Sleep to remember. *The Neuroscientist* 12(5):410-424. — the
 *    functional asymmetry between early SWS-rich and late REM-rich sleep, which is why the
 *    distinction is worth showing at all.
 *
 * Deterministic: the same night always gives the same answer, with no seed anywhere.
 */

/** A consolidated night, in thirds, as proportions of *sleep* (wake is handled separately). */
interface Third {
  nrem: number;
  rem: number;
}

/**
 * The night in thirds — and exactly how much of this is measured and how much is interpolated.
 *
 * Worth stating plainly, because a citation next to a number can imply the number came from the
 * paper. These three pairs did not. What is published, and is not in doubt:
 *
 *  - REM periods lengthen across successive cycles, from a few minutes in the first to thirty or
 *    forty in the last; slow-wave sleep is concentrated in the first two cycles and is close to
 *    absent by the final third. (Carskadon & Dement.)
 *  - A consolidated adult night is roughly 75-80% NREM and 20-25% REM overall. (Same.)
 *
 * What is interpolated: the specific per-third split. The values below are the simplest monotone
 * table consistent with both published facts — a rising REM share whose equal-weighted mean lands
 * at 22.7%, inside the published 20-25% band. They are a population summary, not a fitted result,
 * and no individual's night is claimed to look like this.
 *
 * The reason that is acceptable rather than a dressed-up guess is that the app's conclusion does not
 * depend on the interpolation. What the Recovery screen says is *ordinal* — a short night costs
 * proportionally more REM than a long one does — and that follows from the published monotonicity
 * alone. `scripts/test-stages.ts` perturbs this table across the full range the literature permits
 * and asserts the ordering survives every version of it. If the conclusion needed these exact
 * numbers, it would not be a conclusion worth showing.
 */
const NIGHT_THIRDS: readonly Third[] = [
  { nrem: 0.92, rem: 0.08 },
  { nrem: 0.8, rem: 0.2 },
  { nrem: 0.6, rem: 0.4 },
] as const;

/** Fraction of time in bed spent awake in a normal night — sleep onset plus brief arousals. */
const NORMAL_WAKE_FRACTION = 0.05;

export interface StageLoss {
  /** Hours of NREM the shortfall cost. */
  nremHours: number;
  /** Hours of REM the shortfall cost. */
  remHours: number;
  /**
   * Hours of extra wakefulness. Curtailment does not create wake — a shorter night has *less* of
   * it — so this is the fragmentation term, and it is zero unless the night was measurably broken.
   */
  wakeHours: number;
}

const round1 = (n: number) => Number(n.toFixed(1));

/**
 * How a shortfall divides across the stages it was taken from.
 *
 * `needHours` and `actualHours` are the personal sleep need and what was actually slept — the same
 * two numbers the debt ledger works from. `restedFraction` is the user's own "how rested did you
 * feel" rating as a 0..1 value, and is the only thing here that can produce a wake component: a
 * night of the right length that felt unrestful is a fragmented night, and fragmentation costs
 * sleep continuity rather than sleep duration.
 *
 * Integrating over the tail of the night rather than scaling a flat average is the whole point. A
 * one-hour shortfall comes entirely out of the final third and is ~40% REM; a four-hour shortfall
 * eats the final third and most of the middle one, and its REM share falls towards the whole-night
 * average. That gradient is the finding the screen is actually showing.
 */
export function stageLoss(needHours: number, actualHours: number, restedFraction = 1): StageLoss {
  const shortfall = Math.max(0, needHours - actualHours);
  const sleepNeed = Math.max(0.1, needHours * (1 - NORMAL_WAKE_FRACTION));

  let nrem = 0;
  let rem = 0;
  let remaining = Math.min(shortfall, sleepNeed);

  // Walk the night backwards: curtailment takes the last hour first.
  const thirdLength = sleepNeed / NIGHT_THIRDS.length;
  for (let i = NIGHT_THIRDS.length - 1; i >= 0 && remaining > 0; i--) {
    const taken = Math.min(remaining, thirdLength);
    nrem += taken * NIGHT_THIRDS[i].nrem;
    rem += taken * NIGHT_THIRDS[i].rem;
    remaining -= taken;
  }

  // Fragmentation: an unrestful night of adequate length lost continuity rather than hours. Scaled
  // against the night's normal wake fraction so it stays a correction, never the headline.
  const unrest = Math.max(0, Math.min(1, 1 - restedFraction));
  const wake = unrest * needHours * NORMAL_WAKE_FRACTION * 2;

  return { nremHours: round1(nrem), remHours: round1(rem), wakeHours: round1(wake) };
}

/**
 * The same split, scaled to a debt that has accumulated over several nights.
 *
 * The ledger's total is the authority on *how much* is owed; this decides *what kind*. Scaling the
 * per-night shape rather than re-deriving it keeps the two consistent — the stage figures always
 * add up to the composite total the rest of the app shows, which the old simulation could not
 * guarantee because its numerator and denominator came from different places.
 */
export function splitAccumulatedDebt(
  compositeDebtHours: number,
  needHours: number,
  typicalActualHours: number,
  restedFraction = 1
): StageLoss & { compositeDebtHours: number } {
  const shape = stageLoss(needHours, typicalActualHours, restedFraction);
  const shapeTotal = shape.nremHours + shape.remHours + shape.wakeHours;

  if (compositeDebtHours <= 0 || shapeTotal <= 0) {
    return { nremHours: 0, remHours: 0, wakeHours: 0, compositeDebtHours: Math.max(0, round1(compositeDebtHours)) };
  }

  const scale = compositeDebtHours / shapeTotal;
  return {
    nremHours: round1(shape.nremHours * scale),
    remHours: round1(shape.remHours * scale),
    wakeHours: round1(shape.wakeHours * scale),
    compositeDebtHours: round1(compositeDebtHours),
  };
}
