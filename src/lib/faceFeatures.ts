/**
 * Photometric measurement inside a face that has already been found.
 *
 * Every number here comes from the user's own pixels. There is no model and no simulation: given
 * RGBA frames and the face box ML Kit returned for them, this measures luminance, colour and local
 * contrast over anatomically-anchored regions, and movement between frames.
 *
 * ## This file used to do the finding too, and that was the bug
 *
 * It contained `locateFace` (a YCbCr skin rule plus row-run grouping), `faceStructure` (a dark,
 * detailed band above a smooth one) and `faceLikelihood` (all of it multiplied into one number and
 * thresholded). Three ways that rejected real faces:
 * backlighting pinned the product at exactly the rejection threshold, sensor grain collapsed the
 * structure term, and a close selfie tripped the frame-filling guards added to reject blank walls.
 *
 * Detection now belongs to faceDetect.ts and a trained detector. What is left here is the part
 * photometry is genuinely good at — comparing regions of a face to each other — and it is now
 * anchored to a box and eye positions that were *found* rather than assumed, which is the thing the
 * old integral-projection search was trying and failing to do.
 *
 * Pure and platform-free, so scripts can drive it with synthetic frames.
 */

export interface Frame {
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

/** A rectangle in normalised 0..1 frame coordinates — the space a detection speaks. */
export type { NormBox } from './faceTypes';
import type { NormBox } from './faceTypes';

export interface FaceFeatures {
  /** Mean luminance of the face box, 0..1. Doubles as the low-light check. */
  brightness: number;
  /** Mean (R - (G+B)/2)/255 over the cheeks. Higher with flushed skin and reddened eyes. */
  redness: number;
  /** (cheek luminance - eye-band luminance) / cheek luminance. Higher = darker eye region. */
  periorbital: number;
  /** Eye-band edge energy over face-box edge energy. Retained as a secondary texture signal. */
  eyeContrast: number;
  /**
   * Periorbital darkness in CIELAB L*, as the spec asks: the lightness drop from the cheek to the
   * region directly under the eye, in L* units (0..100 scale).
   *
   * Kept alongside `periorbital` rather than replacing it, because they are not the same measurement
   * and the older one is not wrong — it is a luminance ratio over the eye *band*, which includes the
   * lid and lashes. This one is the under-eye skin only, which is where a dark circle actually is,
   * and L* is perceptually uniform where Rec.709 luma is not: a 5-unit L* drop looks like the same
   * amount of darkening on any skin tone, which a luma ratio cannot promise.
   */
  periorbitalLab: number;
  /**
   * Scleral redness: the fraction of pixels in the eye opening whose hue is in the red band with
   * enough saturation to mean it, measured in HSV as the spec specifies.
   *
   * Distinct from `redness`, which is a cheek measurement and reads flush rather than eye redness.
   */
  scleralRedness: number;
  /** Mean cheek L* (0..100). Pallor shows here, scored against the person's own baseline. */
  skinToneL: number;
  /** Mean cheek chroma, sqrt(a*² + b*²). Pallor drops chroma as well as lightness. */
  skinToneChroma: number;
}

export type PixelBox = { x0: number; x1: number; y0: number; y1: number };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function toPixels(b: NormBox, w: number, h: number): PixelBox {
  const x0 = clamp(Math.floor(b.x0 * w), 0, Math.max(0, w - 1));
  const y0 = clamp(Math.floor(b.y0 * h), 0, Math.max(0, h - 1));
  return {
    x0,
    y0,
    // At least one pixel wide and tall: a degenerate box makes every mean below a divide by zero.
    x1: clamp(Math.ceil(b.x1 * w), x0 + 1, w),
    y1: clamp(Math.ceil(b.y1 * h), y0 + 1, h),
  };
}

/** Rec. 709 luma, 0..1. */
export const luma = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function lumaAt(f: Frame, x: number, y: number): number {
  const i = (y * f.width + x) * 4;
  return luma(f.data[i], f.data[i + 1], f.data[i + 2]);
}

export function meanLumaIn(f: Frame, box: PixelBox): number {
  let sum = 0;
  let n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      sum += lumaAt(f, x, y);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Mean edge energy: the average of the horizontal and vertical luminance gradients. Open eyes are
 * mostly edges (lash line, iris rim, sclera boundary); a heavy lid is mostly a smooth surface.
 */
export function edgeEnergyIn(f: Frame, box: PixelBox): number {
  let sum = 0;
  let n = 0;
  for (let y = box.y0; y < box.y1 - 1; y++) {
    for (let x = box.x0; x < box.x1 - 1; x++) {
      const l = lumaAt(f, x, y);
      sum += Math.abs(lumaAt(f, x + 1, y) - l) + Math.abs(lumaAt(f, x, y + 1) - l);
      n++;
    }
  }
  return n ? sum / (2 * n) : 0;
}

/** Mean luminance of one row within a horizontal span. */
export function rowLuma(f: Frame, x0: number, x1: number, y: number): number {
  let sum = 0;
  let n = 0;
  for (let x = x0; x < x1; x++) {
    sum += lumaAt(f, x, y);
    n++;
  }
  return n ? sum / n : 0;
}

/**
 * sRGB to CIELAB, via linear RGB and XYZ under D65.
 *
 * Written out rather than approximated because the spec asks for LAB by name, and the reason it does
 * is the gamma curve: sRGB is deliberately non-linear, so a fixed difference in 8-bit values means a
 * different amount of visible darkening depending on where on the scale it sits. Perceptual
 * uniformity is exactly the property a "how much darker is this than that" measurement needs, and it
 * is the property that makes the same threshold work across skin tones instead of only across the
 * tones it was tuned on.
 */
export function rgbToLab(r: number, g: number, b: number): { L: number; a: number; bb: number } {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);

  // sRGB → XYZ (D65), then normalised by the D65 white point.
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;

  const EPS = 216 / 24389;
  const KAPPA = 24389 / 27;
  const fx = X > EPS ? Math.cbrt(X) : (KAPPA * X + 16) / 116;
  const fy = Y > EPS ? Math.cbrt(Y) : (KAPPA * Y + 16) / 116;
  const fz = Z > EPS ? Math.cbrt(Z) : (KAPPA * Z + 16) / 116;

  return { L: 116 * fy - 16, a: 500 * (fx - fy), bb: 200 * (fy - fz) };
}

/** sRGB to HSV. Hue in degrees 0..360, saturation and value 0..1. */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;

