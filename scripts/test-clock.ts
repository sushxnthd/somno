import { spawnSync } from 'node:child_process';
import {
  __setDeviceClockForTests,
  addLocalDays,
  dateKeyFromDayNumber,
  dayNumberFromDateKey,
  deviceUses24HourClock,
  localDateKey,
  localDayNumber,
  startOfLocalDay,
} from '../src/utils/clock.ts';
import { computeStreak, weeklyReview } from '../src/engine/insights.ts';
import type { CheckInRecord } from '../src/store/types.ts';
import { fmt, fmtHM, napRange } from '../src/utils/format.ts';

/**
 * Every assertion below has to hold in every timezone, so the file runs itself in four: one east of
 * Greenwich with a half-hour offset, one west, one with European daylight saving, and one with a
 * quarter-hour offset and southern-hemisphere DST. A UTC-only test run would have passed against
 * the very code this file exists to replace.
 */
const TIMEZONES = ['Asia/Kolkata', 'America/Los_Angeles', 'Europe/London', 'Pacific/Chatham'];
if (!process.env.SOMNO_TZ) {
  let bad = 0;
  for (const tz of TIMEZONES) {
    console.log(`\n=== ${tz} ===`);
    // execArgv carries the --import that installs the TypeScript resolver; without it the child
    // cannot load a single one of these modules.
    const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
      stdio: 'inherit',
      env: { ...process.env, TZ: tz, SOMNO_TZ: tz },
    });
    if (r.status !== 0) bad += 1;
  }
  console.log(bad === 0 ? '\nAll clock checks passed in every timezone.' : `\nclock checks FAILED in ${bad} timezone(s).`);
  process.exit(bad === 0 ? 0 : 1);
}

