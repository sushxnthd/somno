/**
 * The geometric half of the facial feature set: EAR, MAR and mouth-corner droop.
 *
 * These are the features the architecture spec asks for by name, and they are geometry rather than
 * photometry — ratios of distances between landmark points, computed from ML Kit's eye and lip
 * contours. That distinction is the whole reason the spec chose this approach over a raw-pixel CNN:
 * a ratio of distances on the same face is invariant to lighting, skin tone, camera and distance in
 * a way that a pixel classifier is not, and it can be explained to the person it is about.
 *
 * ## Why these could not be computed before
 *
 * The detector was running with `contourMode: false`, which returns a bounding box and a handful of
 * landmark *centres* — enough to say where an eye is, not enough to say how open it is. EAR needs
 * the eyelid outline, and MAR needs the lip outline. Turning contours on is what makes the spec's
 * table implementable rather than aspirational, and it is the single change that moves the eyelid
 * signal from "a classifier's opinion about openness" to "a measured aperture ratio".
 *
 * Both measures survive alongside the classifier's probability rather than replacing it: they fail
 * in different ways. EAR degrades gracefully with head roll and is meaningless on a closed contour
 * that the detector guessed; the probability is robust to pose but is a single number with no
 * geometry behind it. The scan keeps both and lets the personal baseline weigh them.
 *
 * Everything here is pure and unit-free, working in normalised 0..1 frame coordinates, so
 * `npm run test:geometry` can drive it with synthetic contours.
 */

export interface Point {
  x: number;
  y: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Leftmost and rightmost points of a contour — the corners of an eye or a mouth. */
export function extremesX(points: Point[]): { left: Point; right: Point } | null {
  if (points.length < 2) return null;
  let left = points[0];
  let right = points[0];
  for (const p of points) {
    if (p.x < left.x) left = p;
    if (p.x > right.x) right = p;
  }
  return left === right ? null : { left, right };
}

/**
 * Eye Aspect Ratio: vertical opening over horizontal width.
 *
 * The classic formulation (Soukupová & Čech 2016) samples two vertical pairs against one horizontal
 * span across a six-point eye. ML Kit returns a denser contour — points all the way around the lid —
 * so rather than pick two pairs and hope they are the right ones, this measures the lid gap at
 * several positions across the eye and averages them. Denser input should give a steadier number,
 * not the same number with more steps.
 *
 * The method: find the eye's horizontal extent, then at each of a few sample columns take the
 * highest and lowest contour points near that column and measure the gap. Averaging those gaps and
 * dividing by the width gives a ratio that is ~0.3 for a wide-open eye and approaches 0 as the lid
 * closes — the same scale the published threshold conventions use.
 *
 * Returns null rather than a number when the contour cannot support the measurement. A squashed or
 * degenerate contour is not a closed eye, and reporting 0 for it would be the same class of error as
 * the inverting normalisation this pipeline already had once.
 */
export function eyeAspectRatio(contour: Point[]): number | null {
  if (contour.length < 6) return null;
  const ends = extremesX(contour);
  if (!ends) return null;
  const width = dist(ends.left, ends.right);
  if (width < 1e-6) return null;

  // Sample the interior only: at the corners the upper and lower lids meet, so the gap there is
  // zero by construction and would drag the mean down on every eye equally.
  const SAMPLES = [0.3, 0.5, 0.7];
  const gaps: number[] = [];
  for (const t of SAMPLES) {
    const targetX = ends.left.x + (ends.right.x - ends.left.x) * t;
    const band = width * 0.12;
    const near = contour.filter((p) => Math.abs(p.x - targetX) <= band);
    if (near.length < 2) continue;
    let top = near[0];
    let bottom = near[0];
    for (const p of near) {
      if (p.y < top.y) top = p;
      if (p.y > bottom.y) bottom = p;
    }
    gaps.push(bottom.y - top.y);
  }
  if (!gaps.length) return null;

  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return Number(Math.max(0, meanGap / width).toFixed(4));
}

/** Both eyes averaged, or whichever one the detector managed. */
export function averageEAR(left: Point[] | null, right: Point[] | null): number | null {
  const values = [left, right]
    .map((c) => (c && c.length ? eyeAspectRatio(c) : null))
    .filter((v): v is number => v != null);
  if (!values.length) return null;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4));
}

