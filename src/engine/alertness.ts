/**
 * The Three-Process Model of alertness (Åkerstedt & Folkard).
 *
 * Somno's scores were, until this file existed, missing the single largest source of variation in
 * human alertness: the time of day. A check-in at 7am and one at 3pm are not comparable
 * measurements of the same person, and the app was comparing them anyway — then telling the user
 * their score had dropped. The one at 4am, taken thirty seconds after an alarm, was worse still.
 *
 * The model has three terms, and the app needs all three for different reasons:
 *
 *   S  homeostatic sleep pressure. Rises exponentially with time awake, falls exponentially during
 *      sleep. This is the part sleep debt accumulates in.
 *   C  the circadian process. A 24-hour sinusoid plus its 12-hour harmonic — the harmonic is what
 *      produces the post-lunch dip, which is a real feature of the data and not a metaphor.
 *   W  sleep inertia. A steep exponential decay over the first ~30-60 minutes after waking. This is
 *      why an alarm-time PVT is not a measurement of how rested you are.
 *
 * Alertness = S + C + W, on the model's own scale, which maps to KSS.
 *
 * Parameters follow the published formulation (Åkerstedt, Folkard & Portin; Åkerstedt & Folkard
 * 1997, and the sleep-inertia term from Åkerstedt et al. 2008). They are constants of the model,
 * not fitted to this user — the personal part of Somno is that every measurement is expressed as a
 * deviation from that user's own baseline *at the same phase*, which is what this file makes
 * possible.
 *
 * Deliberately not claimed: this is a group-level model of alertness, not a diagnosis, and not a
 * measurement of an individual's circadian phase. It is used to make comparisons fair and to
 * suggest timing — never to tell someone something about their health.
 *
 * Pure: no React Native, no store. scripts/test-alertness.ts drives it directly.
 */

/** The model's alertness scale runs 1..16, high = alert. KSS is its inverse, 1..9, low = alert. */
export const ALERTNESS_MAX = 16;
export const ALERTNESS_MIN = 1;

/** Upper asymptote of S — the alertness of someone fully rested at their circadian peak. */
const S_UPPER = 14.3;
/** Lower asymptote reached with prolonged wakefulness. */
const S_LOWER = 2.4;
/** Time constant of the rise in sleep pressure while awake, in hours. */
const TAU_WAKE = 40 / 3;
/** Time constant of its dissipation during sleep, in hours. Recovery is much faster than decline. */
const TAU_SLEEP = 4.2;

/** Amplitude of the 24h circadian component, in alertness units. */
const C_AMPLITUDE = 2.5;
/** Amplitude of the 12h harmonic — this is the term that creates the afternoon dip. */
const C_HARMONIC = 0.9;
/**
 * Hour at which the circadian component peaks for a person whose natural wake time is 07:00.
 * The peak sits mid-to-late afternoon; the trough falls in the early hours, around 05:00.
 */
const C_PEAK_HOUR = 16.8;
/**
 * Phase of the 12-hour harmonic.
 *
 * Peaking at 08:00 and 20:00 puts its troughs at 02:00 and 14:00 — which is what makes the curve
 * bimodal in the way the data is: a morning peak, the post-lunch dip, an evening peak, the night
 * trough. Get this phase wrong and the model predicts people are at their sharpest at 2pm.
 */
const C_HARMONIC_PEAK_HOUR = 8.0;

/** Sleep inertia's magnitude in the first moments after waking, in alertness units. */
const W_MAGNITUDE = 5.7;
/** Its decay time constant, in hours. About 80% is gone by 40 minutes. */
const TAU_INERTIA = 0.33;

