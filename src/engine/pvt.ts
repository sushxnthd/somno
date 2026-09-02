/**
 * PVT (Psychomotor Vigilance Task) scoring.
 *
 * The metric set follows Basner & Dinges (2011), "Maximizing sensitivity of the psychomotor
 * vigilance test to sleep loss", which compared the candidate outcomes head to head. Two of its
 * conclusions shape this file:
 *
 *  - **Reciprocal reaction time (1/RT, "response speed") is the most sensitive single outcome** and
 *    is the recommended primary measure. Mean RT is dominated by the slowest trials, so a night of
 *    sleep loss shows up in mean RT mostly as a handful of lapses; response speed uses the whole
 *    distribution, and the effect appears sooner and with less noise. Mean and median are still
 *    reported, because a user reading "312 ms" understands it and "3.2 s⁻¹" means nothing.
 *  - **Transformed lapse counts** behave far better than raw counts, which are heavily skewed and
 *    zero-inflated on a short test. A square-root transform is the standard remedy.
 *
 * The false-start definition is the standard one too: a response faster than 100 ms could not have
 * been a reaction to the stimulus, so it is an anticipation, not a fast trial. Counting those as
 * excellent reaction times is the classic way to make a sleepy user look sharp.
 */

export interface PVTMetrics {
  trialCount: number;
  meanRt: number;
  medianRt: number;
  lapses: number;
  falseStarts: number;
  /** Mean of 1/RT in reciprocal seconds — the literature's primary outcome. Higher is faster. */
  responseSpeed: number;
  rtCv: number; // coefficient of variation: stddev / mean
  timeOnTaskSlope: number; // avg(last third) - avg(first third), ms
  zScore: number; // composite fatigue z-score vs the user's baseline distribution
}

/**
 * Lapse threshold, which depends on test length.
 *
 * 500 ms is the classic threshold and belongs to the full 10-minute PVT. Validated short forms use
 * a lower one — around 355 ms for the 3-minute version — because a shorter test gives fatigue less
 * room to produce the long tail the 500 ms cut is designed to catch. Applying 500 ms to a 12-trial
 * test would report zero lapses for almost everybody, on almost every night.
 */
export function lapseThreshold(trialCount: number): number {
  return trialCount >= 25 ? 500 : 355;
}

/**
 * Responses faster than this could not be reactions to the stimulus; they are anticipations.
 * Excluded from every RT statistic and counted as false starts instead.
 */
export const MIN_VALID_RT_MS = 100;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Mean of 1/RT over valid trials, in reciprocal seconds. */
export function responseSpeedOf(times: number[]): number {
  const valid = times.filter((t) => t >= MIN_VALID_RT_MS);
  if (!valid.length) return 0;
  return mean(valid.map((t) => 1000 / t));
}

// ---------------------------------------------------------------------------
// Baseline estimation
// ---------------------------------------------------------------------------

/**
 * One session's performance, summarised so that a few bad trials cannot define it.
 *
 * The baseline used to be the plain mean and standard deviation of a single 32-trial run. Three
 * things were wrong with that, and together they are why a user who "messed up eventually" ended
 * up with a baseline that did not describe them:
 *
 *  - **A 32-trial run is not the test it is a baseline for.** The daily check-in is 12 trials.
 *    Reaction time degrades measurably with time on task within a single session, so a longer
 *    calibration measures a slower person than the short daily test ever will — and every later
 *    check-in was then compared against that inflated number and flattered by it.
 *  - **The mean is not robust.** One lapse at 800 ms moves the mean of twelve trials by 40 ms.
 *  - **The standard deviation is far worse.** It has no resistance to outliers at all, and it is
 *    the scale every later z-score is divided by, so one bad trial during calibration quietly made
 *    the app less sensitive to sleep loss for as long as that baseline lived.
 *
 * So: work in response speed (1/RT), which is both the literature's primary outcome and much
 * better behaved than raw RT — RT has a long right tail, its reciprocal is close to symmetric.
 * Take a trimmed mean of it, dropping the slowest fifth, which is precisely the "I lost
 * concentration for a moment" tail. Take the spread from the median absolute deviation, which
 * needs half the trials to be bad before it moves, rather than one.
 */
