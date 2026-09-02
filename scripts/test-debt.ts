import {
  accumulatedDebt,
  debtPattern,
  MAX_DEBT_HOURS,
  MAX_GAP_NIGHTS,
  nightsToClear,
  personalSleepNeedHours,
  recommendedSleepHours,
  sleepNeedBand,
} from '../src/engine/debt.ts';
import type { SleepLogRecord } from '../src/store/types.ts';

/**
 * Tests for the sleep-debt ledger.
 *
 * The model these replace computed "debt" from a single night against a flat eight-hour need, plus
 * a term scaled from the alertness index — which the index itself is partly computed from. So the
 * headline number on the Recovery screen was one night's shortfall, held to a target that ignored
 * the user's age, inflated by a feedback loop, and unbounded. Every one of those has a check here,
 * because none of them would have failed a type check or thrown.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

/** `back` nights ago, so every fixture sits inside the ledger's three-week window. */
const dayKey = (back: number) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const night = (back: number, hours: number): SleepLogRecord => ({
  id: `sl_${dayKey(back)}`,
  date: dayKey(back),
  bedMin: 1380,
  wakeMin: (1380 + hours * 60) % 1440,
  durationMin: Math.round(hours * 60),
  quality: 'Okay',
  restPct: 60,
  source: 'manual',
});

/** `n` consecutive nights of `hours`, ending last night. */
const run = (hours: number, n: number): SleepLogRecord[] =>
  Array.from({ length: n }, (_, i) => night(n - i, hours));

const ADULT = 30;

{
  console.log('sleep need follows age, not a flat eight hours');
  check('a teenager needs more', recommendedSleepHours(16) === 9, recommendedSleepHours(16));
  check('an adult needs eight', recommendedSleepHours(30) === 8, recommendedSleepHours(30));
  check('someone over 65 needs a little less', recommendedSleepHours(70) === 7.5, recommendedSleepHours(70));
  check('every band has its published range around the midpoint', [16, 22, 40, 70].every((a) => {
    const b = sleepNeedBand(a);
    return b.min <= b.mid && b.mid <= b.max;
  }));
}

{
  console.log('need is revised up by evidence, never down');
  // The error this guards against: reading chronic restriction as a naturally short sleep need,
  // which would drop the debt of the person carrying the most of it.
  const restricted = personalSleepNeedHours(ADULT, run(5, 20));
  check('twenty five-hour nights do not lower the target', restricted.hours === 8, restricted);
  check('and are not treated as a personal measurement at all', restricted.personal === false, restricted);

  const longSleeper = personalSleepNeedHours(ADULT, run(9.5, 20));
  check('someone who consistently takes nine hours has their need raised', longSleeper.hours > 8, longSleeper);
  check('but never past the top of their age band', longSleeper.hours <= sleepNeedBand(ADULT).max, longSleeper);
  check('and it is flagged as personal', longSleeper.personal === true, longSleeper);

  const thin = personalSleepNeedHours(ADULT, run(9.5, 5));
  check('five nights is not enough evidence to move it', thin.hours === 8 && !thin.personal, thin);
}

{
  console.log('debt accumulates across nights');
  const one = accumulatedDebt([night(1, 5)], ADULT);
  const seven = accumulatedDebt(run(5, 7), ADULT);
  check('one short night owes about its shortfall', one.hours > 2 && one.hours < 3.1, one.hours);
  check(
    'a week of the same night owes considerably more than one of them',
    seven.hours > one.hours * 3,
    `${one.hours} -> ${seven.hours}`
  );
  // This is the whole point of the rewrite: the old model returned the same figure for both.
  check('the two are not the same number', seven.hours !== one.hours, seven.hours);
}

{
  console.log('and it saturates rather than growing without bound');
  const fortnight = accumulatedDebt(run(4, 14), ADULT);
  const twoMonths = accumulatedDebt(run(4, 60), ADULT);
  // Van Dongen's fourteen nights at four hours: lapse rates comparable to two nights of total
  // deprivation, so roughly sixteen hours. This is the model's one real calibration point.
  check('two weeks at four hours lands near two nights lost', fortnight.hours > 13 && fortnight.hours < 19, fortnight.hours);
  check('two months is worse but not four times worse', twoMonths.hours < fortnight.hours * 2, `${fortnight.hours} -> ${twoMonths.hours}`);
  check('nothing exceeds the ceiling', twoMonths.hours <= MAX_DEBT_HOURS, twoMonths.hours);
  // The old model: 60 nights × 4h shortfall = 240 hours, printed to one decimal place.
  check('a figure with no physiological meaning is never produced', twoMonths.hours < 30, twoMonths.hours);
  // A realistic history saturates below the ceiling, so the clamp stays a guard rather than a
  // routine occurrence — and when it does bind, the screen is told.
  check('a realistic history never needs the clamp', twoMonths.atCeiling === false, twoMonths.atCeiling);
  const sleepless = accumulatedDebt(run(0, 40), ADULT);
  check('an impossible history is clamped', sleepless.hours <= MAX_DEBT_HOURS, sleepless.hours);
  check('and says the figure is a floor, not a total', sleepless.atCeiling === true, sleepless.atCeiling);
}