export interface AlertnessInputs {
  /** Hours since waking. Negative values are treated as 0. */
  hoursAwake: number;
  /** Local clock time as a decimal hour, 0..24. */
  clockHour: number;
  /**
   * Alertness at the moment of waking, on the 1..16 scale. Defaults to the level a full night
   * produces; a short night lowers it, which is how sleep debt enters the model.
   */
  wakeLevel?: number;
  /**
   * The user's natural wake time as a decimal hour, used to shift the circadian phase. An evening
   * type's trough and peak both sit later. Defaults to 07:00.
   */
  naturalWakeHour?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Circadian component at a given clock hour.
 *
 * Phase is shifted by the difference between this person's natural wake time and the 07:00 the
 * published parameters assume — the standard way to carry chronotype into the model without
 * pretending to have measured someone's melatonin onset.
 */
export function circadianComponent(clockHour: number, naturalWakeHour = 7): number {
  const shift = naturalWakeHour - 7;
  const h = clockHour - shift;
  const main = C_AMPLITUDE * Math.cos((2 * Math.PI * (h - C_PEAK_HOUR)) / 24);
  const harmonic = C_HARMONIC * Math.cos((2 * Math.PI * (h - C_HARMONIC_PEAK_HOUR)) / 12);
  return main + harmonic;
}

/** Homeostatic component after a given time awake, starting from `wakeLevel`. */
export function homeostaticComponent(hoursAwake: number, wakeLevel = S_UPPER): number {
  const t = Math.max(0, hoursAwake);
  return S_LOWER + (wakeLevel - S_LOWER) * Math.exp(-t / TAU_WAKE);
}

/** Sleep inertia at a given time after waking. Always negative or zero. */
export function inertiaComponent(hoursAwake: number): number {
  const t = Math.max(0, hoursAwake);
  return -W_MAGNITUDE * Math.exp(-t / TAU_INERTIA);
}

/**
 * How alert the model expects this person to be, right now, on the 1..16 scale.
 *
 * This is the *expectation*, not a measurement. Its job is to be subtracted: a PVT that is 40ms
 * slower than baseline means something very different at 3pm than at 4am, and the difference
 * between the two expectations is exactly how much of that 40ms the clock explains.
 */
export function predictedAlertness({
  hoursAwake,
  clockHour,
  wakeLevel = S_UPPER,
  naturalWakeHour = 7,
}: AlertnessInputs): number {
  const total =
    homeostaticComponent(hoursAwake, wakeLevel) +
    circadianComponent(clockHour, naturalWakeHour) +
    inertiaComponent(hoursAwake);
  return clamp(total, ALERTNESS_MIN, ALERTNESS_MAX);
}

/**
 * The alertness level a night of a given length leaves you waking at.
 *
 * Sleep dissipates homeostatic pressure exponentially, so the first hours of a night restore far
 * more than the last — which is exactly why a five-hour night is much worse than five-eighths of
 * an eight-hour one, and why "catching up" plateaus.
 */
export function wakeLevelAfterSleep(sleepHours: number, levelAtBedtime: number): number {
  const t = Math.max(0, sleepHours);
  return S_UPPER - (S_UPPER - levelAtBedtime) * Math.exp(-t / TAU_SLEEP);
}

/** Model alertness (1..16, high = alert) to the KSS scale (1..9, low = alert). */
export function alertnessToKss(alertness: number): number {
  const scaled = 1 + ((ALERTNESS_MAX - alertness) * 8) / (ALERTNESS_MAX - ALERTNESS_MIN);
  return clamp(Number(scaled.toFixed(1)), 1, 9);
}

/**
 * How much of a measured change the time of day explains, as a z-score adjustment.
 *
 * A check-in is compared against the user's own baseline, which was recorded at some particular
 * hour. If today's check-in is at a different hour, part of any difference is the clock rather
 * than the person. This returns the expected difference in the same units the fused score uses, so
 * it can be subtracted before drawing a conclusion.
 *
 * The divisor converts alertness units to z: roughly 3.6 alertness units span the range that PVT
 * z-scores of ±1 cover in the validation literature, so the conversion is deliberately
 * conservative — it removes most of the clock's contribution without over-correcting a real change
 * into invisibility.
 */
export const ALERTNESS_UNITS_PER_Z = 3.6;

export function circadianAdjustment(
  now: { hoursAwake: number; clockHour: number },
  baseline: { hoursAwake: number; clockHour: number },
  naturalWakeHour = 7
): number {
  const expectedNow = predictedAlertness({ ...now, naturalWakeHour });
  const expectedBaseline = predictedAlertness({ ...baseline, naturalWakeHour });
  return (expectedNow - expectedBaseline) / ALERTNESS_UNITS_PER_Z;
}

/**
 * The best and worst windows in the hours ahead.
 *
 * Sampled rather than solved: the sum of two cosines and an exponential has no tidy closed-form
 * maximum once inertia is involved, and a 15-minute grid is finer than any advice this could
 * usefully give.
 */
export interface AlertnessWindow {
  /** Minutes since midnight. */
  startMin: number;
  endMin: number;
  /** Mean predicted alertness across the window, 1..16. */
  level: number;
}

export function dailyAlertnessCurve({
  wakeHour,
  wakeLevel = S_UPPER,
  naturalWakeHour = 7,
  hours = 16,
  stepMin = 15,
}: {
  wakeHour: number;
  wakeLevel?: number;
  naturalWakeHour?: number;
  hours?: number;
  stepMin?: number;
}): { min: number; level: number }[] {
  const out: { min: number; level: number }[] = [];
  for (let t = 0; t <= hours * 60; t += stepMin) {
    const hoursAwake = t / 60;
    const clockHour = (wakeHour + hoursAwake) % 24;
    out.push({
      min: Math.round((wakeHour * 60 + t) % 1440),
      level: predictedAlertness({ hoursAwake, clockHour, wakeLevel, naturalWakeHour }),
    });
  }
  return out;
}

/** The highest sustained stretch of the curve, at least `minLengthMin` long. */
export function bestWindow(curve: { min: number; level: number }[], minLengthMin = 90, stepMin = 15): AlertnessWindow | null {
  const span = Math.max(1, Math.round(minLengthMin / stepMin));
  if (curve.length < span) return null;
  let best = { start: 0, mean: -Infinity };
  for (let i = 0; i + span <= curve.length; i++) {
    const slice = curve.slice(i, i + span);
    const mean = slice.reduce((a, p) => a + p.level, 0) / slice.length;
    if (mean > best.mean) best = { start: i, mean };
  }
  return {
    startMin: curve[best.start].min,
    endMin: curve[best.start + span - 1].min,
    level: Number(best.mean.toFixed(2)),
  };
}

/** The lowest sustained stretch — the afternoon dip, usually. */
export function worstWindow(curve: { min: number; level: number }[], minLengthMin = 60, stepMin = 15): AlertnessWindow | null {
  const inverted = curve.map((p) => ({ min: p.min, level: -p.level }));
  const w = bestWindow(inverted, minLengthMin, stepMin);
  return w ? { ...w, level: Number((-w.level).toFixed(2)) } : null;
}
