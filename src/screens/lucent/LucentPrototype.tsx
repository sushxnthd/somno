import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { LucentCameraScan, type LucentCaptureSummary } from './LucentCameraScan';

type Surface = 'today' | 'history' | 'profile';
type ScanStage = 'idle' | 'scan' | 'result';

const palette = {
  bg: '#050706',
  panel: '#0B0F0C',
  panelHi: '#101612',
  line: 'rgba(236, 244, 237, 0.10)',
  lineStrong: 'rgba(236, 244, 237, 0.18)',
  text: '#F3F6F1',
  dim: '#99A39C',
  faint: '#667069',
  acid: '#D9FF74',
  mint: '#9AF5CF',
  ice: '#A7E8FF',
  warm: '#F8E8B1',
  ink: '#10140D',
};

const SCAN_MS = 5000;

function BrandMark() {
  return (
    <View style={styles.brandMark}>
      <View style={styles.brandDot} />
      <Text style={styles.brand}>LUCENT</Text>
    </View>
  );
}

function Hairline() {
  return <View style={styles.hairline} />;
}

function Metric({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent: string;
}) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricSignal, { backgroundColor: accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricNote}>{note}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function MiniTrajectory() {
  const bars = [34, 42, 56, 62, 78, 70, 64, 58, 53, 48, 43, 39];
  return (
    <View style={styles.trajectory}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={[
            styles.trajectoryBar,
            {
              height: h,
              opacity: 0.24 + i / bars.length / 1.5,
              backgroundColor: i < 7 ? palette.acid : palette.ice,
            },
          ]}
        />
      ))}
    </View>
  );
}