export interface SessionSummary {
  /** Trimmed mean of 1/RT, reciprocal seconds. */
  speed: number;
  /** Robust spread of 1/RT across trials, from the MAD. */
  speedSd: number;
  /** The same central estimate expressed as milliseconds, for anything user-facing. */
  meanRt: number;
  /** Robust spread in milliseconds, for the z-scores that still work in RT. */
  sdRt: number;
  /** Valid trials behind it — anticipations excluded. */
  n: number;
}

/** 1.4826 × MAD estimates σ for normally distributed data, and ignores outliers doing it. */
function madSigma(xs: number[]): number {
  if (xs.length < 3) return 0;
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}

/** Mean of the values left after dropping the worst `fraction` of them. */
function trimmedMean(xs: number[], fraction: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  // Trimming from the slow end only. The fast end of a PVT distribution is real performance;
  // the slow end is inattention, and it is the only tail worth removing.
  const keep = Math.max(1, Math.round(sorted.length * (1 - fraction)));
  return mean(sorted.slice(sorted.length - keep));
}

export function summarizeSession(times: number[]): SessionSummary {
  const valid = times.filter((t) => t >= MIN_VALID_RT_MS);
  if (valid.length < 3) {
    const m = mean(valid);
    return { speed: m > 0 ? 1000 / m : 0, speedSd: 0, meanRt: Math.round(m), sdRt: 0, n: valid.length };
  }
  const speeds = valid.map((t) => 1000 / t);
  // Speeds sort the other way round from times: a *low* speed is a slow trial, so trimming the
  // slowest fifth means dropping the bottom of this distribution.
  const sorted = [...speeds].sort((a, b) => a - b);
  const keep = Math.max(1, Math.round(sorted.length * 0.8));
  const speed = mean(sorted.slice(sorted.length - keep));
  const speedSd = madSigma(speeds);
  const meanRt = speed > 0 ? 1000 / speed : 0;
  // Convert the spread back into milliseconds at the working point, since RT = 1000/speed means a
  // spread in speed maps to one in RT through the derivative, |dRT/dspeed| = 1000/speed².
  const sdRt = speed > 0 ? (speedSd * 1000) / (speed * speed) : 0;
  return {
    speed: Number(speed.toFixed(3)),
    speedSd: Number(speedSd.toFixed(3)),
    meanRt: Math.round(meanRt),
    sdRt: Math.round(sdRt),
    n: valid.length,
  };
}

/**
 * The user's rested capability, estimated from every session they have done.
 *
 * A baseline is supposed to represent what this person can do when they are not sleep-deprived,
 * and a single calibration run cannot know whether it caught them at their best — it is also the
 * one session where they had never done the task before, which is exactly when practice effects
 * are largest. So the estimate improves as sessions accumulate.
 *
 * Capability is the mean of the best quarter of sessions, never fewer than two. Not the single
 * best, which would drift upward forever as more sessions gave it more chances to catch a fluke;
 * not the mean of all, which would drift *downward* as tired check-ins accumulated and would
 * eventually define a chronically short-sleeping person's impairment as their normal. Averaging
 * the top few keeps it where a good day sits, and needs two of them to agree before it moves.
 */
