import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, BreatheGlow , CssGradient } from '../../components';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore, BASELINE_PVT_TRIALS } from '../../store/useSomnoStore';
import { SettingsHeader } from './_shared';

export function F6Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const go = useSomnoStore((s) => s.go);
  const baseline = useSomnoStore((s) => s.baseline);
  const recalibrateBaseline = useSomnoStore((s) => s.recalibrateBaseline);
  const baselineProfile = useSomnoStore((s) => s.baselineProfile);
  const faceBaseline = useSomnoStore((s) => s.faceBaseline);

  const baselineSetOn = baselineProfile?.createdAt
    ? new Date(baselineProfile.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    : null;
  const faceCalibrated = (faceBaseline?.periorbital.n ?? 0) > 0;
  // How many tap tests the current estimate is built from — a single session is still a first guess.
  const sessionCount = useSomnoStore((s) => s.pvtSessions.length);

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SettingsHeader title="Recalibrate" onBack={() => go('F0')} />
        <View style={styles.body}>
          <View style={styles.orbWrap}>
            {/* The one hero orb in the design that is a radial bloom, not a conic blob. */}
            <BreatheGlow size={180} />
          </View>
          <Text style={styles.headline}>If your scores feel off, redo your baseline.</Text>
          <Text style={styles.paragraph}>
            Life changes, like a new job, a new baby or new medication, can shift what &ldquo;your best&rdquo; looks like. Recalibrating takes about a minute and runs the same two tests as your first day.
          </Text>
          {/*
            Says when the old calibration goes, because the answer changed and it matters.

            It used to be cleared the moment this screen's button was tapped — before a single
            replacement measurement existed — so backing out of the tap test or failing the scan
            destroyed a working reference and left nothing behind it. Nothing is discarded now until
            a replacement has actually been measured, and this paragraph is the promise that makes.
          */}
          <Text style={styles.paragraph}>
            Both baselines are measured first and replaced together at the end, so nothing changes if you
            back out part-way. Once they are replaced, the next few face scans read as &ldquo;still learning
            your usual face&rdquo; while the new calibration settles.
          </Text>
          <View style={styles.card}>
            <View>
              <Text style={styles.cardLabel}>Current baseline</Text>
              {/* The real date the baseline was captured. This read "set 7 July" — a fixed
                  string from the design mockup, shown to every user on every device regardless of
                  when they had actually calibrated. */}
              <Text style={styles.cardValue}>
                {baseline} ms{baselineSetOn ? ` · set ${baselineSetOn}` : ' · not set yet'}
              </Text>
            </View>
            {/*
              A statement, not a link.

              This read "History ›" — chevron and all — on a plain Text with no handler behind it.
              There is no history screen, and tapping the one affordance on this card did nothing at
              all. The sessions behind the estimate are worth knowing, so the card says how many
              there are instead of offering a journey it cannot make.
            */}
            <Text style={styles.cardMeta}>
              {sessionCount === 0 ? 'No sessions yet' : `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`}
            </Text>
          </View>
          <Text style={styles.footnote}>
            {faceCalibrated
              ? 'Your facial calibration is replaced, not merged — a reference that is only partly moved drifts again.'
              : 'You have no facial calibration yet, so this sets your reaction-time baseline only.'}
          </Text>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <Pressable onPress={recalibrateBaseline} accessibilityRole="button">
            {/* `linear-gradient(150deg, ...)` — the design fills its CTAs with a gradient, not a flat tint. */}
            <CssGradient angle={150} colors={['rgba(255,255,255,0.96)', 'rgba(214,208,255,0.86)']} style={styles.cta}>
              <Text style={styles.ctaText}>Start recalibration</Text>
            </CssGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 16, gap: 18 },
  orbWrap: { alignSelf: 'center', width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  headline: { fontFamily: font.serif, fontSize: 28, lineHeight: 32, color: color.text },
  paragraph: { fontFamily: font.sans400, fontSize: 14, lineHeight: 22, color: color.textDim55 },
  card: {
    backgroundColor: color.glassFillFaint,
    borderWidth: 1,
    borderColor: color.glassBorder12,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: { fontFamily: font.sans500, fontSize: 11.5, color: color.textDim45 },
  cardValue: { fontFamily: font.sans700, fontSize: 14.5, color: color.text, marginTop: 2 },
  cardMeta: { fontFamily: font.sans500, fontSize: 12, color: color.textDim40 },
  footnote: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim40 },
  footer: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 0 },
  cta: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7A5CFF',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  ctaText: { fontFamily: font.sans700, fontSize: 16, color: color.ink },
});