  let h = 0;
  if (d > 1e-9) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max > 0 ? d / max : 0, v: max };
}

/** Mean CIELAB over a region. */
export function meanLabIn(f: Frame, box: PixelBox): { L: number; a: number; bb: number } {
  let L = 0;
  let a = 0;
  let bb = 0;
  let n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * f.width + x) * 4;
      const lab = rgbToLab(f.data[i], f.data[i + 1], f.data[i + 2]);
      L += lab.L;
      a += lab.a;
      bb += lab.bb;
      n++;
    }
  }
  return n ? { L: L / n, a: a / n, bb: bb / n } : { L: 0, a: 0, bb: 0 };
}

/**
 * Fraction of a region that reads as red sclera.
 *
 * Red hue wraps around zero in HSV, so the band is two ranges rather than one — the bug that makes
 * naive hue thresholds miss half of every red thing. Saturation and value floors keep dark lashes
 * and near-grey skin out: an almost-black pixel has a hue, and it means nothing.
 */
export function redFractionIn(f: Frame, box: PixelBox): number {
  let hits = 0;
  let n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * f.width + x) * 4;
      const { h, s, v } = rgbToHsv(f.data[i], f.data[i + 1], f.data[i + 2]);
      const redHue = h >= 340 || h <= 20;
      if (redHue && s >= 0.25 && v >= 0.2) hits++;
      n++;
    }
  }
  return n ? hits / n : 0;
}

