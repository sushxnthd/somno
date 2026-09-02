import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer , AnimatedNumber } from '../../components';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';

export function A8Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const go = useSomnoStore((s) => s.go);
  const avgMs = useSomnoStore((s) => s.avgMs);
  const baselineTrials = useSomnoStore((s) => s.baselineTrials);

  /**
   * The same screen ends two different journeys.
   *
   * During onboarding it is step eight of nine and the next thing is the first alarm. Reached from
   * Settings → Recalibrate it is the last step, and it used to end with "Set up my alarm" leading
   * to A9 — so someone who tapped Recalibrate to correct a drifting baseline was walked into the
   * onboarding alarm screen and, from there, into "finish onboarding". The exit belongs to whichever
   * journey brought them here.
   */
  const recalibration = useSomnoStore((s) => s.recalibration);
  const finishRecalibration = useSomnoStore((s) => s.finishRecalibration);
  const recalibrating = recalibration != null;

  return (
    <ScreenContainer entry={false}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.body}>
          <View style={styles.hero}>
            {/* The reaction time the run just measured — count to it. */}
            <AnimatedNumber value={avgMs()} style={styles.ms} suffix="ms" />
          </View>
          <Text style={styles.headline}>{recalibrating ? 'Ready to replace your baseline.' : 'Your baseline is set.'}</Text>
          <Text style={styles.sub}>
            {recalibrating
              ? `Your average reaction time across ${recalibration?.trials ?? baselineTrials} trials replaces the old one when you tap Done, and everything from there is measured against it.` +
                (recalibration?.faceBaseline
                  ? ' Your facial calibration is replaced too — the next few scans read as still learning it.'
                  : ' Your facial calibration is left as it was, because no new scan was taken.')
              : `We'll get more accurate the more you check in. Your average reaction time across ${baselineTrials} trials is the line everything else is measured against.`}
          </Text>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <PrimaryButton
            label={recalibrating ? 'Done' : 'Set up my alarm'}
            onPress={recalibrating ? finishRecalibration : () => go('A9')}
          />
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 30 },
  body: { flex: 1, justifyContent: 'center', gap: 24 },
  hero: {
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(150,130,230,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ms: { fontFamily: font.sans600, fontSize: 52, color: color.text },
  headline: { fontFamily: font.serif, fontSize: 34, lineHeight: 38, color: color.text },
  sub: { fontFamily: font.sans400, fontSize: 14.5, lineHeight: 22, color: color.textDim55 },
  footer: { paddingBottom: 0 },
});
