import type { CheckInRecord, SleepLogRecord } from '../store/types';
import { addLocalDays, localDateKey, localDayNumber, startOfLocalDay } from '../utils/clock';

/**
 * The Home insight card, derived rather than written.
 *
 * The spec asks for a rotating, relevant insight — "you checked in 46 minutes later than usual,
 * which lines up with a 12% dip". A fixed line of copy dressed as an observation is worse than no
 * card at all, so every insight here has to be *earned* by the data: each rule states what it
 * needs, and if nothing qualifies the caller gets a general tip that is honestly framed as a tip.
 *
 * Pure, so scripts/test-insights.ts can prove each rule fires only when it should.
 */

export interface Insight {
  /** Which rule produced this, for tests and for the tap-through explainer. */
  id: string;
  title: string;
  body: string;
  /** True when the text refers to this user's own records rather than general advice. */
  personal: boolean;
}

const hoursOf = (l: SleepLogRecord) => l.durationMin / 60;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Minutes-since-midnight of a check-in, in local time. */
const minuteOfDay = (ts: number) => {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
};

const GENERAL: Insight[] = [
  {
    id: 'general.light',
    title: 'Light beats caffeine before 9am',
    body: 'Ten minutes outdoors within an hour of waking sets tonight’s melatonin timing more reliably than a second coffee.',
    personal: false,
  },
  {
    id: 'general.consistency',
    title: 'A steady wake time does more than a long lie-in',
    body: 'Waking within the same half hour every day, weekends included, stabilises the body clock faster than catching up at the weekend.',
    personal: false,
  },
  {
    id: 'general.twenty',
    title: 'The twenty-minute rule',
    body: 'Awake in bed for more than twenty minutes? Get up, keep the lights low, and go back when you feel sleepy. It keeps bed associated with sleep.',
    personal: false,
  },
];

/**
 * Picks the most specific insight the data supports.
 *
 * Ordered by how much it earns its place: a change in this user's own numbers first, then a
 * standing pattern in them, then general advice. `dayIndex` only rotates the general tips, so the
 * card changes day to day without a personal finding silently changing with it.
 */
export function pickInsight(
  checkIns: CheckInRecord[],
  sleepLogs: SleepLogRecord[],
  // The user's own calendar day, so the general tip changes at their midnight, not UTC's.
  dayIndex = localDayNumber()
): Insight {
  const recent = checkIns.slice(-14);

  // Short sleep followed by a measured drop — the clearest thing this app can actually observe.
  if (sleepLogs.length >= 4 && recent.length >= 4) {
    const nights = sleepLogs.slice(-14);
    const avgHours = mean(nights.map(hoursOf));
    const lastNight = nights[nights.length - 1];
    const shortfall = avgHours - hoursOf(lastNight);
    if (shortfall >= 0.75) {
      return {
        id: 'personal.shortNight',
        title: `${shortfall.toFixed(1)} hours below your usual night`,
        body: `You logged ${hoursOf(lastNight).toFixed(1)}h against a recent average of ${avgHours.toFixed(
          1
        )}h. Expect today's score to sit lower, and treat tonight as the one to protect.`,
        personal: true,
      };
    }
  }

  // Check-in time drifting later, which is both a signal and a confound worth naming.
  if (recent.length >= 6) {
    const times = recent.map((c) => minuteOfDay(c.timestamp));
    const earlier = mean(times.slice(0, times.length - 3));
    const later = mean(times.slice(-3));
    const drift = later - earlier;
    if (Math.abs(drift) >= 45) {
      const dir = drift > 0 ? 'later' : 'earlier';
      return {
        id: 'personal.checkInDrift',
        title: `Your check-ins have moved ${Math.round(Math.abs(drift))} minutes ${dir}`,
        body: `Alertness swings across the day, so a moved check-in time changes the score on its own. Checking in at a similar point each day keeps the comparison fair.`,
        personal: true,
      };
    }
  }

  // A real, sustained improvement is worth saying out loud.
  if (recent.length >= 8) {
    const firstHalf = mean(recent.slice(0, Math.floor(recent.length / 2)).map((c) => c.sdi));
    const secondHalf = mean(recent.slice(Math.floor(recent.length / 2)).map((c) => c.sdi));
    const gain = secondHalf - firstHalf;
    if (gain >= 6) {
      return {
        id: 'personal.improving',
        title: `Up ${Math.round(gain)} points across your recent check-ins`,
        body: 'Whatever changed in the last week or so is working. Recovery from accumulated debt is gradual, so this is what progress is supposed to look like.',
        personal: true,
      };
    }
    if (gain <= -6) {
      return {
        id: 'personal.declining',
        title: `Down ${Math.round(Math.abs(gain))} points across your recent check-ins`,
        body: 'A run like this usually tracks accumulated debt rather than any single night. The recovery plan is built for exactly this.',
        personal: true,
      };
    }
  }

  // Consistently late bedtimes, once there is enough to call it a pattern rather than a week.
  if (sleepLogs.length >= 7) {
    const bedtimes = sleepLogs.slice(-7).map((l) => (l.bedMin >= 720 ? l.bedMin : l.bedMin + 1440));
    const spread = Math.max(...bedtimes) - Math.min(...bedtimes);
    if (spread >= 120) {
      return {
        id: 'personal.irregularBedtime',
        title: `Your bedtime moved by ${Math.round(spread / 60)} hours this week`,
        body: 'An irregular bedtime costs about as much as a short one. Anchoring the wake time first is usually the easier half to fix.',
        personal: true,
      };
    }
  }

  return GENERAL[Math.abs(dayIndex) % GENERAL.length];
}

