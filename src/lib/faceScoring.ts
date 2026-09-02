import type { FaceMetricsRecord } from '../store/types';
import { aggregate, type Frame, type LocatedFrame, type NormBox } from './faceFeatures';
import { ocularMeasures, type OcularMeasures, type OcularSample } from './ocular';
import { scoreAgainstBaseline, type FaceBaseline } from './faceBaseline';
import { facingCamera, type DetectedFace } from './faceTypes';
import { median } from './faceFeatures';

/**
 * The face scan, end to end: detected frames in, a measured fatigue deviation out.
 *
 * Detection is ML Kit's (see faceDetect.ts). What this file decides is whether the *series* is
 * usable, and what it is worth once it is.
 *
 * The two limits worth stating plainly, because they are stated to the user too: eye-open
 * probability is a classifier output rather than a measured lid aperture, so this is PERCLOS-shaped
 * rather than oculography; and a scan can only be scored once the same face has been seen a few
 * times, since the whole method is comparing a person to themselves.
 */

/** A scan either yields a score or explains why it could not — it never guesses. */
export type FaceScanOutcome =
  | { status: 'ok'; metrics: FaceMetricsRecord }
  /** Nothing face-like in the frames: pointed at a ceiling, a wall, or the user walked off. */
  | { status: 'no-face' }
  /** Too dark to measure anything. The scan screen offers the fill light for exactly this. */
  | { status: 'too-dark' }
  /** The phone or the head moved so much that the regions cannot be trusted. */
  | { status: 'unstable' }
  /** No usable frames at all — permission denied, camera busy, capture failed, detector missing. */
  | { status: 'no-frames' };

/**
 * How much of the scan has to contain a detected, forward-facing face.
 *
 * A proportion rather than a per-frame veto. People blink, glance away and adjust their grip during
 * six seconds, and demanding every frame would fail honest scans; demanding none is what let a wall
 * through. Half the window is enough to be sure a person was there and not enough for a stray
 * detection on a poster to carry the scan.
 */
const MIN_DETECTED_FRACTION = 0.5;

/** Below this there is not enough light for luminance ratios to mean anything. */
const MIN_BRIGHTNESS = 0.08;
/** Above this the frames disagree so much that regional comparison is meaningless. */
const MAX_MOTION = 0.16;

/** One captured frame, its timestamp, and whatever the detector made of it. */
export interface ScannedFrame {
  frame: Frame;
  at: number;
  /** Null when the detector ran and found nothing — distinct from it never having run. */
  face: DetectedFace | null;
}

