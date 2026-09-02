/**
 * Finding the face with a real detector, instead of guessing it from skin-coloured pixels.
 *
 * ## Why this file exists
 *
 * The previous detector was hand-rolled photometry: a YCbCr skin rule, row-run grouping to find a
 * blob, aspect-ratio and edge-margin sanity checks, and a `faceStructure` heuristic asking whether
 * a dark, detailed band sat above a smooth one. Every one of those terms was multiplied together
 * into a single `faceLikelihood` and compared against a threshold.
 *
 * A conjunctive product of five hand-tuned terms fails the moment any one of them is wrong, and
 * three ways that happened on real hardware, each now a regression test in `scripts/test-face.ts`:
 *
 *  1. **Backlighting capped the score at exactly the rejection threshold.** The last term was
 *     `min(1, 0.35 + contrastWithBackground * 2)`, and `contrastWithBackground` is zero whenever the
 *     room is brighter than the face — which is every daylit room. That pinned the product at 0.350
 *     against a gate of 0.35, leaving *zero* margin: any other term below 1.0 rejected a real face.
 *  2. **Sensor grain destroyed the structure term.** `faceStructure` gates on the ratio of eye-band
 *     edge energy to cheek edge energy. Noise raises the denominator, so on a front camera in a dim
 *     room the ratio collapses toward 1 and the term collapses to 0. That is precisely the 4am
 *     bedroom this app is built for.
 *  3. **A close selfie was rejected outright.** Holding the phone at natural distance makes the face
 *     touch three frame edges and exceed 82% of the frame, both of which returned `null` — checks
 *     added to stop a blank wall passing, which also stop a face passing.
 *
 * Tuning those constants would have moved the failure, not removed it. The problem was the method.
 *
 * ## What replaces it
 *
 * Google ML Kit's on-device face detector (`com.google.mlkit:face-detection`, the bundled model —
 * no network, no upload, nothing leaves the phone). It is a trained detector rather than a colour
 * rule, so it does not care whether the user is backlit, what their skin tone is, how grainy the
 * sensor is, or how close they hold the phone. It also returns three things the photometric version
 * could only approximate or disclaim entirely:
 *
 *  - **Landmarks and contours** — the eye regions are now *known*, not searched for by integral
 *    projection. Every regional measurement downstream is anchored to real anatomy.
 *  - **Eye-open probabilities** — a per-eye classifier output, which is what turns the old
 *    edge-contrast proxy into an actual eyelid measurement (see ocular.ts).
 *  - **Head Euler angles** — so a head turned away can be excluded rather than measured wrongly.
 *
 * ## What is still honest to say
 *
 * `leftEyeOpenProbability` is a classifier's confidence that the eye is open, not a measured lid
 * aperture in millimetres. It is a far better basis for eyelid closure than edge energy, and it is
 * still not an infrared oculograph. ocular.ts states exactly what it does with it.
 */
import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { DetectedFace, NormBox } from './faceTypes';
import { averageEAR, mouthAspectRatio, mouthCornerDrop, type Point } from './faceGeometry';

// Re-exported so callers that only want a detection do not need to know the split exists.
export { facingCamera, MAX_YAW_DEG, MAX_PITCH_DEG } from './faceTypes';
export type { DetectedFace, NormBox } from './faceTypes';

/**
 * Width the frame is resized to before detection.
 *
 * Not the 96px the photometry uses. ML Kit needs the face to be at least ~100px across for landmark
 * and contour modes to engage at all, and at 96px wide the whole *frame* is that size. 480px keeps a
 * typical selfie face around 250-300px across — comfortably above the floor — while still being a
 * fraction of the multi-megapixel original, which would cost far more time than it buys accuracy.
 */
const DETECT_WIDTH = 480;

/** Everything that can come back from a detection attempt, without throwing. */
export type DetectOutcome =
  | { status: 'face'; face: DetectedFace }
  | { status: 'none' }
  /** The detector could not run at all — unsupported platform, model failure, unreadable file. */
  | { status: 'unavailable'; reason: string };

type MLKitPoint = { x: number; y: number };
type MLKitFace = {
  frame: { origin: MLKitPoint; size: MLKitPoint };
  landmarks?: { type: string | null; position: MLKitPoint | null }[];
  contours?: { type: string | null; points: MLKitPoint[] | null }[];
  leftEyeOpenProbability?: number | null;
  rightEyeOpenProbability?: number | null;
  headEulerAngleX?: number | null;
  headEulerAngleY?: number | null;
  headEulerAngleZ?: number | null;
};

let detector: { detectFaces(uri: string): Promise<{ faces?: MLKitFace[] } | undefined> } | null = null;
let initFailed: string | null = null;

/**
 * Builds the detector once, with the options this app actually needs.
 *
 * `classificationMode` is the one that matters and the one that defaults to **false** in the
 * wrapper: without it ML Kit never populates the eye-open probabilities, and the whole eyelid
 * measurement silently becomes null. Enabling landmarks alongside costs little at this image size
 * and gives ocular.ts a fallback geometry when classification declines to answer.
 *
 * `fast` rather than `accurate`, and the reason is the eyelid measure rather than laziness. The
 * accurate model earns its name on small, rotated and partially-occluded faces; the scan ring asks
 * for a large, frontal, centred one, where the two agree. What it costs is per-frame latency, and
 * latency is not free here: `ocular.ts` needs frames no more than 350 ms apart to resolve a 400 ms
 * slow closure, and every millisecond spent detecting is a millisecond of sampling period. A more
 * accurate detector that pushes the sample rate below the temporal threshold buys nothing, because
 * the measurement it was protecting gets dropped as unfounded.
 */
