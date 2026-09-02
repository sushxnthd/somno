import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard } from '../../components';
import { BackChevron } from '../../components/TopBar';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';

const STEPS = [
  { n: '01', title: 'Reaction time carries the most weight', body: 'Lapses in attention are the best-studied consequence of sleep loss.' },
  { n: '02', title: 'The face scan is a supporting signal', body: 'Light around your eyes, skin colour and how steadily you hold still, measured on your device and then discarded.' },
  { n: '03', title: 'Confidence is shown, never hidden', body: 'Fewer signals means a wider margin, and we say so on the score.' },
];

export function F7Screen() {
  const go = useSomnoStore((s) => s.go);

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.top}>
          <BackChevron onPress={() => go('F0')} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>How Somno works</Text>
          <Text style={styles.intro}>
            {/* Four, not three. The SDI fuses the tap test, the face scan, your own rating and
                accumulated sleep debt — the debt carries the second-largest weight of the four in
                engine/sdi.ts, so leaving it out of the explanation understated what the score is
                built from and made the "4 signals" label on every result screen unexplained. */}
            Somno watches four things that change when you&apos;re short on sleep: how fast you react, how your face holds itself, how sleepy you say you
            feel, and the sleep you have missed. It weighs them against your own baseline, not a population average.
          </Text>
          <View style={{ gap: 9 }}>
            {STEPS.map((s) => (
              <GlassCard key={s.n} variant="faint" radiusSize={18} pad={14}>
                <View style={styles.stepRow}>
                  <Text style={styles.stepNum}>{s.n}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{s.title}</Text>
                    <Text style={styles.stepBody}>{s.body}</Text>
                  </View>
                </View>
              </GlassCard>
            ))}
          </View>
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>What Somno is not</Text>
            <Text style={styles.warnBody}>
              It is not a medical device and it does not diagnose insomnia, apnoea, or any other condition. Your SDI, your sleep debt and the sleep stages
              it shows are estimates modelled from what you give it — none of them is a clinically validated measurement, and nothing here has been checked
              against a sleep lab. If something feels wrong with your sleep, talk to a clinician, and bring the export if it helps.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  // The source's header is a plain block holding an inline-flex 20px chevron, so its line box is
  // 20px + the strut's descender ~= 24px tall, not 20px. Without the extra 4px everything below
  // it sat 4px high.
  top: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 4 },
  body: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 40, gap: 14 },
  headline: { fontFamily: font.serif, fontSize: 34, lineHeight: 37.4, color: color.text }, // 34px/1.1
  intro: { fontFamily: font.sans400, fontSize: 14.5, lineHeight: 23.2, color: color.textDim70 }, // 14.5px/1.6
  stepRow: { flexDirection: 'row', gap: 12, padding: 0 },
  stepNum: { fontFamily: font.serif, fontSize: 21, lineHeight: 27.3, color: color.text, opacity: 0.4, flexShrink: 0 },
  stepTitle: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  stepBody: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18.75, color: color.textDim55, marginTop: 2 }, // 12.5px/1.5
  warnBox: { backgroundColor: 'rgba(255,184,119,0.14)', borderWidth: 1, borderColor: 'rgba(255,184,119,0.22)', borderRadius: 20, padding: 16, gap: 5 },
  warnTitle: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  warnBody: { fontFamily: font.sans400, fontSize: 12.5, lineHeight: 20, color: color.textDim70 }, // 12.5px/1.6
});
