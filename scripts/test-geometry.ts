import { averageEAR, eyeAspectRatio, mouthAspectRatio, mouthCornerDrop, extremesX, type Point } from '../src/lib/faceGeometry.ts';
import { rgbToLab, rgbToHsv, meanLabIn, redFractionIn, type Frame } from '../src/lib/faceFeatures.ts';

/**
 * The architecture spec's facial feature table, tested where it can be: the geometry and the colour
 * science, both of which are pure functions of inputs a device would supply.
 *
 * What these cannot check is whether ML Kit's contours land on real eyelids — that needs a camera.
 * What they can check is that, *given* a contour, EAR falls as the lid closes; that LAB is the real
 * transform and not an approximation that happens to look right on mid-greys; and that the red-hue
 * band wraps around zero, which is the mistake naive HSV thresholds make.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

/**
 * An eye contour as a lens shape: two arcs meeting at the corners.
 *
 * `openness` scales the vertical half-axis, so 1 is wide open and 0 is a closed line. This is the
 * shape a real eye contour has, which matters — a rectangle would make every sampled column report
 * the same gap and hide any bug in the sampling.
 */
function eyeContour(openness: number, width = 0.1, cx = 0.4, cy = 0.4): Point[] {
  const points: Point[] = [];
  const halfH = (width / 2) * 0.55 * openness;
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    points.push({ x: cx + (width / 2) * Math.cos(t), y: cy + halfH * Math.sin(t) });
  }
  return points;
}

/** Upper and lower lip contours as two arcs, `gap` apart at the centre. */
function lips(gap: number, width = 0.2, cx = 0.5, cy = 0.7, drop = 0) {
  const upper: Point[] = [];
  const lower: Point[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const x = cx - width / 2 + width * t;
    // Corners sit `drop` lower than the middle when drop > 0.
    const cornerness = Math.abs(t - 0.5) * 2;
    const bow = drop * cornerness;
    upper.push({ x, y: cy - gap / 2 + bow });
    lower.push({ x, y: cy + gap / 2 + bow });
  }
  return { upper, lower };
}

console.log('EAR falls as the eye closes');
{
  const wide = eyeAspectRatio(eyeContour(1));
  const half = eyeAspectRatio(eyeContour(0.5));
  const shut = eyeAspectRatio(eyeContour(0.02));
  check('a wide eye measures wide', wide != null && wide > 0.2, wide);
  check('a half-closed one measures less', half != null && wide != null && half < wide, { wide, half });
  check('and a shut one is near zero', shut != null && shut < 0.03, shut);
  check('the ordering is strict', wide! > half! && half! > shut!, { wide, half, shut });
}

console.log('\nEAR is a ratio, so it does not depend on how close the phone is held');
{
  // The same eye at two apparent sizes. A ratio of distances must be invariant to scale — this is
  // the property that makes the measure worth having over a raw pixel height.
  const near = eyeAspectRatio(eyeContour(1, 0.2));
  const far = eyeAspectRatio(eyeContour(1, 0.06));
  check('a near and a far eye agree', near != null && far != null && Math.abs(near - far) < 0.02, { near, far });
}

console.log('\nEAR refuses what it cannot measure');
{
  check('too few points is null', eyeAspectRatio([{ x: 0, y: 0 }, { x: 1, y: 1 }]) === null);
  check('a zero-width contour is null', eyeAspectRatio(Array.from({ length: 8 }, () => ({ x: 0.5, y: 0.4 }))) === null);
  check('an empty contour is null', eyeAspectRatio([]) === null);
  check('extremesX on a degenerate set is null', extremesX([{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }]) === null);
}

console.log('\nboth eyes average, and one eye is better than none');
{
  const both = averageEAR(eyeContour(1), eyeContour(0.2));
  const one = averageEAR(eyeContour(1), null);
  const wide = eyeAspectRatio(eyeContour(1));
  check('two eyes average between them', both != null && wide != null && both < wide, { both, wide });
  check('one eye still returns a value', one != null && wide != null && Math.abs(one - wide) < 1e-6, { one, wide });
  check('no eyes returns null', averageEAR(null, null) === null);
  check('empty contours return null', averageEAR([], []) === null);
}

console.log('\nMAR rises as the mouth opens');
{
  const closed = lips(0.005);
  const open = lips(0.08);
  const shut = mouthAspectRatio(closed.upper, closed.lower);
  const yawn = mouthAspectRatio(open.upper, open.lower);
  check('a closed mouth is near zero', shut != null && shut < 0.05, shut);
  check('an open one is clearly larger', yawn != null && shut != null && yawn > shut * 3, { shut, yawn });
  check('a missing lip contour is null', mouthAspectRatio(null, closed.lower) === null);
}