/**
 * Tests for the two halves of "the app's time doesn't sync with my device's actual time".
 *
 * The first half was an alarm the app had invented (see test-onboarding-alarm.ts). The second is
 * here: every time in the app was rendered on a 12-hour clock regardless of the device, and a sleep
 * log was filed under the UTC date rather than the calendar date the user was living in.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

{
  console.log('a 24-hour device gets a 24-hour clock');
  check('19:00 is written as 19:00, not 7:00 pm', fmt(19 * 60, true) === '19:00', fmt(19 * 60, true));
  check('and midnight as 00:00, not 12:00 am', fmt(0, true) === '00:00', fmt(0, true));
  check('the dial readout follows too', fmtHM(19 * 60, true) === '19:00', fmtHM(19 * 60, true));
  check('a nap window keeps both ends', napRange(13 * 60 + 30, 14 * 60, true) === '13:30–14:00', napRange(13 * 60 + 30, 14 * 60, true));
}

{
  console.log('a 12-hour device is unchanged');
  check('19:00 stays 7:00 pm', fmt(19 * 60, false) === '7:00 pm', fmt(19 * 60, false));
  check('midnight stays 12:00 am', fmt(0, false) === '12:00 am', fmt(0, false));
  check('the dial drops the hour to 7', fmtHM(19 * 60, false) === '7:00', fmtHM(19 * 60, false));
  // The design writes "1:30-2:00 pm", eliding the shared meridiem.
  check('a nap window elides the shared meridiem', napRange(13 * 60 + 30, 14 * 60, false) === '1:30–2:00 pm', napRange(13 * 60 + 30, 14 * 60, false));
}

{
  console.log('the device is asked, not assumed');
  __setDeviceClockForTests(null);
  const detected = deviceUses24HourClock();
  check('detection returns a boolean rather than throwing', typeof detected === 'boolean', detected);
  __setDeviceClockForTests(true);
  check('and the answer is cached, so every screen agrees', deviceUses24HourClock() === true);
  __setDeviceClockForTests(false);
  check('in both directions', deviceUses24HourClock() === false);
  __setDeviceClockForTests(null);
}

{
  console.log('a night is filed under the day the user lived it');
  // The literal failure: `new Date().toISOString().slice(0, 10)` is the UTC date. Anywhere east of
  // Greenwich, a night logged just after midnight lands on the day before; anywhere west, an
  // evening entry lands on the day after. A sleep log's identity *is* its date, so the mis-filing
  // also decides which night a sync overwrites.
  const justAfterMidnight = new Date(2026, 2, 17, 0, 30, 0);
  check('00:30 on the 17th is the 17th', localDateKey(justAfterMidnight) === '2026-03-17', localDateKey(justAfterMidnight));

  const lateEvening = new Date(2026, 2, 17, 23, 45, 0);
  check('23:45 on the 17th is still the 17th', localDateKey(lateEvening) === '2026-03-17', localDateKey(lateEvening));

  const newYearsEve = new Date(2025, 11, 31, 22, 0, 0);
  check('the year does not roll early', localDateKey(newYearsEve) === '2025-12-31', localDateKey(newYearsEve));

  const singleDigits = new Date(2026, 0, 5, 9, 0, 0);
  check('months and days are zero-padded', localDateKey(singleDigits) === '2026-01-05', localDateKey(singleDigits));

  // Whatever the host's offset, the key must agree with the host's own calendar.
  const now = new Date();
  const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  check('and today is today, in local terms', localDateKey() === expected, `${localDateKey()} vs ${expected}`);
}

{
  console.log('calendar days, across a daylight-saving change');
  // The bug: `Math.floor(localMidnight / 86_400_000)`. A day is not 86,400,000 ms twice a year, so
  // the two days either side of a spring-forward floored to the same index — which merged them in
  // the check-in streak and in the night→morning join on the Trends screen.
  const everyDayOfYearIsDistinct = (() => {
    const seen = new Set<number>();
    const d = new Date(2026, 0, 1, 12, 0, 0);
    for (let i = 0; i < 730; i++) {
      const n = localDayNumber(d);
      if (seen.has(n)) return `repeated day number ${n} on ${d.toDateString()}`;
      seen.add(n);
      d.setDate(d.getDate() + 1);
    }
    return seen.size === 730 ? null : `only ${seen.size} distinct days in 730`;
  })();
  check('two years of dates get two years of day numbers', everyDayOfYearIsDistinct === null, everyDayOfYearIsDistinct);

  const consecutive = (() => {
    const d = new Date(2026, 0, 1, 12, 0, 0);
    let prev = localDayNumber(d);
    for (let i = 1; i < 730; i++) {
      d.setDate(d.getDate() + 1);
      const n = localDayNumber(d);
      if (n !== prev + 1) return `${d.toDateString()} jumped ${n - prev}`;
      prev = n;
    }
    return null;
  })();
  check('and they increment by exactly one, every day, all year', consecutive === null, consecutive);

  // addLocalDays must land on midnight even when the day it crosses is 23 or 25 hours long.
  const midnights = (() => {
    const base = new Date(2026, 0, 1, 12, 0, 0).getTime();
    for (let i = -400; i <= 400; i++) {
      const t = new Date(addLocalDays(base, i));
      if (t.getHours() !== 0 || t.getMinutes() !== 0) return `${t.toString()} is not midnight`;
    }
    return null;
  })();
  check('a day added or subtracted always lands on midnight', midnights === null, midnights);

  check('start of day is midnight', new Date(startOfLocalDay(new Date(2026, 5, 14, 17, 3))).getHours() === 0);
  check(
    'a date key round-trips through its day number',
    dateKeyFromDayNumber(dayNumberFromDateKey('2026-03-29')) === '2026-03-29',
    dateKeyFromDayNumber(dayNumberFromDateKey('2026-03-29'))
  );
}

{
  console.log('a streak is not broken by daylight saving');
  // Europe/London springs forward on 2026-03-29; Pacific/Chatham on 2026-09-27. Checking in at
  // noon every day for a fortnight either side must read as an unbroken fortnight everywhere.
  const checkIn = (at: Date): CheckInRecord => ({
    id: `ci_${at.getTime()}`,
    timestamp: at.getTime(),
    triggerType: 'manual',
    pvt: null,
    face: null,
    kss: 5,
    sdi: 60,
    confidence: 'low',
    signalsUsed: 1,
  });

  for (const [label, y, m, d] of [['March', 2026, 2, 29], ['September', 2026, 8, 27], ['November', 2026, 10, 1]] as const) {
    const pivot = new Date(y, m, d, 12, 0, 0);
    const ins: CheckInRecord[] = [];
    for (let i = -6; i <= 6; i++) {
      const at = new Date(pivot.getFullYear(), pivot.getMonth(), pivot.getDate() + i, 12, 0, 0);
      ins.push(checkIn(at));
    }
    const now = new Date(pivot.getFullYear(), pivot.getMonth(), pivot.getDate() + 6, 18, 0, 0).getTime();
    const streak = computeStreak(ins, now);
    check(`thirteen days across the ${label} boundary read as thirteen`, streak === 13, streak);
  }
}

{
  console.log('the weekly review keeps its days apart');
  const now = new Date(2026, 2, 31, 12, 0, 0).getTime(); // just after the European change
  const review = weeklyReview([], [], now);
  check('seven columns', review.days.length === 7, review.days.length);
  const allMidnight = review.days.every((d) => {
    const t = new Date(d.dayStart);
    return t.getHours() === 0 && t.getMinutes() === 0;
  });
  check('each starting at its own local midnight', allMidnight, review.days.map((d) => new Date(d.dayStart).toString()));
  const distinct = new Set(review.days.map((d) => localDateKey(new Date(d.dayStart)))).size;
  check('naming seven different dates', distinct === 7, distinct);
}

console.log(failures === 0 ? '\nAll clock checks passed.' : `\n${failures} clock check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
