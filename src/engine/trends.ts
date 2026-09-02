import type { CheckInRecord, SleepLogRecord } from '../store/types';
import { dayNumberFromDateKey, localDayNumber } from '../utils/clock';

/**
 * Analysis of a user's own history — the two questions the charts cannot answer.
 *
 * Everything here is computed from what this person logged. There is no model fitted on anyone
 * else, and nothing is reported unless there is enough of it to mean something; the alternative,
 * a confident sentence drawn from four nights, is worse than an empty card.
 */

// ---------------------------------------------------------------------------
// Sleep Regularity Index
// ---------------------------------------------------------------------------

/**
 * Nights needed before regularity is worth reporting.
 *
 * The index compares each day against the one after it, so seven nights gives six comparisons —
 * the fewest from which "regular" and "irregular" are distinguishable at all.
 */
export const MIN_NIGHTS_FOR_SRI = 7;

/**
 * The Sleep Regularity Index (Phillips et al., 2017, *Scientific Reports*).
 *
 * The probability of being in the same state — asleep or awake — at the same clock time on two
 * consecutive days, rescaled so that 100 is perfectly regular and 0 is a coin flip. It is worth
 * having because it is not duration and it is not bedtime: someone can average eight hours and
 * still score badly by taking them at a different time every night, and in the original cohort
 * regularity predicted outcomes that duration alone did not.
 *
 * Computed at minute resolution from the logged nights, which is the definition rather than an
 * approximation of it — the logs are the only record of sleep this app has, so the series they
 * describe *is* the series being scored. Days with no log are skipped rather than assumed awake:
 * a missing entry is an absence of evidence, and filling it with "awake" would score a forgotten
 * log as irregularity.
 */
export function sleepRegularityIndex(logs: SleepLogRecord[]): { sri: number; nights: number } | null {
  if (logs.length < MIN_NIGHTS_FOR_SRI) return null;

  // Minute-of-epoch-day → asleep, for every night that was logged.
  const asleep = new Map<number, boolean>();
  // Calendar day numbers, not local-midnight-over-86,400,000. The latter collapses the two days
  // either side of a spring-forward onto one index, which here would fold two nights into one
  // minute range and score the overlap as irregularity that never happened.
  const dayIndex = (date: string) => dayNumberFromDateKey(date);

  for (const log of logs) {
    const day = dayIndex(log.date);
    if (!Number.isFinite(day)) continue;
    // A night belongs to the date it *ends* on, so bedtime after 18:00 sits on the previous day.
    const startsPreviousDay = log.bedMin > 12 * 60;
    const start = (startsPreviousDay ? day - 1 : day) * 1440 + log.bedMin;
    for (let m = 0; m < log.durationMin; m++) asleep.set(start + m, true);
    // Mark the surrounding waking hours of the same day as known-awake, so the series has both
    // states rather than only the nights.
    const wakeStart = day * 1440 + log.wakeMin;
    for (let m = 0; m < 16 * 60; m++) {
      const minute = wakeStart + m;
      if (!asleep.has(minute)) asleep.set(minute, false);
    }
  }

  let agree = 0;
  let compared = 0;
  for (const [minute, state] of asleep) {
    const next = asleep.get(minute + 1440);
    if (next === undefined) continue;
    compared += 1;
    if (next === state) agree += 1;
  }
  if (compared < 12 * 60) return null; // fewer than half a day of overlapping minutes

  const sri = Math.max(0, Math.min(100, Math.round(100 * (2 * (agree / compared) - 1))));
  return { sri, nights: logs.length };
}

/** Plain words for a regularity score, on the bands the original paper's cohort fell into. */
export function regularityWord(sri: number): string {
  if (sri >= 85) return 'Very regular';
  if (sri >= 70) return 'Fairly regular';
  if (sri >= 55) return 'Uneven';
  return 'Irregular';
}

// ---------------------------------------------------------------------------
// What predicts a good day, for this person
// ---------------------------------------------------------------------------