async function getDetector() {
  if (detector || initFailed) return detector;
  if (Platform.OS === 'web') {
    initFailed = 'face detection is not available on web';
    return null;
  }
  try {
    const mod = require('@infinitered/react-native-mlkit-face-detection');
    const instance = new mod.RNMLKitFaceDetector({
      performanceMode: 'fast',
      classificationMode: true,
      landmarkMode: true,
      // Contours are what make the spec's EAR and MAR computable at all: landmark mode returns eye
      // and mouth *centres*, which locate a feature without describing its shape. They cost more per
      // frame than landmarks alone, and that cost is the sample rate the eyelid timing depends on —
      // the scan reports the rate it achieved so a device that cannot afford this says so plainly
      // rather than quietly reporting a worse measurement.
      contourMode: true,
      minFaceSize: 0.15,
      isTrackingEnabled: false,
    });
    await instance.initialize();
    detector = instance;
    return detector;
  } catch (e) {
    initFailed = e instanceof Error ? e.message : 'face detector failed to load';
    return null;
  }
}

/** Warms the model up so the first frame of a scan is not the one that pays for loading it. */
export async function primeFaceDetector(): Promise<boolean> {
  return (await getDetector()) !== null;
}

/**
 * The largest face in one captured photo, or an explanation.
 *
 * Largest rather than first: ML Kit returns every face it finds, and a scan taken in a shared room
 * should measure the person holding the phone, who is by a wide margin the biggest thing in frame.
 */
export async function detectFace(photoUri: string): Promise<DetectOutcome> {
  const d = await getDetector();
  if (!d) return { status: 'unavailable', reason: initFailed ?? 'face detector unavailable' };

  let uri = photoUri;
  let width = 0;
  let height = 0;
  try {
    const image = await ImageManipulator.manipulate(photoUri).resize({ width: DETECT_WIDTH }).renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    uri = saved.uri;
    width = saved.width;
    height = saved.height;
  } catch (e) {
    return { status: 'unavailable', reason: 'could not prepare the frame for detection' };
  }
  if (!width || !height) return { status: 'unavailable', reason: 'frame had no dimensions' };

  let faces: MLKitFace[];
  try {
    const result = await d.detectFaces(uri);
    faces = result?.faces ?? [];
  } catch {
    return { status: 'unavailable', reason: 'the face detector failed on this frame' };
  }
  if (!faces.length) return { status: 'none' };

  const biggest = faces.reduce((a, b) => (a.frame.size.x * a.frame.size.y >= b.frame.size.x * b.frame.size.y ? a : b));
  return { status: 'face', face: normalise(biggest, width, height) };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function landmark(face: MLKitFace, type: string, w: number, h: number): { x: number; y: number } | null {
  const found = face.landmarks?.find((l) => l.type === type && l.position);
  if (!found?.position) return null;
  return { x: clamp01(found.position.x / w), y: clamp01(found.position.y / h) };
}

/** One contour in normalised coordinates, or null when the detector did not return it. */
function contour(face: MLKitFace, type: string, w: number, h: number): Point[] | null {
  const found = face.contours?.find((c) => c.type === type && c.points?.length);
  if (!found?.points) return null;
  return found.points.map((p) => ({ x: clamp01(p.x / w), y: clamp01(p.y / h) }));
}

function normalise(face: MLKitFace, w: number, h: number): DetectedFace {
  const { origin, size } = face.frame;
  // The mouth outline is split across four contours; the outer two bound the opening. Merged here
  // once so the three mouth measures below all read the same geometry.
  const upperLip = contour(face, 'upperLipTop', w, h);
  const lowerLip = contour(face, 'lowerLipBottom', w, h);
  const left = face.leftEyeOpenProbability ?? null;
  const right = face.rightEyeOpenProbability ?? null;
  const both = [left, right].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  return {
    box: {
      x0: clamp01(origin.x / w),
      x1: clamp01((origin.x + size.x) / w),
      y0: clamp01(origin.y / h),
      y1: clamp01((origin.y + size.y) / h),
    },
    leftEyeOpen: left,
    rightEyeOpen: right,
    eyeOpen: both.length ? both.reduce((a, b) => a + b, 0) / both.length : null,
    headYaw: face.headEulerAngleY ?? null,
    headPitch: face.headEulerAngleX ?? null,
    headRoll: face.headEulerAngleZ ?? null,
    // ML Kit names landmarks from the *subject's* left and right, which is what we want: the
    // measurement is about the person, not about which side of the image they appear on.
    leftEye: landmark(face, 'leftEye', w, h),
    rightEye: landmark(face, 'rightEye', w, h),
    ear: averageEAR(contour(face, 'leftEye', w, h), contour(face, 'rightEye', w, h)),
    mar: mouthAspectRatio(upperLip, lowerLip),
    mouthCornerDrop: mouthCornerDrop(upperLip, lowerLip),
  };
}