function meanRedness(f: Frame, box: PixelBox): number {
  let sum = 0;
  let n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * f.width + x) * 4;
      sum += (f.data[i] - (f.data[i + 1] + f.data[i + 2]) / 2) / 255;
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Where the eyes and cheeks sit inside a detected face box.
 *
 * `eyeCentres` come from ML Kit's landmarks when classification returned them, and the band is
 * placed on the measured eye line rather than a proportion of the box. That is the difference
 * between measuring someone's eye region and measuring whatever was 38% of the way down a
 * rectangle — the same failure the deleted integral-projection search was written to avoid, solved
 * properly this time by using positions the detector actually reports.
 *
 * The proportional fallback is used only when landmarks are absent, and the proportions are those of
 * ML Kit's bounding box, which is tighter than the skin-blob box the old code produced: the eye line
 * of a detected face sits close to 40% of the way down it.
 */
export function regionsIn(
  frame: Frame,
  box: NormBox,
  eyeCentres?: { left: { x: number; y: number } | null; right: { x: number; y: number } | null }
): { face: PixelBox; eyes: PixelBox; cheeks: PixelBox; underEyes: PixelBox } {
  const { width: w, height: h } = frame;
  const face = toPixels(box, w, h);
  const faceH = face.y1 - face.y0;
  const faceW = face.x1 - face.x0;

  const centres = [eyeCentres?.left, eyeCentres?.right].filter((p): p is { x: number; y: number } => !!p);
  const eyeLineY = centres.length
    ? centres.reduce((a, p) => a + p.y, 0) / centres.length
    : box.y0 + (box.y1 - box.y0) * 0.4;

  const bandH = Math.max(2, Math.round(faceH * 0.16));
  const centreY = clamp(Math.round(eyeLineY * h), face.y0 + 1, face.y1 - 1);
  const eyes: PixelBox = {
    x0: face.x0 + Math.round(faceW * 0.08),
    x1: face.x1 - Math.round(faceW * 0.08),
    y0: clamp(centreY - Math.round(bandH / 2), face.y0, face.y1 - 2),
    y1: clamp(centreY + Math.round(bandH / 2), face.y0 + 2, face.y1),
  };

  // Cheeks: below the eyes, inset from the edges, above the mouth. Placed relative to where the
  // eyes actually were, so the two regions cannot overlap or swap places on a tilted head.
  const cheekTop = clamp(eyes.y1 + Math.round(faceH * 0.08), face.y0 + 2, face.y1 - 2);
  const cheeks: PixelBox = {
    x0: face.x0 + Math.round(faceW * 0.12),
    x1: face.x1 - Math.round(faceW * 0.12),
    y0: cheekTop,
    y1: clamp(cheekTop + Math.max(2, Math.round(faceH * 0.18)), cheekTop + 2, face.y1),
  };

  // Directly under the eye, above the cheek — where a dark circle actually sits. The eye band
  // itself is the wrong place to measure one: it is mostly lid, lash and iris, so it is dark on
  // everybody regardless of how they slept.
  const underTop = clamp(eyes.y1, face.y0 + 1, face.y1 - 2);
  const underEyes: PixelBox = {
    x0: eyes.x0,
    x1: eyes.x1,
    y0: underTop,
    y1: clamp(underTop + Math.max(2, Math.round(faceH * 0.09)), underTop + 2, face.y1),
  };

  return { face, eyes, cheeks, underEyes };
}

