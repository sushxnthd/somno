import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer , CssGradient } from '../../components';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';

export function C1Screen() {
  const go = useSomnoStore((s) => s.go);
  // Seeds the entry from the user's own schedule rather than the mockup's 23:52 / 06:41.
  const startSleepLog = useSomnoStore((s) => s.startSleepLog);
  const startDailyCheckin = useSomnoStore((s) => s.startDailyCheckin);
  // Quick Rating is a check-in with one signal. It used to navigate straight to the rating
  // screen, which reset nothing, so it fused whatever the last check-in had measured.
  const startQuickRating = useSomnoStore((s) => s.startQuickRating);
  const startAlarmDemo = useSomnoStore((s) => s.startAlarmDemo);

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headline}>Check in</Text>
          <Text style={styles.subtext}>However much time you have right now.</Text>
        </View>
        <View style={styles.body}>
          <Pressable onPress={startDailyCheckin} accessibilityRole="button">
            <CssGradient
              angle={155}
              colors={['rgba(150,128,255,0.35)', 'rgba(255,255,255,0.05)']}
              style={styles.fullCard}
            >
              <View style={styles.rowBetween}>
                <View style={styles.recommendedPill}>
                  <Text style={styles.recommendedText}>RECOMMENDED</Text>
                </View>
                <Text style={styles.timeMuted}>~30 sec</Text>
              </View>
              <View>
                <Text style={styles.fullTitle}>Full check-in</Text>
                <Text style={styles.fullBody}>Tap test, face scan, and a one-tap rating. All four signals, highest confidence.</Text>
              </View>
              <View style={styles.chipRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>Tap test</Text>
                </View>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>Face scan</Text>
                </View>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>Rating</Text>
                </View>
              </View>
            </CssGradient>
          </Pressable>

          <Pressable onPress={startQuickRating} style={styles.rowCard} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Quick rating</Text>
              <Text style={styles.rowSub}>Just the sleepiness scale. Lower confidence.</Text>
            </View>
            <Text style={styles.rowMeta}>~5 sec</Text>
          </Pressable>

          <Pressable onPress={startSleepLog} style={styles.rowCard} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Log sleep</Text>
              <Text style={styles.rowSub}>Enter last night's bedtime and wake time.</Text>
            </View>
            <Text style={styles.rowMeta}>~15 sec</Text>
          </Pressable>

          <Pressable onPress={startAlarmDemo} style={styles.previewCard} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={styles.previewTitle}>Preview Smart Wake</Text>
              <Text style={styles.previewSub}>See the alarm-time check-in without waiting for 7am.</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <View style={{ height: 90 }} />
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 18 },
  headline: { fontFamily: font.serif, fontSize: 32, lineHeight: 36, color: color.text, marginBottom: 5 },
  subtext: { fontFamily: font.sans500, fontSize: 13.5, lineHeight: 20, color: color.textDim50 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 18, gap: 11 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fullCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: 22,
    gap: 13,
  },
  recommendedPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' },
  recommendedText: { fontFamily: font.sans600, fontSize: 10, letterSpacing: 0.6, color: color.text },
  timeMuted: { fontFamily: font.sans500, fontSize: 12, color: 'rgba(236,234,246,0.65)' },
  fullTitle: { fontFamily: font.serif, fontSize: 28, color: color.text },
  fullBody: { marginTop: 3, fontFamily: font.sans500, fontSize: 13, lineHeight: 19.5, color: 'rgba(236,234,246,0.65)' },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)' },
  chipText: { fontFamily: font.sans500, fontSize: 11.5, color: color.text },
  rowCard: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 26,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: { fontFamily: font.serif, fontSize: 23, color: color.text },
  rowSub: { marginTop: 2, fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim50 },
  rowMeta: { fontFamily: font.sans500, fontSize: 12, color: color.textDim40, marginLeft: 12 },
  previewCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  previewSub: { marginTop: 2, fontFamily: font.sans500, fontSize: 12, lineHeight: 17, color: color.textDim45 },
  chevron: { color: color.textDim35, fontSize: 16 },
});