export function analyzeFrames(
  scanned: ScannedFrame[],
  baseline: FaceBaseline | null,
  {
    captureDurationMs,
    photoUri,
    /** True when the detector itself could not be used at all, as opposed to finding no face. */
    detectorUnavailable = false,
  }: {
    captureDurationMs: number;
    photoUri: string | null;
    detectorUnavailable?: boolean;
  }
): FaceScanOutcome {
  if (!scanned.length) return { status: 'no-frames' };
  // A missing detector is not a missing face. Saying "no face in the ring" when the model failed to
  // load would send the user off to fix their lighting for a problem that is not theirs.
  if (detectorUnavailable) return { status: 'no-frames' };

  // Frames where a face was found *and* pointed at the camera. A head at 60 degrees of yaw detects
  // perfectly well and measures nothing useful, so it counts as an undetected frame rather than
  // silently contributing a foreshortened cheek to the median.
  const usable = scanned.filter((s): s is ScannedFrame & { face: DetectedFace } => !!s.face && facingCamera(s.face));

  if (usable.length < scanned.length * MIN_DETECTED_FRACTION) return { status: 'no-face' };

  const located: LocatedFrame[] = usable.map((s) => ({
    frame: s.frame,
    box: s.face.box as NormBox,
    eyes: { left: s.face.leftEye, right: s.face.rightEye },
  }));

  const f = aggregate(located);
  if (!f) return { status: 'no-face' };
  // Brightness is checked inside the detected face box, not over the whole frame. The old check
  // measured the whole picture, so a bright room with a backlit face read as well-lit when the face
  // itself was a silhouette, and a dark room with a screen-lit face read as too dark when the face
  // was the one thing in it that was not.
  if (f.brightness < MIN_BRIGHTNESS) return { status: 'too-dark' };
  if (f.motion > MAX_MOTION) return { status: 'unstable' };

  // Every captured frame contributes to the eyelid timing, including the ones with no face — as a
  // gap rather than as a closure. ocularMeasures drops them and re-times the rest; see the note
  // there on why a detection gap must not be counted as a shut eye.
  const samples: OcularSample[] = scanned.map((s) => ({
    at: s.at,
    eyeOpen: s.face && facingCamera(s.face) ? s.face.eyeOpen : null,
  }));
  const ocular: OcularMeasures = ocularMeasures(samples);
  // Only handed to the scorer when the sample rate could actually support it. A closure fraction
  // computed from five frames across six seconds is not a small measurement, it is a wrong one.
  const closureFraction = ocular.temporalValid ? ocular.closureFraction : undefined;

  // The detector's per-frame geometry, medianed across the frames that had a face — same treatment
  // as the photometry, and for the same reason: one blink or one mid-word frame should not decide a
  // six-second scan. Null when contours were unavailable on every frame, which is a real outcome on
  // a device that could not afford contour mode, and is passed through as "not measured" rather than
  // as zero.
  const medianOf = (pick: (d: DetectedFace) => number | null): number | undefined => {
    const values = usable.map((s) => pick(s.face)).filter((v): v is number => v != null && Number.isFinite(v));
    return values.length ? median(values) : undefined;
  };
  const ear = medianOf((d) => d.ear);
  const mar = medianOf((d) => d.mar);
  const drop = medianOf((d) => d.mouthCornerDrop);

  const score = scoreAgainstBaseline(
    {
      ...f,
      closureFraction,
      ear,
      mar,
      periorbitalLab: f.periorbitalLab,
      scleralRedness: f.scleralRedness,
      skinToneChroma: f.skinToneChroma,
      mouthCornerDrop: drop,
    },
    baseline
  );

  return {
    status: 'ok',
    metrics: {
      brightness: Number(f.brightness.toFixed(3)),
      redness: Number(f.redness.toFixed(3)),
      periorbital: Number(f.periorbital.toFixed(3)),
      eyeContrast: Number(f.eyeContrast.toFixed(3)),
      // The spec's feature vector, stored per scan as the data model asks. Numeric only — no frame,
      // no reference to one.
      ear,
      mar,
      mouthCornerDrop: drop,
      periorbitalLab: Number(f.periorbitalLab.toFixed(3)),
      scleralRedness: Number(f.scleralRedness.toFixed(4)),
      skinToneL: Number(f.skinToneL.toFixed(3)),
      skinToneChroma: Number(f.skinToneChroma.toFixed(3)),
      motion: Number(f.motion.toFixed(4)),
      stillnessMs: captureDurationMs,
      zScore: score.zScore,
      provisional: score.provisional,
      photoUri,
      closureFraction,
      longClosures: ocular.temporalValid ? ocular.longClosures : undefined,
      framesPerSecond: captureDurationMs > 0 ? Number(((scanned.length * 1000) / captureDurationMs).toFixed(1)) : 0,
    },
  };
}

/**
 * The headline the scan screen shows when a scan cannot be scored.
 *
 * Separate from the bodies below because the headline is the thing a half-asleep user reads, and
 * for a long time it said "Got it" in every one of these cases.
 */
export const FACE_SCAN_TITLE: Record<Exclude<FaceScanOutcome['status'], 'ok'>, string> = {
  'no-face': 'No face in the ring',
  'too-dark': 'Too dark to read',
  unstable: 'Too much movement',
  'no-frames': 'No camera',
};

/** What the scan screen shows when a scan cannot be scored. */
export const FACE_SCAN_MESSAGE: Record<Exclude<FaceScanOutcome['status'], 'ok'>, string> = {
  'no-face': 'Could not find your face in the ring. Scoring on your other signals instead.',
  'too-dark': 'Too dark to read your face. Try the fill light, or carry on without it.',
  unstable: 'Too much movement to read your face. Scoring on your other signals instead.',
  'no-frames': 'No camera access — scoring on your other signals instead.',
};