function ScanOrb({
  progress,
  ready,
}: {
  progress: number;
  ready: boolean;
}) {
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View style={styles.orbWrap}>
      <LinearGradient
        colors={[
          'rgba(217,255,116,0.92)',
          'rgba(154,245,207,0.66)',
          'rgba(167,232,255,0.45)',
          'rgba(217,255,116,0.92)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.orbOuter}
      >
        <View style={styles.orbInner}>
          <Text style={styles.orbTop}>{ready ? 'READY' : 'SCAN'}</Text>
          <Text style={styles.orbBig}>{ready ? '—' : '5s'}</Text>
          <Text style={styles.orbSub}>{ready ? 'No reading yet' : 'One look. That is it.'}</Text>
        </View>
      </LinearGradient>
      {!ready && (
        <View style={styles.orbProgressTrack}>
          <View style={[styles.orbProgressFill, { width: `${pct * 100}%` }]} />
        </View>
      )}
    </View>
  );
}

function Today({
  onStart,
  hasResult,
  onOpenResult,
}: {
  onStart: () => void;
  hasResult: boolean;
  onOpenResult: () => void;
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YOUR CURRENT STATE</Text>
        <Text style={styles.heroTitle}>
          Know how ready you are,{`\n`}
          <Text style={styles.heroTitleAccent}>in five seconds.</Text>
        </Text>
        <Text style={styles.heroBody}>
          Lucent uses a short active face scan and your own baseline to estimate how your state is
          changing right now.
        </Text>
      </View>

      <Pressable
        onPress={hasResult ? onOpenResult : onStart}
        style={({ pressed }) => [styles.scanCard, pressed && { opacity: 0.92 }]}
      >
        <LinearGradient
          colors={['rgba(217,255,116,0.09)', 'rgba(154,245,207,0.03)', 'rgba(255,255,255,0.00)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.scanGlow}
        >
          <View style={styles.scanCardTop}>
            <View>
              <Text style={styles.scanCardLabel}>{hasResult ? 'LATEST READING' : 'LUCENT SCAN'}</Text>
              <Text style={styles.scanCardTime}>{hasResult ? 'Today · just now' : 'Camera · 5 seconds'}</Text>
            </View>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{hasResult ? 'Captured' : 'Ready'}</Text>
            </View>
          </View>

          {hasResult ? (
            <View style={styles.readingHero}>
              <View>
                <Text style={styles.readingScore}>78</Text>
                <Text style={styles.readingWord}>Ready</Text>
              </View>
              <View style={styles.readingSide}>
                <Text style={styles.readingSideLabel}>vs baseline</Text>
                <Text style={styles.readingSideValue}>+8%</Text>
                <Text style={styles.readingSideNote}>UI prototype data</Text>
              </View>
            </View>
          ) : (
            <ScanOrb progress={0} ready={false} />
          )}

          <View style={styles.scanCtaRow}>
            <Text style={styles.scanCtaText}>{hasResult ? 'View state details' : 'Start 5-second scan'}</Text>
            <Text style={styles.scanArrow}>↗</Text>
          </View>
        </LinearGradient>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>What Lucent watches</Text>
        <Text style={styles.sectionMeta}>Not diagnoses</Text>
      </View>

      <View style={styles.signalGrid}>
        <View style={styles.signalCard}>
          <Text style={styles.signalKicker}>01</Text>
          <Text style={styles.signalTitle}>Vigilance</Text>
          <Text style={styles.signalBody}>Ocular timing, gaze stability and learned performance patterns.</Text>
        </View>
        <View style={styles.signalCard}>
          <Text style={styles.signalKicker}>02</Text>
          <Text style={styles.signalTitle}>Autonomic response</Text>
          <Text style={styles.signalBody}>How your pupils respond to a controlled visual perturbation.</Text>
        </View>
        <View style={styles.signalCard}>
          <Text style={styles.signalKicker}>03</Text>
          <Text style={styles.signalTitle}>Pulse signal</Text>
          <Text style={styles.signalBody}>Short-window facial blood-volume variation when image quality permits.</Text>
        </View>
        <View style={styles.signalCard}>
          <Text style={styles.signalKicker}>04</Text>
          <Text style={styles.signalTitle}>Your baseline</Text>
          <Text style={styles.signalBody}>The same face means more when Lucent knows what normal looks like for you.</Text>
        </View>
      </View>

      <View style={styles.researchStrip}>
        <View style={{ flex: 1 }}>
          <Text style={styles.researchTitle}>Research mode</Text>
          <Text style={styles.researchBody}>
            Adds reference measurements so scans can train and validate APST-5.
          </Text>
        </View>
        <View style={styles.researchBadge}>
          <Text style={styles.researchBadgeText}>LAB</Text>
        </View>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function ActiveScan({ onDone }: { onDone: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const targetX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const next = Math.min(SCAN_MS, Date.now() - start);
      setElapsed(next);
      if (next >= SCAN_MS) {
        clearInterval(timer);
        setTimeout(onDone, 220);
      }
    }, 50);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: SCAN_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    const move = Animated.sequence([
      Animated.delay(1500),
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
    ]);
    move.start();

    return () => clearInterval(timer);
  }, [onDone, progressAnim, targetX]);

  const progress = elapsed / SCAN_MS;
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

  return (
    <View style={styles.scanFull}>
      <SafeAreaView style={styles.scanSafe}>
        <View style={styles.scanHeader}>
          <BrandMark />
          <View style={styles.securePill}>
            <View style={styles.secureDot} />
            <Text style={styles.secureText}>On-device capture</Text>
          </View>
        </View>

        <View style={styles.cameraStage}>
          <LinearGradient
            colors={
              elapsed >= 500 && elapsed < 900
                ? ['#1E271A', '#E7F6D0']
                : ['#080C09', '#0D130F']
            }
            style={styles.cameraFrame}
          >
            <View style={styles.faceOval} />
            <Animated.View
              style={[
                styles.stimulus,
                { transform: [{ translateX: targetTranslate }] },
              ]}
            />
            <View style={styles.cameraGuideTop}>
              <Text style={styles.cameraGuideText}>Keep your face inside the frame</Text>
            </View>
          </LinearGradient>

          <View style={styles.scanProgressRow}>
            <Text style={styles.scanPhase}>{phase}</Text>
            <Text style={styles.scanCountdown}>{secondsLeft}</Text>
          </View>
          <View style={styles.scanProgressTrack}>
            <Animated.View
              style={[
                styles.scanProgressFill,
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

        <View style={styles.scanFooter}>
          <Text style={styles.scanFooterTitle}>Five seconds. Multiple signals.</Text>
          <Text style={styles.scanFooterBody}>
            The screen provides a controlled stimulus while the front camera observes the response.
            This prototype does not yet compute validated state estimates.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Result({ onAgain, capture }: { onAgain: () => void; capture: LucentCaptureSummary | null }) {
  return (
    <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.resultTop}>
        <Text style={styles.eyebrow}>LUCENT STATE</Text>
        <View style={styles.prototypePill}>
          <Text style={styles.prototypeText}>UI PROTOTYPE</Text>
        </View>
      </View>

      <View style={styles.resultHero}>
        <Text style={styles.resultScore}>78</Text>
        <View style={styles.resultWordWrap}>
          <Text style={styles.resultWord}>Ready</Text>
          <Text style={styles.resultSubtitle}>Above your current baseline</Text>
        </View>
      </View>

      <MiniTrajectory />
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>Morning</Text>
        <Text style={styles.axisLabel}>Now</Text>
        <Text style={styles.axisLabel}>Evening</Text>
      </View>

      <Hairline />

      <Metric label="Vigilance" value="+12%" note="relative to learned baseline" accent={palette.acid} />
      <Metric label="Autonomic response" value="Stable" note="pupil-response pattern" accent={palette.mint} />
      <Metric label="Pulse" value="—" note="model not connected yet" accent={palette.ice} />
      <Metric
        label="Capture"
        value={capture?.cameraAvailable ? `${capture.frames} frames` : 'Unavailable'}
        note={
          capture?.cameraAvailable
            ? `${capture.fps.toFixed(1)} fps · ${(capture.durationMs / 1000).toFixed(1)} sec`
            : 'No camera data captured'
        }
        accent={palette.warm}
      />

      <View style={styles.callout}>
        <Text style={styles.calloutKicker}>LUCENT GAP</Text>
        <Text style={styles.calloutTitle}>How you feel vs. how you perform</Text>
        <Text style={styles.calloutBody}>
          This becomes a real metric only after Lucent has paired scans with objective reference
          measurements. For now it stays deliberately blank.
        </Text>
      </View>

      <Pressable onPress={onAgain} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Scan again</Text>
      </Pressable>

      <Text style={styles.disclaimer}>
        Prototype values are illustrative UI data, not measurements or medical information.
      </Text>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function History() {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.eyebrow}>YOUR BASELINE</Text>
      <Text style={styles.historyTitle}>Lucent gets useful when it knows you.</Text>
      <Text style={styles.historyBody}>
        Repeated scans form a personal reference so five seconds can be interpreted as a change from
        your own normal state instead of a generic population average.
      </Text>

      <View style={styles.emptyCard}>
        <View style={styles.emptyRing}>
          <Text style={styles.emptyRingText}>0</Text>
        </View>
        <Text style={styles.emptyTitle}>No longitudinal data yet</Text>
        <Text style={styles.emptyBody}>
          Once the inference pipeline is connected, this screen will show state history, baseline
          stability and confidence over time.
        </Text>
      </View>

      <View style={styles.historyRows}>
        {['Readiness trajectory', 'Baseline stability', 'Signal quality', 'Lucent Gap'].map((x) => (
          <View style={styles.historyRow} key={x}>
            <Text style={styles.historyRowText}>{x}</Text>
            <Text style={styles.historyRowValue}>—</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Profile() {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.eyebrow}>LUCENT</Text>
      <Text style={styles.historyTitle}>Built around your baseline, not a population score.</Text>

      <View style={styles.profileCard}>
        <Text style={styles.profileLabel}>RESEARCH STATUS</Text>
        <Text style={styles.profileTitle}>APST-5</Text>
        <Text style={styles.profileBody}>
          Active Personalized State Tomography in Five Seconds. The app will double as the
          experimental instrument used to validate the core method.
        </Text>
      </View>

      {[
        ['Camera processing', 'On device'],
        ['Raw face uploads', 'Off by default'],
        ['Research mode', 'Opt-in'],
        ['Model status', 'Not connected'],
      ].map(([k, v]) => (
        <View style={styles.settingRow} key={k}>
          <Text style={styles.settingKey}>{k}</Text>
          <Text style={styles.settingValue}>{v}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

export function LucentPrototype() {
  const [surface, setSurface] = useState<Surface>('today');
  const [scanStage, setScanStage] = useState<ScanStage>('idle');
  const [hasResult, setHasResult] = useState(false);
  const [capture, setCapture] = useState<LucentCaptureSummary | null>(null);

  if (scanStage === 'scan') {
    return (
      <LucentCameraScan
        onDone={(summary) => {
          setCapture(summary);
          setHasResult(true);
          setScanStage('result');
        }}
      />
    );
  }

  if (scanStage === 'result') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.shell}>
          <View style={styles.header}>
            <BrandMark />
            <Pressable onPress={() => setScanStage('idle')} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <Result capture={capture} onAgain={() => setScanStage('scan')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <BrandMark />
          <View style={styles.headerMeta}>
            <View style={styles.headerMetaDot} />
            <Text style={styles.headerMetaText}>V0 research build</Text>
          </View>
        </View>

        <View style={styles.body}>
          {surface === 'today' && (
            <Today
              hasResult={hasResult}
              onStart={() => setScanStage('scan')}
              onOpenResult={() => setScanStage('result')}
            />
          )}
          {surface === 'history' && <History />}
          {surface === 'profile' && <Profile />}
        </View>

        <View style={styles.nav}>
          {[
            ['today', 'Today'],
            ['history', 'History'],
            ['profile', 'Lucent'],
          ].map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setSurface(key as Surface)}
              style={[styles.navItem, surface === key && styles.navItemActive]}
            >
              <View style={[styles.navMarker, surface === key && styles.navMarkerActive]} />
              <Text style={[styles.navText, surface === key && styles.navTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  shell: { flex: 1, backgroundColor: palette.bg },
  body: { flex: 1 },
  header: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  brandMark: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.acid },
  brand: {
    color: palette.text,
    fontFamily: 'Figtree_700Bold',
    fontSize: 13,
    letterSpacing: 3.1,
  },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerMetaDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.mint },
  headerMetaText: { color: palette.dim, fontFamily: 'Figtree_500Medium', fontSize: 10.5 },
  scroll: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 22 },
  hero: { paddingTop: 8, paddingBottom: 24 },
  eyebrow: {
    color: palette.dim,
    fontFamily: 'Figtree_600SemiBold',
    fontSize: 10.5,
    letterSpacing: 1.9,
  },
  heroTitle: {
    marginTop: 12,
    color: palette.text,
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 39,
    lineHeight: 42,
  },
  heroTitleAccent: { color: palette.acid },
  heroBody: {
    marginTop: 14,
    color: palette.dim,
    fontFamily: 'Figtree_400Regular',
    fontSize: 13.5,
    lineHeight: 20,
    maxWidth: 335,
  },
  scanCard: {
    borderWidth: 1,
    borderColor: palette.lineStrong,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: palette.panel,
  },
  scanGlow: { padding: 18 },
  scanCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  scanCardLabel: {
    color: palette.text,
    fontFamily: 'Figtree_700Bold',
    fontSize: 10,
    letterSpacing: 1.6,
  },
  scanCardTime: { marginTop: 5, color: palette.faint, fontFamily: 'Figtree_500Medium', fontSize: 10.5 },
  statusPill: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.acid },
  statusText: { color: palette.dim, fontFamily: 'Figtree_600SemiBold', fontSize: 9.5 },
  orbWrap: { alignItems: 'center', paddingVertical: 28 },
  orbOuter: {
    width: 196,
    height: 196,
    borderRadius: 98,
    padding: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbInner: {
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: '#070A08',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbTop: {
    color: palette.dim,
    fontFamily: 'Figtree_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.8,
  },
  orbBig: {
    marginTop: 2,
    color: palette.text,
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 58,
    lineHeight: 62,
  },
  orbSub: { color: palette.faint, fontFamily: 'Figtree_500Medium', fontSize: 10.5 },
  orbProgressTrack: {
    marginTop: 16,
    width: 156,
    height: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  orbProgressFill: { height: 2, backgroundColor: palette.acid },
  scanCtaRow: {
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
    paddingTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scanCtaText: { color: palette.text, fontFamily: 'Figtree_600SemiBold', fontSize: 12 },
  scanArrow: { color: palette.acid, fontSize: 18, lineHeight: 22 },
  readingHero: {
    paddingVertical: 30,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  readingScore: { color: palette.text, fontFamily: 'InstrumentSerif_400Regular', fontSize: 84, lineHeight: 86 },
  readingWord: { marginTop: -7, color: palette.acid, fontFamily: 'Figtree_700Bold', fontSize: 17 },
  readingSide: { alignItems: 'flex-end', paddingBottom: 8 },
  readingSideLabel: { color: palette.faint, fontFamily: 'Figtree_500Medium', fontSize: 9.5 },
  readingSideValue: { marginTop: 2, color: palette.mint, fontFamily: 'Figtree_700Bold', fontSize: 18 },
  readingSideNote: { marginTop: 4, color: palette.faint, fontFamily: 'Figtree_400Regular', fontSize: 8.5 },
  sectionHeader: {
    marginTop: 28,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { color: palette.text, fontFamily: 'Figtree_700Bold', fontSize: 12.5 },
  sectionMeta: { color: palette.faint, fontFamily: 'Figtree_500Medium', fontSize: 9.5 },
  signalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  signalCard: {
    width: '48.8%',
    minHeight: 132,
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
  },
  signalKicker: { color: palette.acid, fontFamily: 'Figtree_700Bold', fontSize: 9, letterSpacing: 1.2 },
  signalTitle: { marginTop: 18, color: palette.text, fontFamily: 'Figtree_700Bold', fontSize: 12 },
  signalBody: { marginTop: 7, color: palette.faint, fontFamily: 'Figtree_400Regular', fontSize: 10.5, lineHeight: 15 },
  researchStrip: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    borderRadius: 20,
    backgroundColor: '#0D120F',
    borderWidth: 1,
    borderColor: 'rgba(217,255,116,0.15)',
  },
  researchTitle: { color: palette.text, fontFamily: 'Figtree_700Bold', fontSize: 12 },
  researchBody: { marginTop: 3, color: palette.faint, fontFamily: 'Figtree_400Regular', fontSize: 10.5, lineHeight: 15 },
  researchBadge: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: palette.acid,
  },
  researchBadgeText: { color: palette.ink, fontFamily: 'Figtree_700Bold', fontSize: 9, letterSpacing: 1.2 },
  nav: {
    height: 70,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
    backgroundColor: 'rgba(5,7,6,0.98)',
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 7, paddingTop: 6 },
  navItemActive: {},
  navMarker: { width: 16, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  navMarkerActive: { backgroundColor: palette.acid },
  navText: { color: palette.faint, fontFamily: 'Figtree_600SemiBold', fontSize: 10 },
  navTextActive: { color: palette.text },
  scanFull: { flex: 1, backgroundColor: palette.bg },
  scanSafe: { flex: 1 },
  scanHeader: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  securePill: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  secureDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.mint },
  secureText: { color: palette.dim, fontFamily: 'Figtree_500Medium', fontSize: 10 },
  cameraStage: { flex: 1, paddingHorizontal: 18, justifyContent: 'center' },
  cameraFrame: {
    width: '100%',
    aspectRatio: 0.78,
    maxHeight: 510,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceOval: {
    width: 202,
    height: 270,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(243,246,241,0.45)',
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
  cameraGuideTop: {
    position: 'absolute',
    top: 18,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  cameraGuideText: { color: palette.text, fontFamily: 'Figtree_500Medium', fontSize: 10.5 },
  scanProgressRow: {
    marginTop: 18,
    paddingHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  scanPhase: { color: palette.text, fontFamily: 'Figtree_600SemiBold', fontSize: 13 },
  scanCountdown: { color: palette.acid, fontFamily: 'InstrumentSerif_400Regular', fontSize: 28 },
  scanProgressTrack: {
    marginTop: 9,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  scanProgressFill: { height: 3, backgroundColor: palette.acid },
  scanFooter: { paddingHorizontal: 22, paddingBottom: 18 },
  scanFooterTitle: { color: palette.text, fontFamily: 'Figtree_700Bold', fontSize: 12.5 },
  scanFooterBody: { marginTop: 5, color: palette.faint, fontFamily: 'Figtree_400Regular', fontSize: 10.5, lineHeight: 15 },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: palette.text, fontSize: 22, lineHeight: 24 },
  resultScroll: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 22 },
  resultTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prototypePill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(217,255,116,0.22)',
    backgroundColor: 'rgba(217,255,116,0.06)',
  },
  prototypeText: { color: palette.acid, fontFamily: 'Figtree_700Bold', fontSize: 8.5, letterSpacing: 1.2 },
  resultHero: { marginTop: 18, flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  resultScore: { color: palette.text, fontFamily: 'InstrumentSerif_400Regular', fontSize: 104, lineHeight: 116 },
  resultWordWrap: { paddingBottom: 14, flex: 1 },
  resultWord: { color: palette.acid, fontFamily: 'Figtree_700Bold', fontSize: 22 },
  resultSubtitle: { marginTop: 4, color: palette.faint, fontFamily: 'Figtree_400Regular', fontSize: 10.5, lineHeight: 15 },
  trajectory: {
    height: 88,
    marginTop: 26,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  trajectoryBar: { flex: 1, minWidth: 2, borderRadius: 3 },
  axisRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { color: palette.faint, fontFamily: 'Figtree_500Medium', fontSize: 9 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: palette.line, marginVertical: 20 },
  metric: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  metricSignal: { width: 6, height: 6, borderRadius: 3 },
  metricLabel: { color: palette.text, fontFamily: 'Figtree_700Bold', fontSize: 11.5 },
  metricNote: { marginTop: 2, color: palette.faint, fontFamily: 'Figtree_400Regular', fontSize: 9.5 },
  metricValue: { color: palette.text, fontFamily: 'Figtree_600SemiBold', fontSize: 12 },
  callout: {
    marginTop: 18,
    padding: 17,
    borderRadius: 22,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
  },
  calloutKicker: { color: palette.acid, fontFamily: 'Figtree_700Bold', fontSize: 9, letterSpacing: 1.5 },
  calloutTitle: { marginTop: 8, color: palette.text, fontFamily: 'Figtree_700Bold', fontSize: 13.5 },
  calloutBody: { marginTop: 6, color: palette.faint, fontFamily: 'Figtree_400Regular', fontSize: 10.5, lineHeight: 15.5 },
  primaryButton: {
    marginTop: 18,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.acid,
  },
  primaryButtonText: { color: palette.ink, fontFamily: 'Figtree_700Bold', fontSize: 12.5 },
  disclaimer: { marginTop: 12, textAlign: 'center', color: palette.faint, fontFamily: 'Figtree_400Regular', fontSize: 9.5, lineHeight: 14 },
  historyTitle: { marginTop: 14, color: palette.text, fontFamily: 'InstrumentSerif_400Regular', fontSize: 36, lineHeight: 39 },
  historyBody: { marginTop: 13, color: palette.dim, fontFamily: 'Figtree_400Regular', fontSize: 13, lineHeight: 19 },
  emptyCard: {
    marginTop: 26,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 30,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
  },
  emptyRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(217,255,116,0.30)',
  },
  emptyRingText: { color: palette.acid, fontFamily: 'InstrumentSerif_400Regular', fontSize: 33 },
  emptyTitle: { marginTop: 15, color: palette.text, fontFamily: 'Figtree_700Bold', fontSize: 13 },
  emptyBody: { marginTop: 6, textAlign: 'center', color: palette.faint, fontFamily: 'Figtree_400Regular', fontSize: 10.5, lineHeight: 16 },
  historyRows: { marginTop: 14 },
  historyRow: {
    height: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  historyRowText: { color: palette.dim, fontFamily: 'Figtree_500Medium', fontSize: 11.5 },
  historyRowValue: { color: palette.faint, fontFamily: 'Figtree_600SemiBold', fontSize: 12 },
  profileCard: {
    marginTop: 24,
    padding: 18,
    borderRadius: 24,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: 'rgba(217,255,116,0.16)',
  },
  profileLabel: { color: palette.acid, fontFamily: 'Figtree_700Bold', fontSize: 9, letterSpacing: 1.5 },
  profileTitle: { marginTop: 10, color: palette.text, fontFamily: 'InstrumentSerif_400Regular', fontSize: 38 },
  profileBody: { marginTop: 6, color: palette.dim, fontFamily: 'Figtree_400Regular', fontSize: 11, lineHeight: 16.5 },
  settingRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  settingKey: { color: palette.dim, fontFamily: 'Figtree_500Medium', fontSize: 11.5 },
  settingValue: { color: palette.text, fontFamily: 'Figtree_600SemiBold', fontSize: 10.5 },
});
