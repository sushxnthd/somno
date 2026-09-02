import {
  aggregate,
  extractFeaturesIn,
  frameMotion,
  regionsIn,
  toPixels,
  type Frame,
  type NormBox,
} from '../src/lib/faceFeatures.ts';
import {
  MIN_BASELINE_SAMPLES,
  emptyFaceBaseline,
  scoreAgainstBaseline,
  stdOf,
  updateFaceBaseline,
} from '../src/lib/faceBaseline.ts';
import { analyzeFrames, type ScannedFrame } from '../src/lib/faceScoring.ts';
// From faceTypes, not faceDetect: the latter imports react-native and expo-image-manipulator, and
// pulling either into node fails at parse time. That split is the point of faceTypes existing.
import { facingCamera, MAX_YAW_DEG, MAX_PITCH_DEG, type DetectedFace } from '../src/lib/faceTypes.ts';

/**
 * Tests for the face scan. Run with `npm run test:face` — plain node, no camera and no device.
 *
 * The division of labour changed with ML Kit, and so did what this file can honestly assert.
 * *Detection* is now a trained model running in native code, which cannot be exercised here at all;
 * what can be exercised is everything built on top of a detection — where the regions land inside a
 * given box, what the photometry makes of them, and which series the analyser accepts or refuses.
 *
 * That is a better split than the old one. The previous suite spent most of its assertions checking
 * that a hand-rolled skin rule found a synthetic blob, which told us nothing about whether it found
 * a real face — and it did not, which is the defect that prompted this rewrite. The detections below
 * are fixtures precisely because the real ones come from a model, and fixtures let the analyser's
 * decisions be tested against detections a camera would be hard-pressed to produce on demand.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

const W = 96;
const H = 128;

interface FaceSpec {
  /** Skin luminance 0..255 for the face area. */
  skin?: number;
  /** How much darker the eye band is than the cheeks, 0..1. */
  periorbital?: number;
  /** Extra red in the cheeks, 0..255. */
  redness?: number;
  /** Background luminance 0..255. */
  bg?: number;
  /** Shifts the whole face down by this fraction of the frame, to move it off the box. */
  offsetY?: number;
}

/** The box the detector would return for the faces drawn below. */
const BOX: NormBox = { x0: 0.2, x1: 0.8, y0: 0.15, y1: 0.9 };

/**
 * A frame with a face-shaped luminance arrangement inside BOX.
 *
 * Drawn to the box rather than to a detector's taste: these fixtures no longer have to satisfy a
 * skin rule, so they can be simple and say exactly what they mean.
 */