export function baselineFrom(sessions: SessionSummary[]): { speed: number; meanRt: number; sdRt: number; sessions: number } | null {
  const usable = sessions.filter((s) => s.n >= 3 && s.speed > 0);
  if (!usable.length) return null;

  const speeds = usable.map((s) => s.speed).sort((a, b) => b - a); // fastest first
  const k = Math.min(speeds.length, Math.max(2, Math.round(speeds.length * 0.25)));
  const speed = mean(speeds.slice(0, k));

  // Within-session spread is a property of the person, not of a particular night, so the typical
  // session's spread is a better scale than any single session's.
  const robustSd = median(usable.map((s) => s.sdRt).filter((v) => v > 0));

  // Floored, deliberately. This spread is the divisor of every later z-score, and a calibration
  // session that happened to be unusually consistent would otherwise set a bar so tight that an
  // ordinary morning reads as a catastrophe. 35 ms is about the tightest a twelve-trial PVT is
  // honestly able to resolve, and the floor only ever acts in the direction of claiming *less*
  // certainty than the sample suggests.
  const sdRt = Math.max(35, Math.round(robustSd || 40));

  return { speed: Number(speed.toFixed(3)), meanRt: Math.round(1000 / speed), sdRt, sessions: usable.length };
}

export function computePVTMetrics(
  times: number[],
  falseStarts: number,
  baselineMean: number,
  baselineStd: number,
  /**
   * The baseline's own response speed, in reciprocal seconds. Optional so that older records and
   * the very first test still score; when absent it is derived from the baseline mean RT, which is
   * the best available stand-in.
   */
  baselineSpeed?: number
): PVTMetrics {
  // Anticipations are not reaction times. Pulling them out here means every statistic below —
  // mean, median, speed, variability, slope — is computed on trials that were actually responses.
  const anticipations = times.filter((t) => t < MIN_VALID_RT_MS).length;
  const valid = times.filter((t) => t >= MIN_VALID_RT_MS);

  const n = valid.length;
  const threshold = lapseThreshold(times.length);
  const lapses = valid.filter((t) => t > threshold).length;
  const m = mean(valid);
  const sd = stddev(valid);
  const rtCv = m > 0 ? sd / m : 0;
  const speed = responseSpeedOf(valid);

  const thirdSize = Math.max(1, Math.floor(n / 3));
  const firstThird = valid.slice(0, thirdSize);
  const lastThird = valid.slice(Math.max(0, n - thirdSize));
  const timeOnTaskSlope = mean(lastThird) - mean(firstThird);

  const safeBaselineStd = baselineStd > 1e-6 ? baselineStd : 40; // sane fallback spread (ms)
  const refSpeed = baselineSpeed && baselineSpeed > 0 ? baselineSpeed : baselineMean > 0 ? 1000 / baselineMean : 0;

  // Response speed leads the composite because it is the most sensitive term; a fall in speed is
  // the earliest reliable sign of sleep loss. The baseline's own variability sets the scale, via
  // the standard delta-method conversion of an RT spread into a speed spread (σ_speed ≈ σ_rt/RT²).
  const speedSd = baselineMean > 0 ? (safeBaselineStd * 1000) / baselineMean ** 2 : 1;
  const speedZ = refSpeed > 0 && speedSd > 1e-9 ? (refSpeed - speed) / speedSd : 0;

  // Lapses, square-root transformed: the raw count is zero for most alert tests and jumps sharply
  // once fatigue sets in, which makes it a poor linear term. sqrt spreads that out.
  const lapseZ = Math.sqrt(lapses) / Math.sqrt(Math.max(1, times.length) / 10);

  const cvZ = rtCv / 0.15; // ~0.15 CV is a typical alert baseline; higher = more fatigued
  const slopeZ = timeOnTaskSlope / 50; // 50ms of within-test slowing ~= 1 SD of fatigue signal

  const zScore = 0.45 * speedZ + 0.2 * lapseZ + 0.2 * cvZ + 0.15 * slopeZ;

  return {
    trialCount: n,
    meanRt: Math.round(m),
    medianRt: Math.round(median(valid)),
    lapses,
    // Both kinds of premature response are false starts: tapping before the stimulus appeared, and
    // tapping so soon after it that the tap was already on its way.
    falseStarts: falseStarts + anticipations,
    responseSpeed: Number(speed.toFixed(3)),
    rtCv: Number(rtCv.toFixed(3)),
    timeOnTaskSlope: Math.round(timeOnTaskSlope),
    zScore: Number(zScore.toFixed(2)),
  };
}
