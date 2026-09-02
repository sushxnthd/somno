import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, AmbientBlob, GlassOrb } from '../../components';
import { Icon } from '../../components/Icons';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';

const TIPS = [
  { icon: 'sun' as const, text: 'Face a light source, because backlighting is the usual culprit.' },
  { icon: 'checkin' as const, text: "Hold the phone about an arm's length away, steady." },
  { icon: 'shield' as const, text: 'Nothing failed silently. No partial data was saved.' },
];

export function ScanErrScreen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const retryScan = useSomnoStore((s) => s.retryScan);
  const skipScan = useSomnoStore((s) => s.skipScan);

  return (
    <ScreenContainer entry={false}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.body}>
          <View style={styles.hero}>
            {/* source: inset:-10px on a 150px orb -> 170px, warm from 160deg, blur(26px) saturate(180%), .5, 22s */}
            <AmbientBlob size={170} warm fromDeg={160} blurPx={26} saturate={1.8} opacity={0.5} durationMs={22000} />
            <GlassOrb size={150} highlight={0} fill={0.06} borderAlpha={0.18}>
              <Icon name="warning" size={40} color="#FFC98F" />
            </GlassOrb>
          </View>
          <Text style={styles.headline}>We couldn't read your face signal.</Text>
          <View style={{ gap: 8 }}>
            {TIPS.map((t, i) => (
              <View key={i} style={styles.tip}>
                <Icon name={t.icon} size={18} color={color.textDim70} />
                <Text style={styles.tipText}>{t.text}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>You can skip it. Your score still works on three signals, with a wider confidence band.</Text>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <PrimaryButton label="Try the scan again" onPress={retryScan} />
          <SecondaryButton label="Continue without it" onPress={skipScan} />
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 28 },
  body: { flex: 1, justifyContent: 'center', gap: 20 },
  hero: { alignSelf: 'center', width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  headline: { fontFamily: font.serif, fontSize: 32, lineHeight: 36, color: color.text },
  tip: {
    flexDirection: 'row',
    gap: 11,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    padding: 14,
  },
  tipText: { flex: 1, fontFamily: font.sans500, fontSize: 13, lineHeight: 17, color: color.text },
  note: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim45 },
  footer: { paddingBottom: 0, gap: 10 },
});
