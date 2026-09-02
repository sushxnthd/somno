import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import type { Frame } from './faceFeatures';
import { detectFace, type DetectOutcome, type DetectedFace } from './faceDetect';

/**
 * Turning the camera into pixels this app can measure.
 *
 * A phone's front camera hands back a multi-megapixel JPEG; decoding that in JavaScript would take
 * seconds per frame and there is nothing in it that a small image does not also contain. So each
 * capture is downscaled natively first — that part is C++ on a background thread — and only the
 * small result is decoded here. At 96px wide a frame is ~12k pixels, which the feature pass walks
 * in a few milliseconds.
 *
 * The scan is a series rather than a single shot because two of the four measurements only exist
 * across time (movement between frames) or need a median to survive one blink.
 */

/** Width to downscale each frame to before decoding. Tuned so the eye band is still ~13px tall. */
const FRAME_WIDTH = 96;

/**
 * How long the scan runs.
 *
 * Long enough for the eyelid measures to mean something: closure is a *proportion of a window*, and
 * a window has to be several seconds for that proportion to be stable and for a slow closure to have
 * somewhere to happen. The progress ring is paced from the same constant, because a ring that
 * finishes before the camera does would hand the check-in on without the face in it.
 */
export const FACE_SCAN_MS = 6000;

/** Anything the camera object needs to look like. Keeps this module testable and screen-agnostic. */
export interface CameraLike {
  takePictureAsync(options?: {
    quality?: number;
    skipProcessing?: boolean;
    shutterSound?: boolean;
  }): Promise<{ uri: string } | undefined>;
}

function base64ToBytes(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = chars.indexOf(clean[i + 2]);
    const d = chars.indexOf(clean[i + 3]);
    out[p++] = (a << 2) | (b >> 4);
    if (c >= 0) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[p++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, p);
}

/** Downscale natively, then decode the small JPEG to RGBA. */
export async function frameFromUri(uri: string): Promise<Frame | null> {
  try {
    const image = await ImageManipulator.manipulate(uri).resize({ width: FRAME_WIDTH }).renderAsync();
    const saved = await image.saveAsync({ base64: true, format: SaveFormat.JPEG, compress: 0.9 });
    if (!saved.base64) return null;
    const decoded = jpeg.decode(base64ToBytes(saved.base64), { useTArray: true });
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  } catch {
    return null;
  }
}

/** A frame, the instant it was taken, and what the detector made of it. */
export interface TimedFrame {
  frame: Frame;
  at: number;
  /**
   * The face ML Kit found in this frame, or null when it ran and found none.
   *
   * `undefined` is a third state and a meaningful one: the detector never ran. `analyzeFrames`
   * distinguishes them, because "no face in the ring" and "the model failed to load" need different
   * things from the user and only one of them is their problem.
   */
  face?: DetectedFace | null;
}

export interface CaptureResult {
  frames: Frame[];
  /** The same frames with their capture instants, for anything measured across time. */
  timed: TimedFrame[];
  /** How long the series actually took, wall clock. */
  durationMs: number;
  /** Frames per second actually achieved — the device sets this, not the app. */
  fps: number;
  /** The last full-resolution capture, kept on-device only. */
  photoUri: string | null;
  /** True when the detector could not be used at all, as opposed to finding nothing. */
  detectorUnavailable: boolean;
}

/**
 * Captures for a fixed *duration*, as fast as the device will go.
 *
 * This used to take five frames on a 420ms timer — about 2.4 per second. That is enough to average
 * a few still photographs, and nothing else: every measure that lives in *time* rather than in a
 * single image was out of reach, which is most of what the drowsiness literature actually uses.
 * Eyelid closure, in particular, is a proportion of a window, and you cannot measure a proportion
 * of a window from five points spread across it.
 *
 * So the loop no longer paces itself. It shoots, decodes, and immediately shoots again, for as long
 * as it has been given, and records when each frame landed. What comes back might be 3 frames per
 * second on a cheap phone or 8 on a fast one — the analysis reads the timestamps and states what
 * that rate can support, rather than assuming a rate it cannot guarantee.
 *
 * Failures are per-frame on purpose: a dropped capture costs one sample, not the scan.
 */
export async function captureFrames(
  camera: CameraLike,
  {
    durationMs = FACE_SCAN_MS,
    maxFrames = 48,
    /**
     * How a photo becomes a detection. Injected rather than imported so this module stays pure and
     * driveable from a script — the default is the real ML Kit detector.
     */
    detect = detectFace,
  }: {
    durationMs?: number;
    maxFrames?: number;
    detect?: (uri: string) => Promise<DetectOutcome>;
  } = {}
): Promise<CaptureResult> {
  const startedAt = Date.now();
  const timed: TimedFrame[] = [];
  let photoUri: string | null = null;
  let sawUnavailable = false;
  let detectorAnswered = false;

  while (Date.now() - startedAt < durationMs && timed.length < maxFrames) {
    try {
      // skipProcessing keeps the shot fast and unrotated; shutterSound off so a 4am scan is silent.
      const photo = await camera.takePictureAsync({ quality: 0.4, skipProcessing: true, shutterSound: false });
      if (photo?.uri) {
        photoUri = photo.uri;
        const at = Date.now();
        // Detection and photometry are both driven from the same shot, and both are awaited before
        // the next one. Sequential rather than raced on purpose: two ImageManipulator passes and an
        // ML Kit inference contending for the same decoder is how a mid-range phone drops frames
        // altogether, and a slower-but-steady rate is worth more here than a fast-but-gappy one.
        const [frame, outcome] = [await frameFromUri(photo.uri), await detect(photo.uri)];
        // Only a detector that never once answered counts as unavailable. Flagging it on the first
        // `unavailable` would let one transient failure — a frame the resizer could not read, a
        // moment of memory pressure — report a whole good scan as "no camera". A detector that
        // answered even once is present, and the frames it missed are just frames it missed.
        if (outcome.status === 'unavailable') sawUnavailable = true;
        else detectorAnswered = true;
        // Timed at the shutter, not after the decode: the decode's duration varies and has nothing
        // to do with when the light hit the sensor.
        if (frame) timed.push({ frame, at, face: outcome.status === 'face' ? outcome.face : null });
      }
    } catch {
      // one lost frame, keep going
    }
  }

  const elapsed = Date.now() - startedAt;
  return {
    frames: timed.map((t) => t.frame),
    timed,
    durationMs: elapsed,
    fps: elapsed > 0 ? (timed.length * 1000) / elapsed : 0,
    photoUri,
    detectorUnavailable: sawUnavailable && !detectorAnswered,
  };
}