console.log('\nmouth-corner drop has a sign that means something');
{
  const neutral = lips(0.01, 0.2, 0.5, 0.7, 0);
  const droopy = lips(0.01, 0.2, 0.5, 0.7, 0.03);
  const smiling = lips(0.01, 0.2, 0.5, 0.7, -0.03);
  const n = mouthCornerDrop(neutral.upper, neutral.lower);
  const d = mouthCornerDrop(droopy.upper, droopy.lower);
  const sm = mouthCornerDrop(smiling.upper, smiling.lower);
  check('a neutral mouth is about zero', n != null && Math.abs(n) < 0.02, n);
  check('droopy corners are positive', d != null && d > 0, d);
  check('a smile is negative', sm != null && sm < 0, sm);
  check('and the three are ordered', sm! < n! && n! < d!, { sm, n, d });
}

console.log('\nCIELAB is the real transform');
{
  // Reference values: pure white is L*=100, black is 0, and mid-grey 128 lands near 53.6 — the
  // number that shows the gamma curve is being applied. A linear approximation would give ~50.
  const white = rgbToLab(255, 255, 255);
  const black = rgbToLab(0, 0, 0);
  const grey = rgbToLab(128, 128, 128);
  check('white is L*100', Math.abs(white.L - 100) < 0.1, white.L);
  check('black is L*0', Math.abs(black.L) < 0.1, black.L);
  check('mid-grey is L*53.6, not 50', Math.abs(grey.L - 53.6) < 0.5, grey.L);
  check('neutral greys have no chroma', Math.abs(grey.a) < 0.1 && Math.abs(grey.bb) < 0.1, grey);
  // Red is the classic check: high L*-independent a*.
  const red = rgbToLab(255, 0, 0);
  check('red has strongly positive a*', red.a > 60, red.a);
  const blue = rgbToLab(0, 0, 255);
  check('blue has strongly negative b*', blue.bb < -60, blue.bb);
}

console.log('\nLAB darkening is perceptually even, which is why the spec asks for it');
{
  // The same 30-unit drop in 8-bit values, once in the shadows and once in the highlights. In raw
  // luma these are identical; in L* the dark pair separates further, which is what actually matches
  // what an eye sees — and is why one L* threshold works across skin tones where a luma one does not.
  const darkPair = rgbToLab(60, 60, 60).L - rgbToLab(30, 30, 30).L;
  const lightPair = rgbToLab(230, 230, 230).L - rgbToLab(200, 200, 200).L;
  check('a shadow-end step is the larger in L*', darkPair > lightPair, { darkPair, lightPair });
}

console.log('\nHSV hue wraps, and the red band wraps with it');
{
  check('pure red is hue 0', Math.abs(rgbToHsv(255, 0, 0).h) < 1e-6);
  check('green is 120', Math.abs(rgbToHsv(0, 255, 0).h - 120) < 1e-6);
  check('blue is 240', Math.abs(rgbToHsv(0, 0, 255).h - 240) < 1e-6);
  check('grey has no saturation', rgbToHsv(128, 128, 128).s === 0);
  check('black has no value', rgbToHsv(0, 0, 0).v === 0);
  // Magenta-leaning red sits just below 360. A single-sided threshold would miss it entirely.
  const wrapped = rgbToHsv(255, 0, 40).h;
  check('a red past the wrap is above 340', wrapped > 340, wrapped);
}

/** A solid block of one colour, for the region measures. */
function solid(r: number, g: number, b: number, w = 8, h = 8): Frame {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
}

console.log('\nthe region measures read the region');
{
  const box = { x0: 0, x1: 8, y0: 0, y1: 8 };
  const lab = meanLabIn(solid(128, 128, 128), box);
  check('mean LAB over a flat block matches the pixel', Math.abs(lab.L - 53.6) < 0.5, lab.L);

  check('a fully red region is all red', redFractionIn(solid(220, 30, 30), box) === 1);
  check('a grey region is none', redFractionIn(solid(128, 128, 128), box) === 0);
  check('a near-black region is none, despite having a hue', redFractionIn(solid(20, 2, 2), box) === 0);
  check('a pale desaturated pink is none', redFractionIn(solid(230, 200, 200), box) === 0);
  const green = redFractionIn(solid(30, 200, 30), box);
  check('a green region is none', green === 0, green);
}

console.log(failures === 0 ? '\nAll geometry checks passed.' : `\n${failures} geometry check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
