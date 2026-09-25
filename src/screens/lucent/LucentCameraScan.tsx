import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { captureFrames } from '../../lib/faceCapture';
import { primeFaceDetector } from '../../lib/faceDetect';

export interface LucentCaptureSummary {
  frames: number;
  fps: number;
  durationMs: number;
  detectorUnavailable: boolean;
  cameraAvailable: boolean;
}

const palette = {
  bg: '#050706',
  text: '#F3F6F1',
  dim: '#99A39C',
  faint: '#667069',
  acid: '#D9FF74',
  mint: '#9AF5CF',
  lineStrong: 'rgba(236, 244, 237, 0.18)',
};

const SCAN_MS = 5000;

export function LucentCameraScan({
  onDone,
}: {
  onDone: (summary: LucentCaptureSummary) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const captureStarted = useRef(false);
  const captureSummary = useRef<LucentCaptureSummary | null>(null);
  const scanFinished = useRef(false);
  const delivered = useRef(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const targetX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (
      Platform.OS !== 'web' &&
      permission &&
      !permission.granted &&
      permission.canAskAgain
    ) {
      requestPermission().catch(() => setCameraFailed(true));
    }
    if (Platform.OS !== 'web') primeFaceDetector().catch(() => {});
  }, [permission, requestPermission]);

  const maybeFinish = () => {
    if (delivered.current || !scanFinished.current) return;
    if (
      Platform.OS !== 'web' &&
      permission?.granted &&
      cameraReady &&
      !cameraFailed &&
      !captureSummary.current
    ) {
      return;
    }

    delivered.current = true;
    onDone(
      captureSummary.current ?? {
        frames: 0,
        fps: 0,
        durationMs: SCAN_MS,
        detectorUnavailable: false,
        cameraAvailable: false,
      }
    );
  };

  useEffect(() => {
    const cameraAvailable =
      Platform.OS !== 'web' &&
      Boolean(permission?.granted) &&
      cameraReady &&
      !cameraFailed;

    if (!cameraAvailable || captureStarted.current) {
      if (
        Platform.OS === 'web' ||
        (permission && !permission.granted) ||
        cameraFailed
      ) {
        captureSummary.current = {
          frames: 0,
          fps: 0,
          durationMs: SCAN_MS,
          detectorUnavailable: false,
          cameraAvailable: false,
        };
        maybeFinish();
      }
      return;
    }

    captureStarted.current = true;
    const camera = cameraRef.current;
    if (!camera) {
      captureSummary.current = {
        frames: 0,
        fps: 0,
        durationMs: SCAN_MS,
        detectorUnavailable: true,
        cameraAvailable: false,
      };
      maybeFinish();
      return;
    }

    captureFrames(camera, { durationMs: SCAN_MS, maxFrames: 48 })
      .then((result) => {
        captureSummary.current = {
          frames: result.timed.length,
          fps: Number(result.fps.toFixed(2)),
          durationMs: result.durationMs,
          detectorUnavailable: result.detectorUnavailable,
          cameraAvailable: true,
        };
      })
      .catch(() => {
        captureSummary.current = {
          frames: 0,
          fps: 0,
          durationMs: SCAN_MS,
          detectorUnavailable: true,
          cameraAvailable: true,
        };
      })
      .finally(maybeFinish);
  }, [cameraFailed, cameraReady, permission?.granted]);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const next = Math.min(SCAN_MS, Date.now() - start);
      setElapsed(next);
      if (next >= SCAN_MS) {
        clearInterval(timer);
        scanFinished.current = true;
        maybeFinish();
      }
    }, 40);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: SCAN_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    Animated.sequence([
      Animated.delay(1600),
      Animated.timing(targetX, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(targetX, {
        toValue: -1,
        duration: 1000,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(targetX, {
        toValue: 0.5,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    return () => clearInterval(timer);
  }, [progressAnim, targetX]);

  const secondsLeft = Math.max(0, Math.ceil((SCAN_MS - elapsed) / 1000));
  const phase = useMemo(() => {
    if (elapsed < 500) return 'Hold still';
    if (elapsed < 900) return 'Light response';
    if (elapsed < 1600) return 'Keep looking';
    if (elapsed < 2300) return 'Follow the point';
    if (elapsed < 3800) return 'Track smoothly';
    return 'Almost there';
  }, [elapsed]);

  const targetTranslate = targetX.interpolate({
    inputRange: [-1, 1],
    outputRange: [-92, 92],
  });

  const showCamera =
    Platform.OS !== 'web' &&
    Boolean(permission?.granted) &&
    !cameraFailed;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <View style={styles.brandDot} />
            <Text style={styles.brand}>LUCENT</Text>
          </View>
          <View style={styles.securePill}>
            <View style={styles.secureDot} />
            <Text style={styles.secureText}>
              {showCamera ? 'On-device capture' : 'Camera unavailable'}
            </Text>
          </View>
        </View>

        <View style={styles.stage}>
          <View style={styles.frame}>
            {showCamera ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="front"
                active
                onCameraReady={() => setCameraReady(true)}
                onMountError={() => setCameraFailed(true)}
              />
            ) : (
              <LinearGradient
                colors={['#080C09', '#0D130F']}
                style={StyleSheet.absoluteFill}
              />
            )}

            <View
              style={[
                StyleSheet.absoluteFill,
                styles.stimulusWash,
                elapsed >= 500 && elapsed < 900 && styles.stimulusWashActive,
              ]}
              pointerEvents="none"
            />
            <View style={styles.faceOval} pointerEvents="none" />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.stimulus,
                { transform: [{ translateX: targetTranslate }] },
              ]}
            />
            <View style={styles.guide} pointerEvents="none">
              <Text style={styles.guideText}>
                Keep your face inside the frame
              </Text>
            </View>
          </View>

          <View style={styles.progressRow}>
            <Text style={styles.phase}>{phase}</Text>
            <Text style={styles.countdown}>{secondsLeft}</Text>
          </View>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>
            Five seconds. Controlled response.
          </Text>
          <Text style={styles.footerBody}>
            This V0 captures timestamped face frames while the display runs the
            fixed APST-5 stimulus sequence. State inference is intentionally
            disabled until validation.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  safe: { flex: 1 },
  header: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandMark: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.acid,
  },
  brand: {
    color: palette.text,
    fontFamily: 'Figtree_700Bold',
    fontSize: 13,
    letterSpacing: 3.1,
  },
  securePill: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  secureDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.mint,
  },
  secureText: {
    color: palette.dim,
    fontFamily: 'Figtree_500Medium',
    fontSize: 10,
  },
  stage: {
    flex: 1,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  frame: {
    width: '100%',
    aspectRatio: 0.78,
    maxHeight: 510,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#080C09',
  },
  stimulusWash: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  stimulusWashActive: {
    backgroundColor: 'rgba(236,255,211,0.36)',
  },
  faceOval: {
    width: 202,
    height: 270,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(243,246,241,0.58)',
  },
  stimulus: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: palette.acid,
    shadowColor: palette.acid,
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 7,
  },
  guide: {
    position: 'absolute',
    top: 18,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.40)',
  },
  guideText: {
    color: palette.text,
    fontFamily: 'Figtree_500Medium',
    fontSize: 10.5,
  },
  progressRow: {
    marginTop: 18,
    paddingHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  phase: {
    color: palette.text,
    fontFamily: 'Figtree_600SemiBold',
    fontSize: 13,
  },
  countdown: {
    color: palette.acid,
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 28,
  },
  progressTrack: {
    marginTop: 9,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: palette.acid },
  footer: { paddingHorizontal: 22, paddingBottom: 18 },
  footerTitle: {
    color: palette.text,
    fontFamily: 'Figtree_700Bold',
    fontSize: 12.5,
  },
  footerBody: {
    marginTop: 5,
    color: palette.faint,
    fontFamily: 'Figtree_400Regular',
    fontSize: 10.5,
    lineHeight: 15,
  },
});
