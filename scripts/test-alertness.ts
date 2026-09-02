import {
  ALERTNESS_MAX,
  alertnessToKss,
  bestWindow,
  circadianAdjustment,
  circadianComponent,
  dailyAlertnessCurve,
  homeostaticComponent,
  inertiaComponent,
  predictedAlertness,
  wakeLevelAfterSleep,
  worstWindow,
} from '../src/engine/alertness.ts';
import { computePVTMetrics, lapseThreshold, responseSpeedOf, MIN_VALID_RT_MS } from '../src/engine/pvt.ts';

/**
 * Tests for the alertness model and the PVT metrics.
 *
 * These are the claims the app makes about how tiredness behaves, so they are checked against what
 * the literature says should be true rather than against whatever the code currently returns: the
 * afternoon dip exists, the circadian trough is in the early hours, sleep inertia dominates the
 * first half hour and is gone by two, recovery sleep is front-loaded, and response speed picks up
 * sleep loss that mean RT would blur.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

// --- the circadian process ----------------------------------------------------------------------
{
  console.log('the body clock');
  const at = (h: number) => circadianComponent(h);

  // Trough in the early hours, peak in the late afternoon/early evening.
  let lowest = 0;
  let highest = 0;
  for (let h = 0; h < 24; h += 0.25) {
    if (at(h) < at(lowest)) lowest = h;
    if (at(h) > at(highest)) highest = h;
  }
  check('the trough falls in the early hours', lowest >= 2 && lowest <= 7, lowest);
  check('the peak falls in the afternoon or early evening', highest >= 14 && highest <= 20, highest);

  // The 12-hour harmonic is what produces the post-lunch dip: a local minimum in the afternoon
  // that is *not* the global trough.
  const dip = [13, 13.5, 14, 14.5, 15].map(at);
  const late = [17, 17.5, 18].map(at);
  check('the afternoon sits below the evening peak', Math.max(...dip) < Math.max(...late), [Math.max(...dip), Math.max(...late)]);
  check('but the afternoon is still far above the night trough', Math.min(...dip) > at(lowest) + 1, [Math.min(...dip), at(lowest)]);

  // An evening type's whole curve shifts later.
  const owl = circadianComponent(22, 10);
  const lark = circadianComponent(22, 6);
  check('a later chronotype is more alert late at night', owl > lark, [lark, owl]);
}

// --- homeostatic pressure -----------------------------------------------------------------------
{
  console.log('sleep pressure');
  const fresh = homeostaticComponent(0);
  const midday = homeostaticComponent(6);
  const evening = homeostaticComponent(14);
  const allNighter = homeostaticComponent(24);
  check('pressure only ever builds while awake', fresh > midday && midday > evening && evening > allNighter);
  check('and the decline decelerates', fresh - midday > evening - allNighter, [fresh - midday, evening - allNighter]);
  check('a short night starts the day lower', homeostaticComponent(2, 10) < homeostaticComponent(2, 14));
}

// --- sleep inertia ------------------------------------------------------------------------------
{
  console.log('sleep inertia');
  check('it is at its worst on waking', inertiaComponent(0) < -5);
  check('most of it is gone by 30 minutes', inertiaComponent(0.5) > inertiaComponent(0) / 2, inertiaComponent(0.5));
  check('it is negligible after two hours', Math.abs(inertiaComponent(2)) < 0.1, inertiaComponent(2));
  check('it never helps', [0, 0.25, 1, 4, 12].every((h) => inertiaComponent(h) <= 0));
}

// --- the three together -------------------------------------------------------------------------
{
  console.log('predicted alertness');
  const justWoke = predictedAlertness({ hoursAwake: 0.05, clockHour: 7 });
  const midMorning = predictedAlertness({ hoursAwake: 3, clockHour: 10 });
  check('you are groggier on waking than mid-morning', justWoke < midMorning, [justWoke, midMorning]);

  const threeAm = predictedAlertness({ hoursAwake: 20, clockHour: 3 });
  const threePm = predictedAlertness({ hoursAwake: 8, clockHour: 15 });
  check('3am after a long day is the worst of both', threeAm < threePm, [threeAm, threePm]);
  check('the scale is respected', [justWoke, midMorning, threeAm, threePm].every((v) => v >= 1 && v <= ALERTNESS_MAX));

  check('a fully alert level maps to a low KSS', alertnessToKss(14) < 3, alertnessToKss(14));
  check('a depleted level maps to a high KSS', alertnessToKss(3) > 7, alertnessToKss(3));
}

// --- recovery sleep is front-loaded -------------------------------------------------------------
{
  console.log('recovery across a night');
  const depleted = 4;
  const after4 = wakeLevelAfterSleep(4, depleted);
  const after8 = wakeLevelAfterSleep(8, depleted);
  const firstHalf = after4 - depleted;
  const secondHalf = after8 - after4;
  check('more sleep restores more', after8 > after4);
  check('but the first hours restore the most', firstHalf > secondHalf, [firstHalf, secondHalf]);
  // 8 hours from a depleted 4 reaches ~12.8 of a 14.3 ceiling: most of the way back, not all of
  // it, which is the plateau the recovery literature describes.
  check('a full night lands most of the way back', after8 > 12.5, after8);
}

// --- the correction that makes check-ins comparable ---------------------------------------------
{
  console.log('the circadian correction');
  // Baseline taken mid-morning; today's check-in in the afternoon dip.
  const adj = circadianAdjustment({ hoursAwake: 7, clockHour: 14 }, { hoursAwake: 3, clockHour: 10 });
  check('an afternoon check-in is expected to be worse than a mid-morning baseline', adj < 0, adj);

  // The same check-in taken at the same phase as the baseline needs no correction at all.
  const none = circadianAdjustment({ hoursAwake: 3, clockHour: 10 }, { hoursAwake: 3, clockHour: 10 });
  check('same phase, no correction', Math.abs(none) < 1e-9, none);

  // The alarm case: a test taken seconds after waking.
  const alarm = circadianAdjustment({ hoursAwake: 0.02, clockHour: 6.5 }, { hoursAwake: 3, clockHour: 10 });
  check('an alarm-time test is expected to be much worse', alarm < -0.5, alarm);
  check('and by more than a mere afternoon dip', alarm < adj, [alarm, adj]);
}

// --- the day's shape ----------------------------------------------------------------------------
{
  console.log('windows across the day');
  const curve = dailyAlertnessCurve({ wakeHour: 7 });
  check('the curve spans the waking day', curve.length > 60, curve.length);
  const best = bestWindow(curve)!;
  const worst = worstWindow(curve)!;
  check('there is a best window', !!best && best.level > 0);
  check('the best window beats the worst', best.level > worst.level, [best.level, worst.level]);
  // The model puts the sharpest stretch in the late morning: sleep pressure is at its lowest just
  // after a night's sleep, and by then inertia has cleared. That is a real prediction of the
  // three-process model, not an artefact — what it must not do is call the groggy first half hour
  // the best part of the day.
  check('the best window clears sleep inertia', best.startMin >= 7 * 60 + 30, best.startMin);
  check('the best window is in the first half of the waking day', best.startMin <= 7 * 60 + 8 * 60, best.startMin);
  check('the worst window falls after the best one', worst.startMin > best.startMin, [best.startMin, worst.startMin]);
}

// --- PVT metrics --------------------------------------------------------------------------------
{
  console.log('PVT scoring');
  check('a short test uses the short-form lapse threshold', lapseThreshold(12) === 355);
  check('a baseline-length test uses the classic one', lapseThreshold(32) === 500);

  const alert = [280, 290, 275, 300, 285, 295, 288, 279, 292, 286, 281, 297];
  const tired = [330, 520, 345, 610, 355, 480, 362, 700, 341, 590, 372, 505];

  const baselineMean = 288;
  const baselineStd = 25;
  const baselineSpeed = responseSpeedOf(alert);

  const a = computePVTMetrics(alert, 0, baselineMean, baselineStd, baselineSpeed);
  const t = computePVTMetrics(tired, 0, baselineMean, baselineStd, baselineSpeed);

  check('a tired test scores worse than an alert one', t.zScore > a.zScore, [a.zScore, t.zScore]);
  check('the alert test sits near its own baseline', Math.abs(a.zScore) < 0.5, a.zScore);
  check('response speed falls when tired', t.responseSpeed < a.responseSpeed, [a.responseSpeed, t.responseSpeed]);
  check('lapses are counted against the short threshold', t.lapses >= 4, t.lapses);
  check('variability rises when tired', t.rtCv > a.rtCv, [a.rtCv, t.rtCv]);

  // Response speed's whole reason for being: it moves when the mean barely does.
  const slightlyOff = alert.map((rt, i) => (i % 4 === 0 ? rt + 120 : rt + 5));
  const s = computePVTMetrics(slightlyOff, 0, baselineMean, baselineStd, baselineSpeed);
  check('a few slow trials show up as a real change', s.zScore > 0.2, s.zScore);

  // Anticipations.
  const withAnticipations = [50, 280, 90, 290, 275, 300, 285, 295, 288, 279, 292, 286];
  const w = computePVTMetrics(withAnticipations, 1, baselineMean, baselineStd, baselineSpeed);
  check('a sub-100ms tap is a false start, not a fast trial', w.falseStarts === 3, w.falseStarts);
  check('and it is excluded from the trial count', w.trialCount === 10, w.trialCount);
  check('so it cannot flatter the mean', w.meanRt > 270, w.meanRt);
  check('the minimum valid RT is the standard one', MIN_VALID_RT_MS === 100);
}

console.log(failures === 0 ? '\nAll alertness checks passed.' : `\n${failures} alertness check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