{
  console.log('sleeping to need clears it, slowly');
  const rested = accumulatedDebt(run(8, 10), ADULT);
  check('ten nights at need owes nothing', rested.hours === 0, rested.hours);

  const badThenGood = accumulatedDebt([...run(5, 14).slice(0, 7), ...run(9, 7)], ADULT);
  const badOnly = accumulatedDebt(run(5, 7), ADULT);
  check('a good week reduces a bad one', badThenGood.hours < badOnly.hours, `${badOnly.hours} -> ${badThenGood.hours}`);
  check('but does not erase it — recovery is not hour for hour', badThenGood.hours > 0, badThenGood.hours);

  const clear = nightsToClear(6);
  // Belenky: three recovery nights left performance short of baseline. Anything that answered
  // "two or three" here would be telling people what they want to hear.
  check('clearing six hours takes well more than a long weekend', clear != null && clear > 5, clear);
  check('and it is a number rather than a shrug', clear != null && clear <= 21, clear);
  check('nothing owed needs no nights', nightsToClear(0) === null);
}

{
  console.log('unlogged nights neither accrue nor invent');
  // Forgetting to open the app must never manufacture debt.
  const gapped = accumulatedDebt([night(20, 5), night(19, 5), night(1, 5)], ADULT);
  const dense = accumulatedDebt(run(5, 20), ADULT);
  check('a sparse history owes less than a dense one', gapped.hours < dense.hours, `${gapped.hours} vs ${dense.hours}`);
  check('and it still owes something for the nights that were logged', gapped.hours > 0, gapped.hours);
  check('three logged nights are counted as three', gapped.nights === 3, gapped.nights);

  // Beyond the window there is nothing honest left to say.
  const stale = accumulatedDebt([night(MAX_GAP_NIGHTS + 40, 4), night(MAX_GAP_NIGHTS + 39, 4)], ADULT);
  check('a history that stops a month ago carries nothing forward', stale.hours === 0, stale.hours);
  check('and the gap is reported', stale.nightsSinceLog > MAX_GAP_NIGHTS, stale.nightsSinceLog);
}

{
  console.log('the ledger is monotonic in the direction it should be');
  const worse = [9, 8, 7, 6, 5, 4].map((h) => accumulatedDebt(run(h, 7), ADULT).hours);
  const nonDecreasing = worse.every((v, i) => i === 0 || v >= worse[i - 1]);
  check('less sleep never means less debt', nonDecreasing, worse);
  check('and a week at need really is zero', worse[1] === 0, worse);
}

{
  console.log('a series is produced for the chart');
  const ledger = accumulatedDebt(run(5, 7), ADULT);
  check('one point per logged night', ledger.series.length === 7, ledger.series.length);
  const climbs = ledger.series.every((e, i) => i === 0 || e.hours >= ledger.series[i - 1].hours);
  check('climbing across a run of short nights', climbs, ledger.series.map((e) => e.hours));
  check('each point carries its date', ledger.series.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)));
}

{
  console.log('one bad night and a bad fortnight are told apart');
  // They call for different advice, and the person in the second case is the one least able to
  // tell — the reason the distinction is drawn at all.
  check('nothing short is nothing to report', debtPattern(run(8, 7), 8) === 'none', debtPattern(run(8, 7), 8));
  const oneBad = debtPattern([...run(8, 7).slice(0, 6), night(1, 4)], 8);
  check('a single short night reads as acute', oneBad === 'acute', oneBad);
  check('a week of them reads as chronic', debtPattern(run(5, 7), 8) === 'chronic', debtPattern(run(5, 7), 8));
  const half = debtPattern([...run(5, 7).slice(0, 4), ...run(8, 3)], 8);
  check('a mixed week reads as mixed', half === 'mixed', half);
}

{
  console.log('the alertness index no longer feeds itself');
  // The removed term added up to three hours of debt scaled from the SDI, which is fused partly
  // *from* debt. The ledger takes no score at all, which is how the loop is proven gone.
  // Two required parameters — the nights and the age — and an optional clock. No score anywhere.
  check('accumulatedDebt takes only nights and an age', accumulatedDebt.length === 2, accumulatedDebt.length);
  const a = accumulatedDebt(run(6, 7), ADULT);
  const b = accumulatedDebt(run(6, 7), ADULT);
  check('so the same nights always give the same debt', a.hours === b.hours, `${a.hours} vs ${b.hours}`);
}

console.log(failures === 0 ? '\nAll sleep-debt checks passed.' : `\n${failures} sleep-debt check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
