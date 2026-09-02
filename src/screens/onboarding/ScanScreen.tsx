import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScreenContainer, ScanRing } from '../../components';
import { Icon } from '../../components/Icons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { analyzeFrames, FACE_SCAN_MESSAGE, FACE_SCAN_TITLE, type FaceScanOutcome } from '../../lib/faceScoring';
import { captureFrames } from '../../lib/faceCapture';
import { primeFaceDetector } from '../../lib/faceDetect';

const RING_SIZE = 300;
const CAMERA_SIZE = RING_SIZE * 0.82; // matches ScanRing's inner glass orb diameter

export function ScanScreen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(44);
  const scanPct = useSomnoStore((s) => s.scanPct);
  const scanDone = useSomnoStore((s) => s.scanDone);
  const lowLight = useSomnoStore((s) => s.lowLight);
  const toggleLowLight = useSomnoStore((s) => s.toggleLowLight);
  const abortTest = useSomnoStore((s) => s.abortTest);
  const skipScan = useSomnoStore((s) => s.skipScan);
  const setFaceMetrics = useSomnoStore((s) => s.setFaceMetrics);
  const setScanFailure = useSomnoStore((s) => s.setScanFailure);
  const faceMetrics = useSomnoStore((s) => s.lastFaceMetrics);
  const setFaceScanWork = useSomnoStore((s) => s.setFaceScanWork);
  const go = useSomnoStore((s) => s.go);

  // expo-camera has a web implementation (getUserMedia-backed) too, so this hook is safe to call
  // unconditionally on every platform — no Rules-of-Hooks violation from branching on Platform.OS.
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [failure, setFailure] = useState<Exclude<FaceScanOutcome['status'], 'ok'> | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const capturedRef = useRef(false);

  useEffect(() => {
    capturedRef.current = false;
    if (Platform.OS !== 'web' && permission && !permission.granted && permission.canAskAgain) {
      requestPermission().catch(() => setCameraFailed(true));
    }
    // Load the detection model while the user is still reading "Center your face in the light".
    // Without this the first frame of the scan pays for the model load, which on a cold start is
    // the slowest frame of the series — and the sample period is what the eyelid measure lives on.
    if (Platform.OS !== 'web') primeFaceDetector().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capture starts as soon as the camera is live, not when the ring finishes: the series needs
  // about two seconds of real frames, and the ring's sweep is the only place to hide that. The
  // promise is handed to the store so the hand-off to the next screen waits for the measurement
  // instead of racing it.
  useEffect(() => {
    const cameraAvailable = Platform.OS !== 'web' && permission?.granted && cameraReady && !cameraFailed;
    if (!cameraAvailable || capturedRef.current) return;
    capturedRef.current = true;

    const work = (async () => {
      const camera = cameraRef.current;
      if (!camera) {
        setFaceMetrics(null);
        setFailure('no-frames');
        setScanFailure('no-frames');
        return;
      }
      /**
       * The generation this scan belongs to.
       *
       * Capture takes six seconds and cannot be cancelled once started — `captureFrames` is a loop
       * of native calls, not an abortable request. So leaving the scan does not stop it; the promise
       * resolves a few seconds later regardless. Dropping the store's reference to it (which is all
       * that happened before) does not change that: the continuation below still ran, and still
       * called `setFaceMetrics`, writing an abandoned scan's measurements into whatever check-in was
       * open by then. Comparing the generation at the end against the one at the start is what makes
       * that impossible.
       */
      const generation = useSomnoStore.getState().currentScanGeneration();
      const stillCurrent = () => useSomnoStore.getState().currentScanGeneration() === generation;

      const { timed, durationMs, photoUri, detectorUnavailable } = await captureFrames(camera);
      if (!stillCurrent()) return;

      const outcome = analyzeFrames(
        timed.map((t) => ({ frame: t.frame, at: t.at, face: t.face ?? null })),
        useSomnoStore.getState().faceBaseline,
        { captureDurationMs: durationMs, photoUri, detectorUnavailable }
      );
      // Checked again after analysis: the measurement pass is not instant either, and the user can
      // leave during it just as easily.
      if (!stillCurrent()) return;
      if (outcome.status === 'ok') {
        setFaceMetrics(outcome.metrics);
        setFailure(null);
        setScanFailure(null);
      } else {
        // A scan that could not be measured contributes nothing rather than a neutral guess —
        // the check-in still scores on the PVT, the rating and the sleep debt.
        setFaceMetrics(null);
        setFailure(outcome.status);
        setScanFailure(outcome.status);
      }
    })();

    setFaceScanWork(work);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted, cameraReady, cameraFailed]);

  // No camera at all (web preview, permission denied): settle the signal count immediately so the
  // score is computed from the signals that do exist.
  useEffect(() => {
    if (Platform.OS === 'web' || (permission && !permission.granted) || cameraFailed) {
      setFaceMetrics(null);
      // No camera is a real outcome, not a silent one — but it is the one a retry cannot fix, so
      // `afterScan` lets it through rather than routing to the error screen.
      setFailure('no-frames');
      setScanFailure('no-frames');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted, cameraFailed]);

  /**
   * What the screen says at the end is what the measurement found — not what the timer did.
   *
   * The ring is driven by a `setInterval`, and this used to read its percentage straight into a
   * fixed array of captions. At 100% it announced "Got it / Signals captured" unconditionally: with
   * the camera denied, in a pitch-dark room, or pointed at a wall. Somebody tested it with no face
   * in front of the phone and was told the scan had completed, and they were right to call that
   * fake. The ring can only report that the sampling window is over; only `failure` and `metrics`
   * know whether anything was measured in it.
   */
  const phase = scanPct < 25 ? 0 : scanPct < 70 ? 1 : scanPct < 100 ? 2 : 3;
  const measured = failure === null && faceMetrics !== null;
  const stillMeasuring = phase === 3 && failure === null && faceMetrics === null;

  const title =
    phase < 3 ? ['Center your face in the light', 'Hold still…', 'Reading your eyes'][phase]
    : stillMeasuring ? 'Reading your eyes'
    : failure ? FACE_SCAN_TITLE[failure]
    : 'Got it';

  const sub =
    phase < 3 ? ['Move a little closer to the camera', 'Blink normally', 'Eye area, colour and steadiness'][phase]
    : stillMeasuring ? 'Measuring the frames'
    : failure ? FACE_SCAN_MESSAGE[failure]
    : measured ? 'Signals captured'
    : 'Signals captured';

  const showCamera = Platform.OS !== 'web' && permission?.granted && !cameraFailed;
  const showPermissionNote = Platform.OS !== 'web' && permission && !permission.granted;

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.top}>
          <Pressable onPress={abortTest} hitSlop={10} style={{ opacity: 0.6 }} accessibilityRole="button" accessibilityLabel="Cancel the scan">
            <Icon name="close" size={19} />
          </Pressable>
          <Pressable onPress={skipScan} hitSlop={10} accessibilityRole="button">
            <Text style={styles.skip}>Skip face scan</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
            {showCamera && (
              <View style={styles.cameraClip}>
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing="front"
                  onCameraReady={() => setCameraReady(true)}
                  active
                />
              </View>
            )}
            <ScanRing pct={scanPct} lowLight={lowLight} size={RING_SIZE} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>{sub}</Text>
            <Pressable onPress={toggleLowLight} style={[styles.llBtn, lowLight && styles.llBtnActive]} accessibilityRole="button">
              <Icon name="sun" size={15} color={lowLight ? '#1A1330' : color.textDim70} />
              <Text style={[styles.llLabel, { color: lowLight ? '#1A1330' : color.textDim70 }]}>{lowLight ? 'Fill light on' : 'Turn on fill light'}</Text>
            </Pressable>
            <Text style={styles.llNote}>
              {lowLight ? 'The screen is lighting your face so the scan works in a dark bedroom.' : 'Dark room? A white ring lights your face without waking anyone else.'}
            </Text>
            {showPermissionNote && !failure && (
              <Text style={styles.permNote}>{FACE_SCAN_MESSAGE['no-frames']}</Text>
            )}
          </View>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <Text style={styles.processing}>Processing on your device. Nothing is uploaded.</Text>
          <Pressable onPress={() => go('SCANERR')} accessibilityRole="button">
            <Text style={styles.trouble}>Having trouble?</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 26, paddingTop: 20 },
  skip: { fontFamily: font.sans500, fontSize: 13, color: color.textDim50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 34 },
  cameraClip: {
    position: 'absolute',
    width: CAMERA_SIZE,
    height: CAMERA_SIZE,
    borderRadius: CAMERA_SIZE / 2,
    overflow: 'hidden',
    opacity: 0.85,
  },
  textWrap: { alignItems: 'center', gap: 10, paddingHorizontal: 40 },
  title: { fontFamily: font.serif, fontSize: 26, color: color.text, textAlign: 'center' },
  sub: { fontFamily: font.sans500, fontSize: 13, color: color.textDim50, textAlign: 'center' },
  llBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  llBtnActive: { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(255,255,255,0.9)' },
  llLabel: { fontFamily: font.sans700, fontSize: 12 },
  llNote: { fontFamily: font.sans500, fontSize: 11, lineHeight: 15, color: color.textDim35, textAlign: 'center', maxWidth: 250 },
  permNote: { fontFamily: font.sans500, fontSize: 11, color: color.textDim40, textAlign: 'center', marginTop: 4 },
  footer: { paddingHorizontal: 30, paddingBottom: 0, alignItems: 'center', gap: 9 },
  processing: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 17, color: color.textDim38, textAlign: 'center' },
  trouble: { fontFamily: font.sans600, fontSize: 12.5, color: color.textDim50 },
});