/** The photometric features of one frame, given where its face is. */
export function extractFeaturesIn(
  frame: Frame,
  box: NormBox,
  eyeCentres?: { left: { x: number; y: number } | null; right: { x: number; y: number } | null }
): FaceFeatures {
  const { face, eyes, cheeks, underEyes } = regionsIn(frame, box, eyeCentres);

  const faceLuma = meanLumaIn(frame, face);
  const eyeLuma = meanLumaIn(frame, eyes);
  const cheekLuma = meanLumaIn(frame, cheeks);
  const faceEdges = edgeEnergyIn(frame, face);
  const eyeEdges = edgeEnergyIn(frame, eyes);

  // The spec's colour features. Cheek is the reference region for both of them: it is the largest
  // patch of plain skin on a face, and it is the one the user's own baseline is most stable on.
  const cheekLab = meanLabIn(frame, cheeks);
  const underLab = meanLabIn(frame, underEyes);

  return {
    brightness: faceLuma,
    redness: meanRedness(frame, cheeks),
    // Positive means the under-eye is darker than the cheek, which is the direction a dark circle
    // goes. In L* units, so it is comparable between people rather than only within one.
    periorbitalLab: Number((cheekLab.L - underLab.L).toFixed(3)),
    scleralRedness: Number(redFractionIn(frame, eyes).toFixed(4)),
    skinToneL: Number(cheekLab.L.toFixed(3)),
    skinToneChroma: Number(Math.hypot(cheekLab.a, cheekLab.bb).toFixed(3)),
    // Guard the divide: an unlit frame has no meaningful ratio, and 0 is the honest answer.
    periorbital: cheekLuma > 0.02 ? (cheekLuma - eyeLuma) / cheekLuma : 0,
    eyeContrast: faceEdges > 1e-4 ? eyeEdges / faceEdges : 0,
  };
}

/**
 * Mean absolute luminance change between consecutive frames over the face box, 0..1.
 *
 * This is head steadiness — real movement, measured. Postural sway rises with fatigue, and it
 * doubles as a capture-quality signal, since a frame series taken while the phone is being moved
 * cannot support the other measurements either.
 *
 * Measured over the union of the two frames' face boxes rather than a fixed rectangle: a fixed
 * rectangle measures how much the *background* changed whenever the head moves out of it.
 */
export function frameMotion(frames: { frame: Frame; box: NormBox }[]): number {
  if (frames.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1];
    const b = frames[k];
    if (a.frame.width !== b.frame.width || a.frame.height !== b.frame.height) continue;
    const union: NormBox = {
      x0: Math.min(a.box.x0, b.box.x0),
      x1: Math.max(a.box.x1, b.box.x1),
      y0: Math.min(a.box.y0, b.box.y0),
      y1: Math.max(a.box.y1, b.box.y1),
    };
    const box = toPixels(union, a.frame.width, a.frame.height);
    let sum = 0;
    let n = 0;
    for (let y = box.y0; y < box.y1; y++) {
      for (let x = box.x0; x < box.x1; x++) {
        sum += Math.abs(lumaAt(a.frame, x, y) - lumaAt(b.frame, x, y));
        n++;
      }
    }
    if (n) {
      total += sum / n;
      pairs++;
    }
  }
  return pairs ? total / pairs : 0;
}

/** Median is the right summary across frames: one blink or one flare should not move the result. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** One frame, its detected box, and the eye centres that came with it. */
export interface LocatedFrame {
  frame: Frame;
  box: NormBox;
  eyes?: { left: { x: number; y: number } | null; right: { x: number; y: number } | null };
}

/** Per-feature median across the located frames, plus the motion measured between them. */
export function aggregate(located: LocatedFrame[]): (FaceFeatures & { motion: number }) | null {
  if (!located.length) return null;
  const per = located.map((l) => extractFeaturesIn(l.frame, l.box, l.eyes));
  return {
    brightness: median(per.map((f) => f.brightness)),
    redness: median(per.map((f) => f.redness)),
    periorbital: median(per.map((f) => f.periorbital)),
    eyeContrast: median(per.map((f) => f.eyeContrast)),
    periorbitalLab: median(per.map((f) => f.periorbitalLab)),
    scleralRedness: median(per.map((f) => f.scleralRedness)),
    skinToneL: median(per.map((f) => f.skinToneL)),
    skinToneChroma: median(per.map((f) => f.skinToneChroma)),
    motion: frameMotion(located),
  };
}
