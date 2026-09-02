import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, SDIGauge, MiniDonut, DebtBar, LineChart , CssGradient } from '../../components';
import { Icon } from '../../components/Icons';
import { color, font, gradient } from '../../theme/tokens';
import {
  useSomnoStore,
  useTodayDebt,
  useIsSampleData,
  useHomeStats,
  useStreak,
  useInsight,
  useLastNightHypnogram,
  useDayAhead,
  useIs24h,
} from '../../store/useSomnoStore';
import type { ChartPoint } from '../../utils/chart';
import { fmtHM } from '../../utils/format';

/** Stage → chart band. Deep sits at the bottom, awake at the top, as in every hypnogram. */
const STAGE_BAND: Record<'Wake' | 'NREM' | 'REM', { v: number; name: string; color: string }> = {
  Wake: { v: 4, name: 'Awake', color: '#F2EFFF' },
  REM: { v: 3, name: 'Dream', color: '#E07BFF' },
  NREM: { v: 1.6, name: 'Deep', color: '#7FE9DA' },
};

const fmtHours = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;

/** ↗ / ↘ / → for a tile's direction of travel. */
const arrowFor = (t?: 'up' | 'down' | 'flat') => (t === 'up' ? '↗' : t === 'down' ? '↘' : '→');

export function HomeScreen() {
  const is24h = useIs24h();
  const checkInCount = useSomnoStore((s) => s.checkIns.length);
  const go = useSomnoStore((s) => s.go);
  // Seeds the entry from the user's own schedule rather than the mockup's 23:52 / 06:41.
  const startSleepLog = useSomnoStore((s) => s.startSleepLog);
  const sdi = useSomnoStore((s) => s.sdi);
  const delta = useSomnoStore((s) => s.delta);
  const openSheet = useSomnoStore((s) => s.openSheet);
  const startDailyCheckin = useSomnoStore((s) => s.startDailyCheckin);
  const displayName = useSomnoStore((s) => s.displayName);
  const stats = useHomeStats();
  const streak = useStreak();
  const insight = useInsight();
  const night = useLastNightHypnogram();
  const dayAhead = useDayAhead();

  // Greeting follows the clock, and only uses a name when the account actually supplied one —
  // "Good morning, " with an empty space where a name should be is worse than no name at all.
  const now = new Date();
  const hour = now.getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const greeting = displayName ? `Good ${partOfDay}, ${displayName}` : `Good ${partOfDay}`;
  const todayLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  // The modelled night, turned into a chart and per-stage totals.
  const hypno = night
    ? {
        durationMin: night.segments.reduce((a, sgm) => a + sgm.durationMin, 0),
        segments: night.segments,
        startMin: night.startMin,
        endMin: night.endMin,
      }
    : null;
  const dayPoints: ChartPoint[] = dayAhead.curve.map((p) => ({ v: p.level, l: fmtHM(p.min, is24h) }));
  // Where "now" sits on the curve, so the dashed rule separates the hours already lived from the
  // ones being predicted.
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowIndex = (() => {
    if (!dayAhead.curve.length) return undefined;
    let closest = 0;
    dayAhead.curve.forEach((p, i) => {
      const d = Math.abs(((p.min - nowMin + 720 + 1440) % 1440) - 720);
      const best = Math.abs(((dayAhead.curve[closest].min - nowMin + 720 + 1440) % 1440) - 720);
      if (d < best) closest = i;
    });
    return closest;
  })();

  const hypnoPoints: ChartPoint[] = (hypno?.segments ?? []).map((sgm) => {
    const band = STAGE_BAND[sgm.stage];
    return { v: band.v, l: fmtHM(((hypno!.startMin + sgm.atMin) % 1440 + 1440) % 1440, is24h), s: band.name };
  });
  const hypnoAxis = hypno
    ? [fmtHM(hypno.startMin, is24h), ...[0.25, 0.5, 0.75].map((f) => fmtHM(Math.round(hypno.startMin + hypno.durationMin * f) % 1440, is24h)), fmtHM(hypno.endMin, is24h)]
    : [];
  const stageTotals = hypno
    ? (['Wake', 'REM', 'NREM'] as const).map((stage) => ({
        label: STAGE_BAND[stage].name,
        color: STAGE_BAND[stage].color,
        value: fmtHours(hypno.segments.filter((sgm) => sgm.stage === stage).reduce((a, sgm) => a + sgm.durationMin, 0)),
      }))
    : [];

  const debt = useTodayDebt();
  const sample = useIsSampleData();

  const debtBars = [
    { label: 'Wake', pct: Math.min(100, Math.round((debt.wakeDebtHours / Math.max(0.1, debt.compositeDebtHours)) * 100)), hours: `${debt.wakeDebtHours}h`, grad: gradient.wakeDebt },
    { label: 'NREM', pct: Math.min(100, Math.round((debt.nremDebtHours / Math.max(0.1, debt.compositeDebtHours)) * 100)), hours: `${debt.nremDebtHours}h`, grad: gradient.nremDebt },
    { label: 'REM', pct: Math.min(100, Math.round((debt.remDebtHours / Math.max(0.1, debt.compositeDebtHours)) * 100)), hours: `${debt.remDebtHours}h`, grad: gradient.remDebt },
  ];

  // Before the first check-in there is no score, so there is no word for it and nothing to compare
  // it against. Rendering 0/"Depleted"/"+0" would be as invented as the 72 this replaced.
  const hasReading = checkInCount > 0;
  // "Not measured yet" overstated what a reading is. The SDI is fused from four signals, only two
  // of which are measurements; the index itself is an estimate. The empty state says so.
  const sdiWord = !hasReading ? 'No reading yet' : sdi >= 70 ? 'Sharp' : sdi >= 50 ? 'Running low' : 'Depleted';
  // `delta` is null until there is a week to compare against — it used to be measured against a
  // hardcoded 64, so a first check-in reported an exact difference from a week that never happened.
  const deltaLabel = !hasReading
    ? 'Check in and your first reading appears here'
    : checkInCount < 2 || delta == null
      ? 'Your first reading. A comparison needs a second one.'
      : `${delta >= 0 ? '+' : ''}${delta} vs your weekly average`;

  const explainSdi = () =>
    openSheet(
      'What the SDI is',
      'A 0–100 index of how alert you are right now, compared with your own baseline, not with anyone else. Higher means sharper. It is built from your reaction time, your face scan, your own rating and your accumulated sleep debt, and it always shows how many of those four it had to work with.\n\nIt is an estimate, not a clinical measurement. Nothing here is validated against a sleep lab, and no score from it should be read as a diagnosis or as clearance to drive.'
    );

  const explainLight = () =>
    openSheet(insight.title, insight.body);

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.dateText}>{todayLabel}</Text>
          </View>
          <View style={styles.topRight}>
            {streak > 0 && (
              <View style={styles.streakPill} accessibilityLabel={`${streak} day check-in streak`}>
                <Icon name="flame" size={15} color="#FFC98F" strokeWidth={1.7} />
                <Text style={styles.streakText}>{streak}</Text>
              </View>
            )}
            <Pressable onPress={() => go('F0')} style={styles.gearBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Settings">
              <Icon name="settings" size={19} color={color.textDim70} strokeWidth={1.7} />
            </Pressable>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          <View style={styles.statsRow}>
            {/* Duration and quality need a logged night; until there is one the tiles show a dash
                and lead to the screen that fixes that, rather than a number nobody earned. */}
            <MiniDonut
              label="Duration"
              value={stats.duration?.pct ?? 0}
              color="#FFB877"
              arrow={arrowFor(stats.duration?.trend)}
              arrowColor="rgba(255,184,119,.9)"
              onPress={() => go(stats.duration ? 'E' : 'CLOG')}
            />
            <MiniDonut
              label="Quality"
              value={stats.quality?.pct ?? 0}
              color="#C9A6FF"
              arrow={arrowFor(stats.quality?.trend)}
              arrowColor="rgba(201,166,255,.9)"
              onPress={() => go(stats.quality ? 'E' : 'CLOG')}
            />
            <MiniDonut
              label="Habits"
              value={stats.habits.pct}
              color="#8FE3D9"
              arrow={arrowFor(stats.habits.trend)}
              arrowColor="rgba(143,227,217,.9)"
              onPress={() => go('DL')}
            />
          </View>

          <SDIGauge value={hasReading ? sdi : null} word={sdiWord} deltaLabel={deltaLabel} onPress={explainSdi} />

          <Pressable onPress={() => go('D')} accessibilityRole="button">
            <GlassCard variant="strong" radiusSize={24} pad={16}>
              <View style={{ gap: 11 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Sleep debt</Text>
                  <Text style={styles.cardMeta}>
                    {sample.debt ? 'Log a night ›' : `${debt.compositeDebtHours}h total ›`}
                  </Text>
                </View>
                <View style={{ gap: 7 }}>
                  {debtBars.map((d) => (
                    <DebtBar key={d.label} label={d.label} pct={d.pct} hours={d.hours} grad={d.grad} />
                  ))}
                </View>
              </View>
            </GlassCard>
          </Pressable>

          <View style={styles.quickRow}>
            <Pressable onPress={startDailyCheckin} style={{ flex: 1 }} accessibilityRole="button">
              {/* `linear-gradient(150deg, ...)` — the design fills its CTAs with a gradient, not a flat tint. */}
              <CssGradient angle={150} colors={['rgba(255,255,255,0.95)', 'rgba(206,198,255,0.82)']} style={styles.quickPrimary}>
                <Text style={styles.quickPrimaryTitle}>Check in now</Text>
                <Text style={styles.quickPrimarySub}>30 sec</Text>
              </CssGradient>
            </Pressable>
            <Pressable onPress={startSleepLog} style={styles.quickSecondary} accessibilityRole="button">
              <Text style={styles.quickSecondaryTitle}>Log sleep</Text>
              <Text style={styles.quickSecondarySub}>Manual</Text>
            </Pressable>
            <Pressable onPress={() => go('D')} style={styles.quickSecondary} accessibilityRole="button">
              <Text style={styles.quickSecondaryTitle}>Recovery</Text>
              <Text style={styles.quickSecondarySub}>Tonight</Text>
            </Pressable>
          </View>

          <Pressable onPress={explainLight} accessibilityRole="button">
            <CssGradient angle={160} colors={gradient.insightCard} style={styles.insightCard}>
              <View style={styles.insightIcon}>
                <Icon name="sun" size={17} color="#2A1B08" strokeWidth={1.7} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightBody} numberOfLines={3}>
                  {insight.body}
                </Text>
              </View>
            </CssGradient>
          </Pressable>

          {/* What the model can say about the hours ahead. This is the only card in the app that
              looks forward, and it is timing advice — when to put the hard thing, when to expect
              the dip — never a claim about health. */}
          <GlassCard variant="faint" radiusSize={24} pad={16}>
            <View style={{ gap: 10 }}>
              <View style={[styles.rowBetween, { paddingHorizontal: 4 }]}>
                <Text style={styles.cardTitle14}>Your day ahead</Text>
                <Text style={styles.tapHint}>Predicted</Text>
              </View>
              <LineChart
                points={dayPoints}
                height={72}
                min={1}
                max={16}
                strokeColors={['#8FD8FF', '#7FE9DA', '#FFB877']}
                markerIndex={nowIndex}
              />
              <View style={styles.rowBetween}>
                <Text style={styles.hypnoAxisLabel}>{dayAhead.curve.length ? fmtHM(dayAhead.curve[0].min, is24h) : ''}</Text>
                <Text style={styles.hypnoAxisLabel}>
                  {dayAhead.curve.length ? fmtHM(dayAhead.curve[dayAhead.curve.length - 1].min, is24h) : ''}
                </Text>
              </View>
              {dayAhead.best && dayAhead.worst && (
                <Text style={styles.dayNote}>
                  {`Sharpest ${fmtHM(dayAhead.best.startMin, is24h)}–${fmtHM(dayAhead.best.endMin, is24h)}` +
                    ` · dip ${fmtHM(dayAhead.worst.startMin, is24h)}–${fmtHM(dayAhead.worst.endMin, is24h)}`}
                </Text>
              )}
              <Text style={styles.hypnoNote}>
                {dayAhead.fromLoggedNight
                  ? 'From the night you logged, your usual rhythm and the time of day.'
                  : 'From your usual rhythm. Log a night and this follows how you actually slept.'}
              </Text>
            </View>
          </GlassCard>

          {hypno ? (
            <GlassCard variant="deep" radiusSize={24} pad={16}>
              <View style={{ gap: 10 }}>
                <View style={[styles.rowBetween, { paddingHorizontal: 4 }]}>
                  <Text style={styles.cardTitle14}>Sleep stages</Text>
                  <Text style={styles.tapHint}>Estimated</Text>
                </View>
                <LineChart
                  points={hypnoPoints}
                  height={108}
                  min={0.5}
                  max={4.5}
                  strokeColors={[gradient.hypnogram[0], gradient.hypnogram[1], gradient.hypnogram[2]]}
                />
                <View style={styles.hypnoAxis}>
                  {hypnoAxis.map((t) => (
                    <Text key={t} style={styles.hypnoAxisLabel}>
                      {t}
                    </Text>
                  ))}
                </View>
                <View style={styles.legendGrid}>
                  {stageTotals.map((st) => (
                    <View key={st.label} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: st.color }]} />
                      <Text style={styles.legendLabel}>{st.label}</Text>
                      <Text style={styles.legendValue}>{st.value}</Text>
                    </View>
                  ))}
                </View>
                {/* The one thing this card must say: no wearable measured these stages. It is the
                    recovery model's estimate from the night you logged and today's score. */}
                <Text style={styles.hypnoNote}>
                  Modelled from the {fmtHours(hypno.durationMin)} you logged and today&apos;s score — not measured.
                </Text>
              </View>
            </GlassCard>
          ) : (
            <Pressable onPress={startSleepLog} accessibilityRole="button">
              <GlassCard variant="faint" radiusSize={22} pad={15}>
                <View>
                  <Text style={styles.cardTitle14}>Sleep stages</Text>
                  <Text style={styles.emptyBody}>Log a night and Somno estimates how it was shaped. ›</Text>
                </View>
              </GlassCard>
            </Pressable>
          )}

          <View style={{ height: 90 }} />
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 14 },
  greeting: { fontFamily: font.serif, fontSize: 26, lineHeight: 31, color: color.text },
  dateText: { marginTop: 3, fontFamily: font.sans500, fontSize: 12, color: color.textDim45 },
  topRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  streakText: { fontFamily: font.sans700, fontSize: 12, color: color.text },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: { paddingHorizontal: 20, paddingTop: 6, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 2, paddingTop: 4, paddingBottom: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  cardTitle14: { fontFamily: font.sans700, fontSize: 14, color: color.text },
  cardMeta: { fontFamily: font.sans500, fontSize: 12, color: color.textDim45 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickPrimary: {
    flex: 1,
    height: 70,
    borderRadius: 20,
    justifyContent: 'center',
    paddingHorizontal: 13,
    gap: 2,
  },
  quickPrimaryTitle: { fontFamily: font.sans700, fontSize: 13, color: '#0C0A18' },
  quickPrimarySub: { fontFamily: font.sans500, fontSize: 10.5, color: 'rgba(12,10,24,0.6)' },
  quickSecondary: {
    flex: 1,
    height: 70,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    paddingHorizontal: 13,
    gap: 2,
  },
  quickSecondaryTitle: { fontFamily: font.sans700, fontSize: 13, color: color.text },
  quickSecondarySub: { fontFamily: font.sans500, fontSize: 10.5, color: color.textDim45 },
  insightCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 15,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  insightIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: '#E9C9A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTitle: { fontFamily: font.sans700, fontSize: 13, color: color.text },
  insightBody: { marginTop: 2, fontFamily: font.sans500, fontSize: 12, lineHeight: 17, color: color.textDim55 },
  tapHint: { fontFamily: font.sans500, fontSize: 11, color: color.textDim40 },
  hypnoNote: { fontFamily: font.sans500, fontSize: 10.5, lineHeight: 15, color: color.textDim35, paddingHorizontal: 4 },
  dayNote: { fontFamily: font.sans600, fontSize: 12, lineHeight: 17, color: '#C9BCFF', paddingHorizontal: 4 },
  emptyBody: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim55, marginTop: 4 },
  hypnoAxis: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  hypnoAxisLabel: { fontFamily: font.sans500, fontSize: 10, color: color.textDim38 },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingTop: 8,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  legendItem: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLabel: { flex: 1, fontFamily: font.sans500, fontSize: 11.5, color: color.textDim50 },
  legendValue: { fontFamily: font.sans700, fontSize: 11.5, color: color.text },
});
