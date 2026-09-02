/**
 * What time the device thinks it is, and how it writes it down.
 *
 * This module exists because of a report that reads, in full: "the app's time doesn't sync with my
 * device's actual time." Two separate faults produced it. One was an alarm the app had invented and
 * armed itself, fixed in src/lib/alarmPlan.ts. The other is here: `is24h()` was a stub that returned
 * `false`, and ten screens additionally passed the literal `false` to `fmt`. So a phone set to a
 * 24-hour clock — the default across most of the world — saw every time in the app rendered in a
 * format it does not use, with the app's 19:00 written as "7:00 pm" beside a system clock reading
 * 19:00. Nothing was wrong with the *instant*; the app was simply writing it in someone else's
 * notation, which is indistinguishable from the wrong time at a glance on a lock screen.
 *
 * Detection is a probe rather than a lookup because React Native exposes no such setting and adding
 * a dependency for one boolean is not worth the build surface. Every branch falls back to 12-hour,
 * which is what the app did before, so a device with no Intl at all is no worse off than it was.
 */

/** Cached because the answer cannot change without the app restarting, and it is read per render. */
let cached: boolean | null = null;

function detect(): boolean {
  // 13:00 is the discriminating instant: a 24-hour clock writes the hour as "13", a 12-hour clock
  // writes "1" and adds a day-period marker. Both facts are checked, in that order.
  const probeAt = new Date(2020, 0, 1, 13, 0, 0);

  try {
    const fmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

    // `hourCycle` is the direct answer where the engine reports it. h23/h24 are the 24-hour cycles;
    // h11/h12 are the 12-hour ones. Anything else falls through to the parts probe.
    const cycle = (fmt.resolvedOptions() as { hourCycle?: string }).hourCycle;
    if (cycle === 'h23' || cycle === 'h24') return true;
    if (cycle === 'h11' || cycle === 'h12') return false;

    // A day-period part ("am"/"pm"/"上午") is only emitted by a 12-hour format, in every locale.
    if (typeof fmt.formatToParts === 'function') {
      const parts = fmt.formatToParts(probeAt);
      if (parts.some((p) => p.type === 'dayPeriod')) return false;
      const hour = parts.find((p) => p.type === 'hour')?.value;
      // Compared numerically so locales using non-Latin digits are read correctly.
      if (hour != null) {
        const n = Number(hour.replace(/\D/g, ''));
        if (Number.isFinite(n) && n > 0) return n === 13;
      }
    }
  } catch {
    // No Intl, or an engine that throws on an undefined locale. The string probe below still works.
  }

  try {
    const s = probeAt.toLocaleTimeString();
    // A rendered "1:00 PM" contains a marker; "13:00" contains the hour itself.
    if (/[ap]\.?\s?m\.?/i.test(s)) return false;
    if (/(^|\D)13(\D|$)/.test(s)) return true;
  } catch {
    // fall through
  }

  return false;
}

/**
 * Whether this device is set to a 24-hour clock.
 *
 * Read once per process. Screens should not call this directly — they should read `is24h()` off the
 * store, which routes through here, so a future preference can override it in one place.
 */
export function deviceUses24HourClock(): boolean {
  if (cached === null) cached = detect();
  return cached;
}

/** Test seam. Not called by the app. */
export function __setDeviceClockForTests(value: boolean | null): void {
  cached = value;
}

/**
 * Today's date in the device's own calendar, as `YYYY-MM-DD`.
 *
 * Not `toISOString().slice(0, 10)`, which is the UTC date. A night logged at 00:30 in Delhi
 * (UTC+5:30) is 19:00 the previous day in UTC, so the log was filed against yesterday; west of
 * Greenwich the same call files an evening entry against tomorrow. Since a sleep log's identity
 * *is* its date — see `sleepLogLocalId` — that mis-dating also decides which night gets overwritten
 * on the next sync.
 */
export function localDateKey(at: Date | number = new Date()): string {
  const d = at instanceof Date ? at : new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Calendar-day arithmetic that survives daylight saving.
 *
 * The app repeatedly needed "which day is this in", "the day before that", and "seven days back",
 * and computed all three as `Math.floor(localMidnight / 86_400_000)` and `± 86_400_000`. A day is
 * not 86,400,000 ms twice a year. On a spring-forward day the local midnights either side differ
 * by 23 hours, so two consecutive calendar days floor to the *same* index — which merged them in
 * the check-in streak and made it read one short — and on the autumn day the arithmetic drifts an
 * hour, putting the weekly review's day boundaries at 23:00 and naming the wrong weekday.
 *
 * Counting whole calendar days through `Date.UTC` has neither problem: it is pure Y/M/D
 * arithmetic, and the offset never enters into it.
 */
export function localDayNumber(at: Date | number = new Date()): number {
  const d = at instanceof Date ? at : new Date(at);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** Local midnight at the start of the day containing `at`. */
export function startOfLocalDay(at: Date | number = new Date()): number {
  const d = at instanceof Date ? at : new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Local midnight `days` calendar days from the day containing `at`. Negative goes back. */
export function addLocalDays(at: Date | number, days: number): number {
  const d = at instanceof Date ? new Date(at.getTime()) : new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/** The `YYYY-MM-DD` key for a day number produced by `localDayNumber`. */
export function dateKeyFromDayNumber(dayNumber: number): string {
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

/** The day number a `YYYY-MM-DD` key names. Inverse of `dateKeyFromDayNumber`. */
export function dayNumberFromDateKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}