function makeFrame(spec: FaceSpec = {}): Frame {
  const { skin = 170, periorbital = 0.15, redness = 0, bg = 40, offsetY = 0 } = spec;
  const data = new Uint8ClampedArray(W * H * 4);
  const face = toPixels(BOX, W, H);
  const shift = Math.round(offsetY * H);
  const { eyes, cheeks } = regionsIn({ data, width: W, height: H }, BOX);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const sy = y - shift;
      const inFace = sy >= face.y0 && sy < face.y1 && x >= face.x0 && x < face.x1;
      let r: number;
      let g: number;
      let b: number;
      if (!inFace) {
        r = g = b = bg;
      } else if (sy >= eyes.y0 && sy < eyes.y1 && x >= eyes.x0 && x < eyes.x1) {
        const v = skin * (1 - periorbital);
        r = g = b = v;
      } else if (sy >= cheeks.y0 && sy < cheeks.y1 && x >= cheeks.x0 && x < cheeks.x1) {
        r = Math.min(255, skin + redness);
        g = skin;
        b = skin;
      } else {
        r = g = b = skin;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

/** A detection fixture. Defaults are a large, frontal, wide-open face. */
function face(over: Partial<DetectedFace> = {}): DetectedFace {
  return {
    box: BOX,
    leftEyeOpen: 0.95,
    rightEyeOpen: 0.95,
    eyeOpen: 0.95,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    leftEye: null,
    rightEye: null,
    ear: 0.28,
    mar: 0.05,
    mouthCornerDrop: 0.0,
    ...over,
  };
}

const scanned = (n: number, frame: Frame, f: DetectedFace | null, periodMs = 150): ScannedFrame[] =>
  Array.from({ length: n }, (_, i) => ({ frame, at: 1_000_000 + i * periodMs, face: f }));

// ---------------------------------------------------------------------------
console.log('regions land where the detector says the face is');
{
  const frame = makeFrame();
  const { face: box, eyes, cheeks } = regionsIn(frame, BOX);
  check('the face box matches the detection', box.x0 === toPixels(BOX, W, H).x0 && box.y1 === toPixels(BOX, W, H).y1);
  check('the eye band sits inside the face', eyes.y0 >= box.y0 && eyes.y1 <= box.y1, eyes);
  check('the cheeks sit below the eyes', cheeks.y0 >= eyes.y1, { eyes, cheeks });
  check('and both are inset from the sides', eyes.x0 > box.x0 && cheeks.x0 > box.x0);
  check('neither region is degenerate', eyes.y1 > eyes.y0 && cheeks.y1 > cheeks.y0);
}

console.log('\nlandmarks move the eye band, when there are any');
{
  const frame = makeFrame();
  const high = regionsIn(frame, BOX, { left: { x: 0.35, y: 0.3 }, right: { x: 0.65, y: 0.3 } });
  const low = regionsIn(frame, BOX, { left: { x: 0.35, y: 0.6 }, right: { x: 0.65, y: 0.6 } });
  check('a higher eye line raises the band', high.eyes.y0 < low.eyes.y0, { high: high.eyes, low: low.eyes });
  check('and the cheeks follow it down', high.cheeks.y0 < low.cheeks.y0);
  check('the band stays inside the face either way', low.eyes.y1 <= toPixels(BOX, W, H).y1);
}

console.log('\nthe photometry measures what it says it measures');
{
  const plain = extractFeaturesIn(makeFrame({ periorbital: 0 }), BOX);
  const dark = extractFeaturesIn(makeFrame({ periorbital: 0.3 }), BOX);
  check('darker sockets raise periorbital', dark.periorbital > plain.periorbital, { plain: plain.periorbital, dark: dark.periorbital });
  check('and a flat face reports about none', Math.abs(plain.periorbital) < 0.02, plain.periorbital);

  const pale = extractFeaturesIn(makeFrame({ redness: 0 }), BOX);
  const flushed = extractFeaturesIn(makeFrame({ redness: 60 }), BOX);
  check('redder cheeks raise redness', flushed.redness > pale.redness, { pale: pale.redness, flushed: flushed.redness });

  const dim = extractFeaturesIn(makeFrame({ skin: 40 }), BOX);
  const lit = extractFeaturesIn(makeFrame({ skin: 200 }), BOX);
  check('brightness follows the light on the face', lit.brightness > dim.brightness, { dim: dim.brightness, lit: lit.brightness });
  check('and is measured inside the box, not over the frame', Math.abs(lit.brightness - 200 / 255) < 0.15, lit.brightness);
}

console.log('\nbrightness ignores the background, which is what backlighting broke before');
{
  // Same face, opposite rooms. The old pipeline multiplied in a face-versus-corner contrast term
  // that went to zero whenever the room was brighter than the face, which pinned the likelihood at
  // exactly the rejection threshold. Nothing downstream may depend on that comparison again.
  const darkRoom = extractFeaturesIn(makeFrame({ skin: 150, bg: 10 }), BOX);
  const litRoom = extractFeaturesIn(makeFrame({ skin: 150, bg: 240 }), BOX);
  check('the same face reads the same brightness in both', Math.abs(darkRoom.brightness - litRoom.brightness) < 0.01, {
    darkRoom: darkRoom.brightness,
    litRoom: litRoom.brightness,
  });
  check('and the same periorbital', Math.abs(darkRoom.periorbital - litRoom.periorbital) < 0.01);
}

console.log('\nmotion is measured over the face, not the frame');
{
  const still = makeFrame();
  const moved = makeFrame({ offsetY: 0.1 });
  const boxed = (f: Frame) => ({ frame: f, box: BOX });
  check('a still series has no motion', frameMotion([boxed(still), boxed(still)]) === 0);
  check('a moving one does', frameMotion([boxed(still), boxed(moved)]) > 0, frameMotion([boxed(still), boxed(moved)]));
  check('a single frame cannot move', frameMotion([boxed(still)]) === 0);
}

console.log('\nhead pose decides whether a frame is worth measuring');
{
  check('square to the camera is fine', facingCamera(face()));
  check('a slight turn is still fine', facingCamera(face({ headYaw: MAX_YAW_DEG - 1 })));
  check('a big turn is not', !facingCamera(face({ headYaw: MAX_YAW_DEG + 1 })));
  check('nor is a big tilt', !facingCamera(face({ headPitch: MAX_PITCH_DEG + 1 })));
  check('the check is symmetric', !facingCamera(face({ headYaw: -(MAX_YAW_DEG + 1) })));
  check('missing angles are treated as square', facingCamera(face({ headYaw: null, headPitch: null })));
}

// ---------------------------------------------------------------------------
console.log('\nthe analyser refuses what it cannot measure');
{
  const frame = makeFrame();
  const opts = { captureDurationMs: 3000, photoUri: null };

  check('no frames at all is no-frames', analyzeFrames([], null, opts).status === 'no-frames');

  check(
    'a detector that never loaded is no-frames, not no-face',
    analyzeFrames(scanned(20, frame, face()), null, { ...opts, detectorUnavailable: true }).status === 'no-frames'
  );

  check('frames with no face found is no-face', analyzeFrames(scanned(20, frame, null), null, opts).status === 'no-face');

  // A turned head detects fine and measures nothing useful, so it counts as undetected.
  check(
    'a series of turned heads is no-face',
    analyzeFrames(scanned(20, frame, face({ headYaw: 70 })), null, opts).status === 'no-face'
  );

  const mostly = [...scanned(6, frame, face()), ...scanned(14, frame, null)];
  check('and so is a series that mostly missed', analyzeFrames(mostly, null, opts).status === 'no-face');

  const enough = [...scanned(14, frame, face()), ...scanned(6, frame, null)];
  check('but a series that mostly found is measured', analyzeFrames(enough, null, opts).status === 'ok');
}

console.log('\nand it refuses the conditions it genuinely cannot work in');
{
  const opts = { captureDurationMs: 3000, photoUri: null };
  const dark = analyzeFrames(scanned(20, makeFrame({ skin: 8, bg: 4 }), face()), null, opts);
  check('an unlit face is too-dark', dark.status === 'too-dark', dark.status);

  // Alternating positions across the series is a phone being waved about.
  const a = makeFrame();
  const b = makeFrame({ offsetY: 0.25, skin: 40 });
  const shaky: ScannedFrame[] = Array.from({ length: 20 }, (_, i) => ({
    frame: i % 2 ? a : b,
    at: 1_000_000 + i * 150,
    face: face(),
  }));
  check('a waved phone is unstable', analyzeFrames(shaky, null, opts).status === 'unstable', analyzeFrames(shaky, null, opts).status);
}

console.log('\na lit room and a grainy sensor no longer decide the outcome');
{
  // The three conditions that made the photometric detector reject real faces. None of them may
  // change the analyser's verdict now that detection is a model's job.
  const opts = { captureDurationMs: 3000, photoUri: null };
  for (const [name, frame] of [
    ['dim room', makeFrame({ skin: 120, bg: 15 })],
    ['lit room, backlit face', makeFrame({ skin: 120, bg: 245 })],
    ['bright room', makeFrame({ skin: 200, bg: 230 })],
  ] as const) {
    check(`${name} is measured`, analyzeFrames(scanned(20, frame, face()), null, opts).status === 'ok');
  }
  // A close selfie fills the frame. The old code returned null for a box touching three edges.
  const full: NormBox = { x0: 0.0, x1: 1.0, y0: 0.0, y1: 1.0 };
  const close = analyzeFrames(scanned(20, makeFrame(), face({ box: full })), null, opts);
  check('a face filling the frame is measured', close.status === 'ok', close.status);
}

console.log('\nthe eyelid measure rides along with the scan');
{
  const frame = makeFrame();
  const opts = { captureDurationMs: 3000, photoUri: null };

  const awake = analyzeFrames(scanned(20, frame, face({ eyeOpen: 0.95 })), null, opts);
  check('an open-eyed scan reports no closure', awake.status === 'ok' && awake.metrics.closureFraction === 0, awake);

  const shut = analyzeFrames(scanned(20, frame, face({ eyeOpen: 0.03 })), null, opts);
  check(
    'a shut-eyed scan reports near-total closure',
    shut.status === 'ok' && (shut.metrics.closureFraction ?? 0) > 0.95,
    shut.status === 'ok' ? shut.metrics.closureFraction : shut.status
  );

  // Too slow to time eyelids: the measure is dropped rather than reported wrongly.
  const slow = analyzeFrames(scanned(20, frame, face({ eyeOpen: 0.03 }), 800), null, opts);
  check(
    'a slow camera drops the eyelid measure entirely',
    slow.status === 'ok' && slow.metrics.closureFraction === undefined,
    slow.status === 'ok' ? slow.metrics.closureFraction : slow.status
  );
  check('but still returns the rest of the scan', slow.status === 'ok');
}

// ---------------------------------------------------------------------------
console.log('\nthe personal baseline still behaves');
{
  const empty = emptyFaceBaseline();
  check('a new baseline has no samples', empty.periorbital.n === 0);

  let bl = empty;
  const typical = { brightness: 0.5, redness: 0.05, periorbital: 0.15, eyeContrast: 1.2, motion: 0.02 };
  for (let i = 0; i < MIN_BASELINE_SAMPLES; i++) {
    bl = updateFaceBaseline(bl, { ...typical, periorbital: 0.15 + (i % 3) * 0.01 });
  }
  check('it fills up', bl.periorbital.n >= MIN_BASELINE_SAMPLES, bl.periorbital.n);

  const same = scoreAgainstBaseline(typical, bl);
  check('a typical face scores near zero', Math.abs(same.zScore) < 1, same.zScore);
  check('and is not provisional once the baseline is full', !same.provisional, same);

  const tired = scoreAgainstBaseline({ ...typical, periorbital: 0.4, closureFraction: 0.5 }, bl);
  check('a heavier face scores more negative', tired.zScore < same.zScore, { same: same.zScore, tired: tired.zScore });

  const noBaseline = scoreAgainstBaseline(typical, null);
  check('with no baseline the score is provisional', noBaseline.provisional);
}

console.log('\nstandard deviation is not fooled by a flat run');
{
  // stdOf takes a Welford accumulator and a floor, and the floor is the interesting part: with a
  // handful of samples a feature can look almost perfectly stable by luck, and dividing by that
  // near-zero spread turns an ordinary scan into a huge z-score.
  const flat = { n: 4, mean: 1, m2: 0 };
  const varied = { n: 4, mean: 2.5, m2: 5 };
  check('a constant series is held at the floor, not at zero', stdOf(flat, 0.01) === 0.01, stdOf(flat, 0.01));
  check('a varying one exceeds the floor', stdOf(varied, 0.01) > 0.01, stdOf(varied, 0.01));
  check('and an empty one does not divide by zero', Number.isFinite(stdOf({ n: 0, mean: 0, m2: 0 }, 0.01)));
}

console.log('\naggregation takes the median, so one odd frame cannot swing it');
{
  const normal = makeFrame({ periorbital: 0.15 });
  const flare = makeFrame({ periorbital: 0.9 });
  const located = [normal, normal, flare, normal, normal].map((f) => ({ frame: f, box: BOX }));
  const agg = aggregate(located);
  const clean = extractFeaturesIn(normal, BOX);
  check('the outlier does not move the median', agg !== null && Math.abs(agg.periorbital - clean.periorbital) < 0.02, {
    agg: agg?.periorbital,
    clean: clean.periorbital,
  });
  check('an empty series aggregates to nothing', aggregate([]) === null);
}

console.log('\nevery feature the spec lists actually reaches the score');
{
  /**
   * The regression this exists for: skin tone was measured on every scan, stored on every record and
   * synced to the backend, and contributed nothing to the score. It looked complete from the data
   * model and from the UI, and was inert. A channel that cannot move the number is not a feature.
   *
   * Each case below builds a baseline from a typical face, then moves exactly one channel and
   * asserts the score moves in the fatigue direction. If a channel is ever unhooked again, its case
   * fails rather than the suite quietly passing with one fewer input.
   */
  const typical = {
    brightness: 0.5,
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
  };
  let bl = emptyFaceBaseline();
  for (let i = 0; i < MIN_BASELINE_SAMPLES + 2; i++) {
    bl = updateFaceBaseline(bl, { ...typical, periorbital: typical.periorbital + (i % 3) * 0.005 });
  }
  const base = scoreAgainstBaseline(typical, bl).zScore;

  // Each entry moves one channel toward fatigue: eyes shut more, lids narrower, sockets darker,
  // eyes redder, mouth slacker, skin paler, more sway.
  const worse: [string, Partial<typeof typical>][] = [
    ['eyelid closure', { closureFraction: 0.55 }],
    ['EAR', { ear: 0.16 }],
    ['periorbital darkness in LAB', { periorbitalLab: 16 }],
    ['scleral redness', { scleralRedness: 0.3 }],
    ['MAR', { mar: 0.2 }],
    ['skin-tone pallor', { skinToneChroma: 12 }],
    ['head sway', { motion: 0.09 }],
    ['cheek redness', { redness: 0.14 }],
  ];
  for (const [name, delta] of worse) {
    const moved = scoreAgainstBaseline({ ...typical, ...delta }, bl).zScore;
    check(`${name} moves the score`, moved < base, `${base} -> ${moved}`);
  }

  // And the inverse: a channel the detector could not measure must not be read as a zero reading.
  const withoutEar = scoreAgainstBaseline({ ...typical, ear: undefined }, bl).zScore;
  check('an unmeasured channel does not drag the score', Math.abs(withoutEar - base) < 0.35, { base, withoutEar });
  const shutButNoEar = scoreAgainstBaseline({ ...typical, ear: undefined, closureFraction: 0.55 }, bl).zScore;
  check('and the remaining channels still carry it', shutButNoEar < base, { base, shutButNoEar });
}

console.log(failures === 0 ? '\nAll face checks passed.' : `\n${failures} face check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
