import {
  CALIBRATION_SCANS,
  MIN_BASELINE_SAMPLES,
  emptyFaceBaseline,
  isCalibrated,
  calibrationRemaining,
  recalibrateFaceBaseline,
  scoreAgainstBaseline,
  updateFaceBaseline,
  type ScorableFeatures,
} from '../src/lib/faceBaseline.ts';
import { fuseSDI } from '../src/engine/sdi.ts';

/**
 * Data-integrity tests for the failures that do not look like failures.
 *
 * Every case here produced a plausible number on screen. A Quick Rating showed a confident
 * four-signal score built from yesterday's face; a baseline that absorbed every scan quietly
 * decided a chronically tired face was normal. Nothing crashed, nothing looked wrong, and the
 * output was fiction — which is the only reason these are worth testing at this level.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

// `brightness` is a quality gate in faceScoring, not a scored feature, so it is not on this type.
const typical: ScorableFeatures = {
  redness: 0.05,
  periorbital: 0.15,
  eyeContrast: 1.2,
  motion: 0.02,
  closureFraction: 0.08,
  ear: 0.28,
  mar: 0.05,
  periorbitalLab: 6,
  scleralRedness: 0.05,
  skinToneChroma: 20,
  mouthCornerDrop: 0.0,
};

// ---------------------------------------------------------------------------
console.log('the baseline stops being a moving target');
{
  let bl = emptyFaceBaseline();
  check('a fresh baseline needs calibrating', !isCalibrated(bl) && calibrationRemaining(bl) === CALIBRATION_SCANS);

  for (let i = 0; i < CALIBRATION_SCANS; i++) bl = updateFaceBaseline(bl, typical);
  check('it calibrates after the full set', isCalibrated(bl), bl.periorbital.n);
  check('and asks for no more', calibrationRemaining(bl) === 0);

  /**
   * The drift this replaced. Every scan used to be pushed into the running mean, so three weeks of
   * bad sleep taught the app that a tired face was this person's normal one — the z-scores decayed
   * toward zero and the score recovered while the person did not. The app was least able to see
   * chronic fatigue in exactly the people who had it.
   */
  const tired: ScorableFeatures = { ...typical, closureFraction: 0.5, ear: 0.17, periorbitalLab: 15 };
  const firstTiredScore = scoreAgainstBaseline(tired, bl).zScore;

  let drifted = bl;
  for (let i = 0; i < 30; i++) drifted = updateFaceBaseline(drifted, tired);
  check('a month of tired scans does not move the reference', drifted.periorbital.n === bl.periorbital.n, drifted.periorbital.n);
  check('so the mean is untouched', drifted.closure?.mean === bl.closure?.mean);

  const laterTiredScore = scoreAgainstBaseline(tired, drifted).zScore;
  check('and the same tired face still scores the same', laterTiredScore === firstTiredScore, {
    firstTiredScore,
    laterTiredScore,
  });
  check('which is worse than the calibration face', laterTiredScore < scoreAgainstBaseline(typical, drifted).zScore);
}

console.log('\nrecalibration is deliberate, and complete');
{
  let bl = emptyFaceBaseline();
  for (let i = 0; i < CALIBRATION_SCANS; i++) bl = updateFaceBaseline(bl, typical);
  const fresh = recalibrateFaceBaseline();
  check('it clears the old reference entirely', !isCalibrated(fresh) && fresh.periorbital.n === 0);
  // Partial nudging is the thing to avoid: it would drift again by a slower route.
  check('and starts a full new calibration', calibrationRemaining(fresh) === CALIBRATION_SCANS);
  check('a scan against a blank baseline is provisional', scoreAgainstBaseline(typical, fresh).provisional);
}

console.log('\na thin baseline refuses to be treated as a real one');
{
  let bl = emptyFaceBaseline();
  for (let i = 0; i < MIN_BASELINE_SAMPLES - 1; i++) bl = updateFaceBaseline(bl, typical);
  check('below the minimum it is provisional', scoreAgainstBaseline(typical, bl).provisional, bl.periorbital.n);
  bl = updateFaceBaseline(bl, typical);
  check('and at the minimum it is not', !scoreAgainstBaseline(typical, bl).provisional, bl.periorbital.n);
  check('the minimum is below the calibration target', MIN_BASELINE_SAMPLES <= CALIBRATION_SCANS);
}

// ---------------------------------------------------------------------------
console.log('\nthe fusion counts only the signals it was actually given');
{
  /**
   * The stale-signal bug at the level the score sees it. `signals` used to be assigned a flat 4 or 3
   * by setFaceMetrics and survived into the next check-in, so a Quick Rating — one rating, nothing
   * else — reported a four-signal high-confidence score built from the previous session's face scan
   * and tap test.
   */
  const quickRating = fuseSDI({ zPvt: null, zFace: null, zKss: 0.5, zDebt: null });
  check('a rating alone is one signal', quickRating.signalsUsed === 1, quickRating);
  check('and is low confidence', quickRating.confidence === 'low', quickRating.confidence);

  const full = fuseSDI({ zPvt: 0.5, zFace: 0.5, zKss: 0.5, zDebt: 0.5 });
  check('a full check-in is four', full.signalsUsed === 4, full);
  check('and is high confidence', full.confidence === 'high', full.confidence);

  const twoSignals = fuseSDI({ zPvt: 0.5, zFace: null, zKss: 0.5, zDebt: null });
  check('two signals count as two', twoSignals.signalsUsed === 2, twoSignals);

  // Nothing measured must not become a confident middle.
  const nothing = fuseSDI({ zPvt: null, zFace: null, zKss: null, zDebt: null });
  check('no signals is reported as none', nothing.signalsUsed === 0, nothing);
  check('and never as high confidence', nothing.confidence === 'low', nothing.confidence);
}

console.log('\nthe same inputs score the same regardless of what came before');
{
  // Order independence is what state isolation buys: a check-in must be a function of its own
  // signals. If a previous session could leak in, these two would differ.
  const a = fuseSDI({ zPvt: 0.3, zFace: null, zKss: 0.2, zDebt: null });
  const b = fuseSDI({ zPvt: 0.3, zFace: null, zKss: 0.2, zDebt: null });
  check('a repeated check-in is reproducible', a.sdi === b.sdi && a.signalsUsed === b.signalsUsed, { a, b });

  // And a signal that is genuinely absent must widen the others rather than count as average.
  const withFace = fuseSDI({ zPvt: 1, zFace: 1, zKss: null, zDebt: null });
  const withoutFace = fuseSDI({ zPvt: 1, zFace: null, zKss: null, zDebt: null });
  check('dropping a concurring signal does not change the direction', withFace.sdi > 50 && withoutFace.sdi > 50, {
    withFace: withFace.sdi,
    withoutFace: withoutFace.sdi,
  });
  check('but it does change the confidence', withFace.confidence !== withoutFace.confidence, {
    withFace: withFace.confidence,
    withoutFace: withoutFace.confidence,
  });
}

console.log(failures === 0 ? '\nAll integrity checks passed.' : `\n${failures} integrity check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
