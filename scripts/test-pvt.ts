import { baselineFrom, summarizeSession, computePVTMetrics, MIN_VALID_RT_MS } from '../src/engine/pvt.ts';

/**
 * Tests for the reaction-time baseline.
 *
 * The baseline used to be the plain mean and standard deviation of one 32-trial run. A user
 * reported the obvious consequence: the run was long enough that they lost concentration part way
 * through, and the number that came out did not describe them. These check the three properties
 * that has to have instead — resistance to a few bad trials, a spread that a single lapse cannot
 * inflate, and an estimate that improves rather than degrades as more sessions arrive.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

/** A steady performer: twelve trials around 280 ms. */
const steady = [270, 285, 292, 275, 288, 281, 297, 268, 279, 290, 283, 276];

{
  console.log('one bad trial should not move the baseline');
  const clean = summarizeSession(steady);
  // The same session with one lapse — a phone notification, a blink at the wrong moment.
  const withLapse = summarizeSession([...steady.slice(0, 11), 900]);
  const shift = Math.abs(withLapse.meanRt - clean.meanRt);
  check('the central estimate barely moves', shift <= 6, { clean: clean.meanRt, withLapse: withLapse.meanRt, shift });

  // The plain mean is what this replaced: 900 ms in place of 276 drags twelve trials by ~52 ms.
  const plainClean = steady.reduce((a, b) => a + b, 0) / steady.length;
  const plainLapsed = [...steady.slice(0, 11), 900].reduce((a, b) => a + b, 0) / 12;
  check('where a plain mean would have moved a lot', Math.abs(plainLapsed - plainClean) > 45, {
    plainShift: Math.round(Math.abs(plainLapsed - plainClean)),
  });
}

{
  console.log('the spread a z-score is divided by');
  const clean = summarizeSession(steady);
  const withLapse = summarizeSession([...steady.slice(0, 11), 900]);
  check('is not inflated by one lapse', withLapse.sdRt <= clean.sdRt * 1.6, { clean: clean.sdRt, withLapse: withLapse.sdRt });
  check('and is a real, non-zero scale', clean.sdRt > 0 && clean.sdRt < 60, clean.sdRt);
  // The floor is what stops an unusually consistent calibration session from making every later
  // morning look like a crisis.
  const tightBaseline = baselineFrom([summarizeSession([280, 281, 279, 280, 282, 278, 281, 280, 279, 281, 280, 279])])!;
  check('a suspiciously tight session is floored, not trusted', tightBaseline.sdRt >= 35, tightBaseline.sdRt);
}

{
  console.log('anticipations are not fast trials');
  const withAnticipation = summarizeSession([...steady.slice(0, 11), 40]);
  check('a 40 ms tap does not become the best trial', withAnticipation.meanRt > 260, withAnticipation.meanRt);
  check('and is excluded from the count', withAnticipation.n === 11, withAnticipation.n);
  check('the cutoff is the standard 100 ms', MIN_VALID_RT_MS === 100);
}

{
  console.log('the baseline across sessions');
  const good = summarizeSession(steady);
  const tired = summarizeSession(steady.map((t) => t + 90));
  const veryTired = summarizeSession(steady.map((t) => t + 160));

  const one = baselineFrom([good]);
  check('one session gives a baseline', one !== null && one.sessions === 1, one);
  check('and it is that session', Math.abs(one!.meanRt - good.meanRt) <= 2, { one: one!.meanRt, good: good.meanRt });

  // The point of the quantile: tired sessions must not redefine what this person is capable of.
  const many = baselineFrom([good, tired, veryTired, tired]);
  check('tired sessions do not drag capability down to their level', many!.meanRt < tired.meanRt, {
    baseline: many!.meanRt,
    tired: tired.meanRt,
  });
  check('and it stays near the good session', Math.abs(many!.meanRt - good.meanRt) < 60, {
    baseline: many!.meanRt,
    good: good.meanRt,
  });

  // Nor may one exceptional session become the standard everything is judged against.
  const flukey = summarizeSession(steady.map((t) => t - 70));
  const withFluke = baselineFrom([good, good, tired, flukey]);
  check('a single exceptional session does not become the bar', withFluke!.meanRt > flukey.meanRt, {
    baseline: withFluke!.meanRt,
    fluke: flukey.meanRt,
  });

  check('a session too short to summarise is ignored', baselineFrom([summarizeSession([280, 290])]) === null);
  check('no sessions at all gives no baseline', baselineFrom([]) === null);
}

{
  console.log('the baseline still scores a check-in');
  const base = baselineFrom([summarizeSession(steady)])!;
  const rested = computePVTMetrics(steady, 0, base.meanRt, base.sdRt, base.speed);
  const impaired = computePVTMetrics(steady.map((t) => t + 120), 0, base.meanRt, base.sdRt, base.speed);
  // The composite runs high-is-impaired, so a slower night has to score above a rested one.
  check('matching your baseline scores near zero', Math.abs(rested.zScore) < 0.4, rested.zScore);
  check('and a slower night scores worse', impaired.zScore > rested.zScore + 0.8, {
    rested: rested.zScore,
    impaired: impaired.zScore,
  });
}

console.log(failures === 0 ? '\nAll PVT checks passed.' : `\n${failures} PVT check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
