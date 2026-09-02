import { ocularMeasures, ocularSummary, type OcularSample } from '../src/lib/ocular.ts';

/**
 * Tests for the eyelid measures — the part of the face scan with real evidence behind it.
 *
 * These used to drive the photometric estimator with synthetic eye bands. They now drive the real
 * input: a timed series of ML Kit per-eye open probabilities. That makes the suite both simpler and
 * stricter, because the quantity under test is absolute rather than normalised, so an assertion can
 * name the number it expects instead of only its direction.
 *
 * Two properties matter more than the rest:
 *
 *  - A scan with the eyes shut throughout must report closure near 1.0. The previous within-scan
 *    normalisation reported 0.0 for exactly this case — the most impaired state read as the least —
 *    and the regression below would have caught it.
 *  - The app must know when the device did not sample fast enough to support these numbers, and say
 *    so, rather than reporting a proportion-of-a-window computed from five points across it.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

/** A series of open-probabilities at a fixed cadence. */
const series = (opens: (number | null)[], periodMs: number, start = 1_000_000): OcularSample[] =>
  opens.map((eyeOpen, i) => ({ eyeOpen, at: start + i * periodMs }));

/** A cadence fast enough to clear MIN_TEMPORAL_FRAMES and MAX_SAMPLE_PERIOD_MS. */
const FAST = 150;

console.log('eyes open throughout');
{
  const m = ocularMeasures(series(Array(20).fill(0.95), FAST));
  check('no closure is reported', m.closureFraction === 0, m.closureFraction);
  check('and no slow closures', m.longClosures === 0);
  check('the sample rate is judged usable', m.temporalValid, m);
  check('every frame counted', m.frames === 20, m.frames);
}

console.log('\neyes shut throughout — the inversion this replaced');
{
  const m = ocularMeasures(series(Array(20).fill(0.02), FAST));
  // The photometric version divided every frame by the scan's own 85th percentile, which for an
  // all-shut scan is itself a shut eye, and returned 0.000 here. An absolute probability cannot.
  check('closure is near total, not near zero', m.closureFraction > 0.95, m.closureFraction);
  check('and it is reported as one long closure run', m.longClosures === 1, m.longClosures);
  check('lasting most of the window', m.meanClosureMs > 2000, m.meanClosureMs);
}

console.log('\nhalf the scan shut — the calibration case the device test uses');
{
  const opens = [...Array(12).fill(0.95), ...Array(12).fill(0.03)];
  const m = ocularMeasures(series(opens, FAST));
  check('closure lands near half', Math.abs(m.closureFraction - 0.5) < 0.08, m.closureFraction);
  check('as a single episode', m.longClosures === 1, m.longClosures);
}

console.log('\nordinary blinks are not slow closures');
{
  // One frame shut at 150ms cadence is a ~150ms episode: a blink, below LONG_CLOSURE_MS.
  const opens = [0.95, 0.95, 0.05, 0.95, 0.95, 0.95, 0.05, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95];
  const m = ocularMeasures(series(opens, FAST));
  check('some closure is measured', m.closureFraction > 0, m.closureFraction);
  check('but none of it counts as a slow closure', m.longClosures === 0, m.longClosures);
}

console.log('\na sustained droop does count');
{
  const opens = [...Array(6).fill(0.95), ...Array(6).fill(0.1), ...Array(8).fill(0.95)];
  const m = ocularMeasures(series(opens, FAST));
  check('one episode is found', m.longClosures === 1, m.longClosures);
  check('and it is at least the threshold long', m.meanClosureMs >= 400, m.meanClosureMs);
}

console.log('\nthe threshold sits between the classifier\'s two modes');
{
  const open = ocularMeasures(series(Array(20).fill(0.41), FAST));
  const shut = ocularMeasures(series(Array(20).fill(0.39), FAST));
  check('just above the threshold is open', open.closureFraction === 0, open.closureFraction);
  check('and just below it is closed', shut.closureFraction > 0.95, shut.closureFraction);
}

console.log('\na detection gap is not a closure');
{
  // The user turned away for four frames. That is missing data, not shut eyes — counting it as
  // closure would manufacture the very signal the scan exists to detect.
  const opens = [...Array(10).fill(0.95), null, null, null, null, ...Array(10).fill(0.95)];
  const m = ocularMeasures(series(opens, FAST));
  check('the gap contributes no closure', m.closureFraction === 0, m.closureFraction);
  check('and only the seen frames count', m.frames === 20, m.frames);
}

console.log('\nthe rate has to support the measurement');
{
  const slow = ocularMeasures(series(Array(20).fill(0.95), 500));
  check('half-second sampling is refused', !slow.temporalValid, slow.samplePeriodMs);
  const few = ocularMeasures(series(Array(6).fill(0.95), 120));
  check('and so is a series that is too short', !few.temporalValid, few.frames);
  const good = ocularMeasures(series(Array(20).fill(0.95), 200));
  check('but a real rate is accepted', good.temporalValid, good);
}

console.log('\nuneven gaps are weighted by time, not by frame count');
{
  // Two shut frames covering a long interval outweigh many open frames covering short ones.
  const samples: OcularSample[] = [
    { eyeOpen: 0.95, at: 0 },
    { eyeOpen: 0.95, at: 100 },
    { eyeOpen: 0.95, at: 200 },
    { eyeOpen: 0.02, at: 300 },
    { eyeOpen: 0.02, at: 2300 },
    { eyeOpen: 0.95, at: 2400 },
  ];
  const m = ocularMeasures(samples);
  check('the long shut interval dominates', m.closureFraction > 0.6, m.closureFraction);
}

console.log('\nout-of-order samples are sorted rather than trusted');
{
  const shuffled: OcularSample[] = [
    { eyeOpen: 0.95, at: 300 },
    { eyeOpen: 0.95, at: 0 },
    { eyeOpen: 0.95, at: 150 },
  ];
  const m = ocularMeasures(shuffled);
  check('the period is positive', m.samplePeriodMs === 150, m.samplePeriodMs);
}

console.log('\nnothing to measure says nothing');
{
  const none = ocularMeasures([]);
  check('an empty series is not valid', !none.temporalValid && none.closureFraction === 0);
  const one = ocularMeasures([{ eyeOpen: 0.9, at: 0 }]);
  check('and neither is a single frame', !one.temporalValid, one.frames);
  const blind = ocularMeasures(series([null, null, null, null], FAST));
  check('a series with no detections reports no frames', blind.frames === 0, blind.frames);
}

console.log('\nwhat the app is allowed to say');
{
  const slow = ocularMeasures(series(Array(4).fill(0.9), 900));
  check('an unusable rate is admitted in words', /needs a faster camera/.test(ocularSummary(slow)));
  const droop = ocularMeasures(series([...Array(6).fill(0.9), ...Array(8).fill(0.05), ...Array(6).fill(0.9)], FAST));
  check('a slow closure is named', /slow closure/.test(ocularSummary(droop)), ocularSummary(droop));
  const awake = ocularMeasures(series(Array(20).fill(0.95), FAST));
  check('and an alert scan says so', /stayed open/.test(ocularSummary(awake)), ocularSummary(awake));
}

console.log(failures === 0 ? '\nAll ocular checks passed.' : `\n${failures} ocular check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
