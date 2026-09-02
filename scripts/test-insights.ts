import { computeStreak, pickInsight, weeklyReview } from '../src/engine/insights.ts';
import type { CheckInRecord, SleepLogRecord } from '../src/store/types.ts';

/**
 * Tests for the derived Home and weekly-review content.
 *
 * These rules generate sentences that read as findings about the user — "1.4 hours below your
 * usual night" — so the thing worth proving is that each one only fires when the data actually
 * supports it, and that a thin history falls through to advice that is honestly framed as advice.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

const DAY = 86_400_000;
const NOW = new Date(2026, 2, 15, 9, 0, 0).getTime(); // a fixed local morning

const checkIn = (daysAgo: number, sdi: number, hour = 8): CheckInRecord => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return {
    id: `ci_${d.getTime()}`,
    timestamp: d.getTime(),
    triggerType: 'morning',
    pvt: null,
    face: null,
    kss: 4,
    sdi,
    confidence: 'medium',
    signalsUsed: 2,
  };
};

const isoOf = (daysAgo: number) => {
  const d = new Date(NOW - daysAgo * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const log = (daysAgo: number, durationMin: number, bedMin = 1380): SleepLogRecord => ({
  id: `sl_${isoOf(daysAgo)}`,
  date: isoOf(daysAgo),
  bedMin,
  wakeMin: 420,
  durationMin,
  quality: 'Okay',
  restPct: 60,
  source: 'manual',
});

// --- insights are earned, not asserted ----------------------------------------------------------
{
  console.log('a thin history gets advice, not findings');
  const none = pickInsight([], []);
  check('nothing recorded means a general tip', !none.personal, none.id);
  check('the tip rotates by day', pickInsight([], [], 0).id !== pickInsight([], [], 1).id);

  const barely = pickInsight([checkIn(1, 60), checkIn(0, 62)], [log(1, 420)]);
  check('two check-ins is still not a finding', !barely.personal, barely.id);
}

{
  console.log('a short night is reported when there was one');
  const logs = [log(4, 460), log(3, 455), log(2, 470), log(1, 465), log(0, 330)];
  const ins = pickInsight([checkIn(4, 70), checkIn(3, 68), checkIn(2, 71), checkIn(1, 69)], logs);
  check('the short night fires', ins.id === 'personal.shortNight', ins.id);
  check('it names the actual shortfall', /1\.8 hours below/.test(ins.title), ins.title);
  check('and it is marked personal', ins.personal);
}

{
  console.log('a steady sleeper gets no short-night warning');
  const logs = [log(4, 450), log(3, 455), log(2, 450), log(1, 445), log(0, 452)];
  const ins = pickInsight([checkIn(4, 70), checkIn(3, 68), checkIn(2, 71), checkIn(1, 69)], logs);
  check('no false alarm', ins.id !== 'personal.shortNight', ins.id);
}

{
  console.log('drifting check-in times');
  const drifted = [
    checkIn(6, 70, 7),
    checkIn(5, 70, 7),
    checkIn(4, 70, 7),
    checkIn(3, 68, 9),
    checkIn(2, 68, 9),
    checkIn(1, 68, 9),
  ];
  const ins = pickInsight(drifted, []);
  check('a two-hour drift is reported', ins.id === 'personal.checkInDrift', ins.id);
  check('it says which way', /later/.test(ins.title), ins.title);

  const steady = [70, 70, 70, 68, 68, 68].map((v, i) => checkIn(6 - i, v, 7));
  check('a steady routine is not', pickInsight(steady, []).id !== 'personal.checkInDrift');
}

{
  console.log('sustained direction of travel');
  const rising = [55, 56, 57, 58, 68, 69, 70, 71].map((v, i) => checkIn(8 - i, v));
  check('a real rise is reported', pickInsight(rising, []).id === 'personal.improving', pickInsight(rising, []).id);
  const falling = [72, 71, 70, 69, 58, 57, 56, 55].map((v, i) => checkIn(8 - i, v));
  check('a real fall is reported', pickInsight(falling, []).id === 'personal.declining');
  const flat = [64, 65, 63, 66, 64, 65, 63, 66].map((v, i) => checkIn(8 - i, v));
  check('noise is not', !['personal.improving', 'personal.declining'].includes(pickInsight(flat, []).id));
}

// --- streaks ------------------------------------------------------------------------------------
{
  console.log('streaks');
  check('nothing is a zero streak', computeStreak([], NOW) === 0);
  check('today alone is one', computeStreak([checkIn(0, 70)], NOW) === 1);
  check('three consecutive days count', computeStreak([checkIn(2, 70), checkIn(1, 70), checkIn(0, 70)], NOW) === 3);
  check('a gap ends the streak', computeStreak([checkIn(5, 70), checkIn(1, 70), checkIn(0, 70)], NOW) === 2);
  check(
    'yesterday still counts before today’s check-in',
    computeStreak([checkIn(2, 70), checkIn(1, 70)], NOW) === 2,
    computeStreak([checkIn(2, 70), checkIn(1, 70)], NOW)
  );
  check('a stale streak is over', computeStreak([checkIn(9, 70), checkIn(8, 70)], NOW) === 0);
  check('two check-ins in one day are one day', computeStreak([checkIn(0, 70), checkIn(0, 65)], NOW) === 1);
}

// --- the weekly review --------------------------------------------------------------------------
{
  console.log('the weekly review');
  const empty = weeklyReview([], [], NOW);
  check('an empty week has seven empty days', empty.days.length === 7 && empty.days.every((d) => d.sdi === null));
  check('and no average to report', empty.average === null && empty.daysWithData === 0);
  check('and nothing to compare against', empty.delta === null);

  const checkIns = [checkIn(3, 60), checkIn(2, 80), checkIn(1, 70), checkIn(0, 70)];
  const review = weeklyReview(checkIns, [log(2, 420, 1350), log(1, 400, 1440)], NOW);
  check('only the days with check-ins are scored', review.daysWithData === 4, review.daysWithData);
  check('the average is of those days', review.average === 70, review.average);
  check('the best day is the best day', review.best?.sdi === 80, review.best?.sdi);
  check('the worst day is the worst day', review.worst?.sdi === 60, review.worst?.sdi);
  check('the day carries the bedtime that was logged', review.days.some((d) => d.bedMin === 1350));

  const withPrevious = weeklyReview([...checkIns, checkIn(10, 50), checkIn(9, 50)], [], NOW);
  check('last week gives it a delta', withPrevious.delta === 20, withPrevious.delta);

  const spread = weeklyReview(
    checkIns,
    [
      { ...log(3, 420), wakeMin: 360 },
      { ...log(2, 420), wakeMin: 420 },
      { ...log(1, 420), wakeMin: 540 },
    ],
    NOW
  );
  check('an irregular wake time is measured', spread.wakeSpreadMin === 180, spread.wakeSpreadMin);
}

console.log(failures === 0 ? '\nAll insight checks passed.' : `\n${failures} insight check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
