import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenContainer, GlassCard, AmbientBlob } from '../../components';
import { Icon } from '../../components/Icons';
import { color, font, gradient, displayNumeral } from '../../theme/tokens';
import { useSomnoStore, useWeeklyReview, useIs24h } from '../../store/useSomnoStore';
import { fmt } from '../../utils/format';
import { SettingsHeader } from './_shared';

function barGradient(v: number): readonly [string, string] {
  if (v >= 75) return gradient.weekBarHigh;
  if (v >= 60) return gradient.weekBarMid;
  return gradient.weekBarLow;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function W1Screen() {
  const is24h = useIs24h();
  const go = useSomnoStore((s) => s.go);
  const review = useWeeklyReview();

  const range = `${new Date(review.days[0].dayStart)
    .toLocaleDateString(undefined, { day: 'numeric' })} – ${new Date(review.days[6].dayStart)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    .toUpperCase()}`;

  // A week with one or two check-ins in it cannot carry a "your average rose" narrative. Below
  // three days the screen says what it has instead of dressing it up as a review.
  const enough = review.daysWithData >= 3;
  const dayName = (d: { dayStart: number } | null) => (d ? DAY_NAMES[new Date(d.dayStart).getDay()] : '—');
  const bedLabel = (d: { bedMin: number | null } | null) => (d?.bedMin != null ? ` · in bed ${fmt(d.bedMin, is24h)}` : '');

  const headline = !enough
    ? 'Not enough check-ins yet for a weekly picture. Three days in a week is where the comparison starts to mean something.'
    : review.delta == null
      ? `Your first full week: an average of ${review.average} across ${review.daysWithData} ${review.daysWithData === 1 ? 'day' : 'days'}. Next week gets a comparison.`
      : review.delta > 0
        ? `Your average alertness rose ${review.delta} points against last week, across ${review.daysWithData} days of check-ins.`
        : review.delta < 0
          ? `Your average alertness fell ${Math.abs(review.delta)} points against last week. A run like this usually tracks accumulated debt rather than one bad night.`
          : 'Your average alertness held level with last week.';

  const tip =
    review.wakeSpreadMin != null && review.wakeSpreadMin >= 60
      ? `Your wake time moved by ${Math.round(review.wakeSpreadMin)} minutes across the week. Holding it inside an hour is the single change most likely to lift next week's average.`
      : review.daysWithData < 5
        ? 'Checking in on more days is what turns this page from a snapshot into a trend. Even the one-tap rating counts.'
        : 'Your wake time held steady this week. That consistency is doing more for your average than any single long night would.';

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SettingsHeader title="Weekly review" onBack={() => go('E')} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            {/* source: 230x230 at right -60/top -70, from 170deg, blur(40px) saturate(165%), .45, 22s */}
            <AmbientBlob size={230} style={{ right: -60, top: -70, left: undefined }} fromDeg={170} blurPx={40} saturate={1.65} opacity={0.45} durationMs={22000} />
            <Text style={styles.heroLabel}>{range}</Text>
            <View style={styles.heroRow}>
              <Text style={styles.heroScore}>{review.average ?? '—'}</Text>
              {/* A fall printed in the same mint green as a rise reads as good news either way.
                  The colour follows the sign. */}
              {review.delta != null && (
                <Text style={[styles.heroDelta, review.delta < 0 && styles.heroDeltaDown]}>
                  {`${review.delta >= 0 ? '+' : ''}${review.delta} vs last week`}
                </Text>
              )}
            </View>
            <Text style={styles.heroBody}>{headline}</Text>
          </View>

          <GlassCard variant="faint" radiusSize={24} pad={16}>
            <View style={{ gap: 9 }}>
              <View style={styles.rowIcon}>
                <Icon name="trends" size={16} color={color.textDim70} />
                <Text style={styles.cardTitle}>Night by night</Text>
              </View>
              <View style={styles.barsRow}>
                {review.days.map((d, i) => (
                  <View key={i} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      {/* A day with no check-in draws no bar. An empty column is the honest
                          rendering of a day that was never measured. */}
                      {d.sdi != null && (
                        <LinearGradient
                          colors={barGradient(d.sdi) as unknown as [string, string]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={[styles.barFill, { height: Math.round((d.sdi / 100) * 88) }]}
                        />
                      )}
                    </View>
                    <Text style={[styles.barLabel, { color: i === 6 ? color.text : color.textDim40 }]}>{d.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </GlassCard>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>BEST NIGHT</Text>
              <Text style={styles.statValue}>{dayName(review.best)}</Text>
              <Text style={styles.statSub}>{review.best ? `SDI ${review.best.sdi}${bedLabel(review.best)}` : 'No check-ins yet'}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>HARDEST</Text>
              <Text style={styles.statValue}>{dayName(review.worst)}</Text>
              <Text style={styles.statSub}>{review.worst ? `SDI ${review.worst.sdi}${bedLabel(review.worst)}` : 'No check-ins yet'}</Text>
            </View>
          </View>

          <View style={styles.tipCard}>
            <Icon name="bulb" size={19} color="#DCD3FF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.tipTitle}>One thing for next week</Text>
              <Text style={styles.tipBody}>{tip}</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30, gap: 11 },
  heroCard: {
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 20,
    gap: 10,
  },
  heroLabel: { fontFamily: font.sans700, fontSize: 10.5, letterSpacing: 2, color: color.textDim50 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  heroScore: { fontFamily: font.sans600, ...displayNumeral(62), color: color.text, letterSpacing: -1.86 }, // 62px/1, -.03em
  heroDelta: { fontFamily: font.sans700, fontSize: 13, color: '#9FE3C0' },
  heroDeltaDown: { color: '#FFB877' },
  heroBody: { fontFamily: font.sans500, fontSize: 13, lineHeight: 20, color: color.textDim70 },
  rowIcon: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardTitle: { fontFamily: font.sans700, fontSize: 13, color: color.text },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, height: 92 },
  barCol: { flex: 1, alignItems: 'center', gap: 7, justifyContent: 'flex-end' },
  barTrack: { width: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 8 },
  barLabel: { fontFamily: font.sans700, fontSize: 10 },
  statsRow: { flexDirection: 'row', gap: 9 },
  statCard: {
    flex: 1,
    backgroundColor: color.glassFillFaint,
    borderWidth: 1,
    borderColor: color.glassBorder12,
    borderRadius: 22,
    padding: 15,
  },
  statLabel: { fontFamily: font.sans700, fontSize: 10.5, letterSpacing: 1, color: color.textDim45 },
  statValue: { fontFamily: font.sans600, fontSize: 24, color: color.text, marginTop: 4 },
  statSub: { fontFamily: font.sans500, fontSize: 11.5, color: color.textDim50 },
  tipCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(138,123,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 24,
    padding: 16,
  },
  tipTitle: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  tipBody: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 19, color: color.textDim70, marginTop: 3 },
});
