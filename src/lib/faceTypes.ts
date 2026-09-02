/**
 * What a detected face is, and whether it is worth measuring — with no native dependencies.
 *
 * Split out of faceDetect.ts so that everything downstream of a detection stays testable in plain
 * node. faceDetect.ts imports `react-native` and `expo-image-manipulator`, and any module that
 * touches it inherits a dependency on a bundler; the analysis layer and its tests have no business
 * carrying that. The shape of a detection and the rule for rejecting an off-axis one are decisions,
 * not plumbing, so they live here and are exercised by `npm run test:face`.
 */

/** A rectangle in normalised 0..1 frame coordinates. */
export interface NormBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface DetectedFace {
  /**
   * The face box in normalised 0..1 coordinates of the frame.
   *
   * Normalised deliberately: detection runs at one resolution and the photometry at another, and a
   * box in pixels of one is meaningless to the other. ML Kit returns pixels; faceDetect.ts is the
   * only place that knows which pixels they were.
   */
  box: NormBox;
  /** Per-eye open probability, 0..1, or null when the classifier had no opinion. */
  leftEyeOpen: number | null;
  rightEyeOpen: number | null;
  /** Mean of the two where both exist, otherwise whichever one did. Null if neither. */
  eyeOpen: number | null;
  /** Head rotation in degrees. Y is the yaw that matters most — a head turned away. */
  headYaw: number | null;
  headPitch: number | null;
  headRoll: number | null;
  /** Normalised eye-centre positions, when landmark mode returned them. */
  leftEye: { x: number; y: number } | null;
  rightEye: { x: number; y: number } | null;
  /**
   * Eyelid aperture, both eyes averaged, from the detector's eye contours.
   *
   * A *measured* ratio of distances, where `eyeOpen` above is a classifier's probability. Both are
   * kept because they fail differently: EAR is geometry and degrades with head roll and with a
   * contour the detector had to guess; the probability is robust to pose but has no geometry behind
   * it. Null when contours were unavailable or too degenerate to measure.
   */
  ear: number | null;
  /** Mouth aperture over mouth width, from the lip contours. Null when unavailable. */
  mar: number | null;
  /**
   * How far the mouth corners sit below the mouth's own midline, as a fraction of its width.
   * Positive is the droop direction. Scored against the person's own baseline, so a naturally
   * downturned mouth is not read as permanent exhaustion.
   */
  mouthCornerDrop: number | null;
}

/**
 * Whether the head is pointed close enough to the camera for regional measurement to mean anything.
 *
 * A face at 60 degrees of yaw still detects perfectly well, and its eye region is still found — but
 * one eye is foreshortened and the cheek on the far side is in shadow, so brightness ratios across
 * the face stop comparing like with like. Better to say the frame was unusable than to average it in.
 *
 * The bounds are generous because a person checking their alertness at 6am is not holding the phone
 * square to their face, and rejecting every natural head angle would be its own kind of failure —
 * the same over-strictness that made the previous detector reject real faces outright.
 *
 * A missing angle counts as square rather than as a failure: ML Kit omits Euler angles in some
 * configurations, and treating "not reported" as "turned away" would throw away every frame.
 */
export const MAX_YAW_DEG = 35;
export const MAX_PITCH_DEG = 30;

export function facingCamera(face: DetectedFace): boolean {
  const yaw = Math.abs(face.headYaw ?? 0);
  const pitch = Math.abs(face.headPitch ?? 0);
  return yaw <= MAX_YAW_DEG && pitch <= MAX_PITCH_DEG;
}