/**
 * Consecutive days ending today (or yesterday) that contain a check-in.
 *
 * Counting back from yesterday when today has none is deliberate: a streak that resets at midnight
 * would tell someone they had lost six days of work at 9am, before they had any chance to check in.
 */
export function computeStreak(checkIns: CheckInRecord[], now = Date.now()): number {
  if (!checkIns.length) return 0;
  // Calendar days, not milliseconds. Dividing a local midnight by 86,400,000 collapses the two
  // days either side of a spring-forward into one index, which silently merged them here and made
  // a streak read one day short every March.
  const days = new Set(checkIns.map((c) => localDayNumber(c.timestamp)));
  const today = localDayNumber(now);
  let cursor = days.has(today) ? today : today - 1;
  if (!days.has(cursor)) return 0;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor--;
  }
  return streak;
}

// ---------------------------------------------------------------------------
// weekly review
// ---------------------------------------------------------------------------

export interface WeeklyReviewDay {
  /** Single-letter label, Monday first. */
  label: string;
  /** Mean SDI for that day, or null if there was no check-in. */
  sdi: number | null;
  /** Bedtime that night in minutes since midnight, if a night was logged. */
  bedMin: number | null;
  /** Epoch ms at local midnight, so the caller can format a date. */
  dayStart: number;
}

export interface WeeklyReview {
  days: WeeklyReviewDay[];
  /** Mean SDI across the days that have one, or null if the week is empty. */
  average: number | null;
  /** Change against the previous seven days, or null when there is nothing to compare to. */
  delta: number | null;
  best: WeeklyReviewDay | null;
  worst: WeeklyReviewDay | null;
  /** Spread of wake times across the week, in minutes, when enough nights were logged. */
  wakeSpreadMin: number | null;
  /** How many of the seven days carry a check-in. Drives the "not enough yet" state. */
  daysWithData: number;
}



/**
 * The last seven days, as measured.
 *
 * Days with no check-in stay null rather than being interpolated or dropped — a week with three
 * check-ins should look like a week with three check-ins, not like a complete one.
 */
export function weeklyReview(checkIns: CheckInRecord[], sleepLogs: SleepLogRecord[], now = Date.now()): WeeklyReview {
  const today = startOfLocalDay(now);
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const meanFor = (start: number, end: number) => {
    const inRange = checkIns.filter((c) => c.timestamp >= start && c.timestamp < end);
    return inRange.length ? Math.round(mean(inRange.map((c) => c.sdi))) : null;
  };

  const days: WeeklyReviewDay[] = [];
  for (let i = 6; i >= 0; i--) {
    // Calendar arithmetic, so each boundary is that day's own midnight. Subtracting 86,400,000 a
    // day at a time drifts an hour across a DST change, which put the boundaries at 23:00, pulled
    // an hour of the wrong day into each mean, and could label the column with the wrong weekday.
    const dayStart = addLocalDays(today, -i);
    const dayEnd = addLocalDays(today, -i + 1);
    const date = new Date(dayStart);
    const log = sleepLogs.find((l) => l.date === localDateKey(date)) ?? null;
    days.push({
      label: labels[date.getDay()],
      sdi: meanFor(dayStart, dayEnd),
      bedMin: log ? log.bedMin : null,
      dayStart,
    });
  }

  const scored = days.filter((d) => d.sdi != null) as (WeeklyReviewDay & { sdi: number })[];
  const average = scored.length ? Math.round(mean(scored.map((d) => d.sdi))) : null;

  const prevStart = addLocalDays(today, -13);
  const thisWeekStart = addLocalDays(today, -6);
  const prev = checkIns.filter((c) => c.timestamp >= prevStart && c.timestamp < thisWeekStart);
  const prevAverage = prev.length ? Math.round(mean(prev.map((c) => c.sdi))) : null;

  const weekLogs = sleepLogs.filter((l) => {
    const t = Date.parse(`${l.date}T00:00:00`);
    return t >= thisWeekStart && t <= today;
  });
  const wakeTimes = weekLogs.map((l) => l.wakeMin);
  const wakeSpreadMin = wakeTimes.length >= 3 ? Math.max(...wakeTimes) - Math.min(...wakeTimes) : null;

  return {
    days,
    average,
    delta: average != null && prevAverage != null ? average - prevAverage : null,
    best: scored.length ? scored.reduce((a, b) => (b.sdi > a.sdi ? b : a)) : null,
    worst: scored.length ? scored.reduce((a, b) => (b.sdi < a.sdi ? b : a)) : null,
    wakeSpreadMin,
    daysWithData: scored.length,
  };
}