/** Paired observations needed before a correlation is reported at all. */
export const MIN_PAIRS_FOR_DRIVER = 10;

export interface Driver {
  /** Which property of the night this is about. */
  key: 'duration' | 'bedtime' | 'midpoint';
  /** Pearson r between that property and the following day's alertness. */
  r: number;
  /** How many night–morning pairs it was computed from. */
  n: number;
  /** A sentence stating the finding and its direction, without overclaiming. */
  sentence: string;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 1e-9 || syy <= 1e-9) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Which property of someone's nights their own alertness actually follows.
 *
 * Three candidates, each paired with the *next* morning's check-in: how long they slept, when they
 * went to bed, and the midpoint of the night — the last being the standard marker of circadian
 * timing, and the one that separates "you need more sleep" from "you need it at a different hour".
 *
 * Reported only when there are enough pairs and the relationship is strong enough to survive a
 * glance at the scatter. This is a correlation within one person's data and is described as one:
 * it does not establish that changing the input changes the outcome, and the copy says so.
 */
export function strongestDriver(logs: SleepLogRecord[], checkIns: CheckInRecord[]): Driver | null {
  const morningByDay = new Map<number, number[]>();
  for (const c of checkIns) {
    const d = new Date(c.timestamp);
    // Morning check-ins only: an evening score is the end of a day's wear, not the night's result.
    if (d.getHours() >= 12) continue;
    const day = localDayNumber(d);
    const list = morningByDay.get(day) ?? [];
    list.push(c.sdi);
    morningByDay.set(day, list);
  }

  const duration: number[] = [];
  const bedtime: number[] = [];
  const midpoint: number[] = [];
  const sdi: number[] = [];

  for (const log of logs) {
    // Must agree exactly with the check-in day above — this Map lookup is the join between a
    // night and the morning after it, and a DST-day collision would pair the wrong two.
    const day = dayNumberFromDateKey(log.date);
    const scores = morningByDay.get(day);
    if (!scores?.length) continue;
    duration.push(log.durationMin);
    // Bedtime as minutes from 18:00, so a 23:30 and a 00:30 are adjacent numbers rather than 1380
    // and 30 — a wrap that would otherwise dominate the correlation entirely.
    bedtime.push(((log.bedMin - 18 * 60 + 1440) % 1440));
    midpoint.push(((log.bedMin - 18 * 60 + 1440) % 1440) + log.durationMin / 2);
    sdi.push(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  if (sdi.length < MIN_PAIRS_FOR_DRIVER) return null;

  const candidates: Driver[] = [
    { key: 'duration', r: pearson(duration, sdi), n: sdi.length, sentence: '' },
    { key: 'bedtime', r: pearson(bedtime, sdi), n: sdi.length, sentence: '' },
    { key: 'midpoint', r: pearson(midpoint, sdi), n: sdi.length, sentence: '' },
  ];
  const best = candidates.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a));

  // Below about 0.35 the scatter is a cloud, and naming a driver from it would be reading tea
  // leaves at the user in an authoritative voice.
  if (Math.abs(best.r) < 0.35) return null;

  const strength = Math.abs(best.r) >= 0.6 ? 'closely' : 'somewhat';
  const sentence =
    best.key === 'duration'
      ? best.r > 0
        ? `Your mornings track ${strength} with how long you slept — longer nights, sharper days.`
        : `Your mornings track ${strength} *against* how long you slept, which is unusual and worth a second look at your logs.`
      : best.key === 'bedtime'
        ? best.r > 0
          ? `Your mornings track ${strength} with a later bedtime.`
          : `Your mornings track ${strength} with an earlier bedtime — more than with how long you slept.`
        : best.r > 0
          ? `Your mornings track ${strength} with a later night overall, not with its length.`
          : `Your mornings track ${strength} with an earlier night overall, not with its length.`;

  return { ...best, r: Number(best.r.toFixed(2)), sentence };
}