/**
 * Mouth Aspect Ratio: how far the mouth is open relative to its width.
 *
 * A yawn is the obvious fatigue cue and the one people expect this to catch, but the more useful
 * signal across a whole scan is the resting value: a slack jaw sits marginally more open than a held
 * one. Measured the same way as EAR so the two are on comparable footing.
 */
export function mouthAspectRatio(upperLip: Point[] | null, lowerLip: Point[] | null): number | null {
  if (!upperLip?.length || !lowerLip?.length) return null;
  const all = [...upperLip, ...lowerLip];
  const ends = extremesX(all);
  if (!ends) return null;
  const width = dist(ends.left, ends.right);
  if (width < 1e-6) return null;

  // The gap at the middle of the mouth, where an opening actually shows.
  const midX = (ends.left.x + ends.right.x) / 2;
  const band = width * 0.2;
  const upperNear = upperLip.filter((p) => Math.abs(p.x - midX) <= band);
  const lowerNear = lowerLip.filter((p) => Math.abs(p.x - midX) <= band);
  if (!upperNear.length || !lowerNear.length) return null;

  const upperY = Math.min(...upperNear.map((p) => p.y));
  const lowerY = Math.max(...lowerNear.map((p) => p.y));
  return Number(Math.max(0, (lowerY - upperY) / width).toFixed(4));
}

/**
 * How far the mouth corners sit below the line of the mouth, as a fraction of mouth width.
 *
 * The spec calls this the "corner-angle delta" and names droopy corners as the cue. Expressed as a
 * drop ratio rather than an angle in degrees because a ratio needs no reference axis: an angle would
 * have to be measured against something, and the only available something is the image horizontal,
 * which rotates with the user's head. The vertical offset of the corners against the mouth's own
 * midline rotates with it too, so the ratio cancels head roll instead of inheriting it.
 *
 * Positive means corners lower than the mouth's midline — the droop direction. Near zero is neutral,
 * negative is a smile. Like everything else here it is scored against the person's own baseline, so
 * a naturally downturned mouth is not read as permanent exhaustion.
 */
export function mouthCornerDrop(upperLip: Point[] | null, lowerLip: Point[] | null): number | null {
  if (!upperLip?.length || !lowerLip?.length) return null;
  const all = [...upperLip, ...lowerLip];
  const ends = extremesX(all);
  if (!ends) return null;
  const width = dist(ends.left, ends.right);
  if (width < 1e-6) return null;

  /**
   * The commissure — where the two lips actually meet — rather than one lip's endpoint.
   *
   * Taking the extreme point of the merged contour picks whichever lip happened to be first in the
   * array, so a perfectly neutral mouth reported a drop of exactly half its lip gap: with the lips
   * 0.005 apart across a 0.2-wide mouth, a steady −0.025 that varied with nothing but how far open
   * the mouth was. Averaging the two lips' extremes at each side puts the corner where anatomy has
   * it and makes the measure read zero on a level mouth, which is the only value it can start from
   * if the sign is to mean anything.
   */
  const sideCorner = (pick: (points: Point[]) => Point): Point => {
    const u = pick(upperLip);
    const l = pick(lowerLip);
    return { x: (u.x + l.x) / 2, y: (u.y + l.y) / 2 };
  };
  const leftmost = (points: Point[]) => points.reduce((a, p) => (p.x < a.x ? p : a));
  const rightmost = (points: Point[]) => points.reduce((a, p) => (p.x > a.x ? p : a));
  const leftCorner = sideCorner(leftmost);
  const rightCorner = sideCorner(rightmost);

  // The mouth's own midline: the mean height of the lip points that are not corners. Averaged over
  // both lips too, so the reference and the corners are measured the same way.
  const midX = (leftCorner.x + rightCorner.x) / 2;
  const central = all.filter((p) => Math.abs(p.x - midX) <= width * 0.25);
  if (!central.length) return null;
  const midlineY = central.reduce((a, p) => a + p.y, 0) / central.length;

  const cornerY = (leftCorner.y + rightCorner.y) / 2;
  return Number(((cornerY - midlineY) / width).toFixed(4));
}
