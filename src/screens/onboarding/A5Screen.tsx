import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, AmbientBlob, GlassOrb, GlassCard } from '../../components';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore, BASELINE_PVT_TRIALS } from '../../store/useSomnoStore';

export function A5Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const startPvt = useSomnoStore((s) => s.startPvt);

  return (
    <ScreenContainer entry={false}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.body}>
          <View style={styles.hero}>
            {/* source: inset:-14px on a 220px orb -> 248px, warm from 150deg, blur(28px) saturate(165%), .68, 19s */}
            <AmbientBlob size={248} warm fromDeg={150} blurPx={28} saturate={1.65} opacity={0.68} durationMs={19000} />
            <GlassOrb size={220} highlight={0.3} borderAlpha={0.16} breatheMs={5000} />
          </View>
          {/* Ninety seconds, not two minutes: the two cards below add up to about a minute of tap
              test and fifteen seconds of scan, and a promise that overshoots by a third is the kind
              of small dishonesty that makes someone distrust the rest of the screen. */}
          <Text style={styles.headline}>For the next 90 seconds, we&apos;ll measure you at your best.</Text>
          <Text style={styles.sub}>Everything Somno tells you later is compared against THIS, not against anyone else.</Text>
          <View style={{ gap: 9 }}>
            <GlassCard variant="faint" radiusSize={18} pad={14}>
              <View style={styles.stepRow}>
                <View style={styles.stepBadge}><Text style={styles.stepNum}>1</Text></View>
                <View>
                  <Text style={styles.stepTitle}>Tap test</Text>
                  <Text style={styles.stepSub}>{`${BASELINE_PVT_TRIALS} trials, about a minute`}</Text>
                </View>
              </View>
            </GlassCard>
            <GlassCard variant="faint" radiusSize={18} pad={14}>
              <View style={styles.stepRow}>
                <View style={styles.stepBadge}><Text style={styles.stepNum}>2</Text></View>
                <View>
                  <Text style={styles.stepTitle}>Face scan</Text>
                  <Text style={styles.stepSub}>About 15 seconds</Text>
                </View>
              </View>
            </GlassCard>
          </View>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <PrimaryButton label="Start calibration" onPress={() => startPvt(BASELINE_PVT_TRIALS, 'A8')} />
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 30 },
  body: { flex: 1, justifyContent: 'center', gap: 22 },
  hero: { alignSelf: 'center', width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  headline: { fontFamily: font.serif, fontSize: 34, lineHeight: 38, color: color.text },
  sub: { fontFamily: font.sans400, fontSize: 14.5, lineHeight: 22, color: color.textDim55 },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  stepBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(138,123,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontFamily: font.sans600, fontSize: 12, color: color.text },
  stepTitle: { fontFamily: font.sans700, fontSize: 14, color: color.text },
  stepSub: { fontFamily: font.sans500, fontSize: 12, color: color.textDim45 },
  footer: { paddingBottom: 0 },
});
