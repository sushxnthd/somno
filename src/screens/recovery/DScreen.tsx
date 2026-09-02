import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ScreenContainer, GlassCard, LineChart, AmbientBlob } from '../../components';
import { color, font, displayNumeral } from '../../theme/tokens';
import { useSomnoStore, useTodayDebt, useTonightRecommendation, useRecoveryCurve, useIsSampleData, useIs24h, useDebtLedger } from '../../store/useSomnoStore';
import { scheduleTonightReminder } from '../../lib/notifications';
import { haptics } from '../../theme/haptics';
import { lessons } from '../../data/content';
import type { ChartPoint } from '../../utils/chart';
import { fmt, napRange } from '../../utils/format';

/** "Debt by stage" scattered-column chart — ported directly from the prototype's D-screen SVG
 * (4 rounded rects sharing a baseline, heights proportional to each stage's hours, plus a small
 * neutral 4th "Other" bar). Deliberately NOT the same visual as Home's horizontal DebtBar rows —
 * the source uses two different chart styles for the same underlying data in these two places. */
function StageDebtChart({ wake, nrem, rem }: { wake: number; nrem: number; rem: number }) {
  const maxH = 46;
  const baseline = 56;
  const maxVal = Math.max(wake, nrem, rem, 0.1);
  const h = (v: number) => Math.max(6, (v / maxVal) * maxH);
  const bars = [
    { x: 18, h: h(wake), grad: 'gw' },
    { x: 94, h: h(nrem), grad: 'gn' },
    { x: 170, h: h(rem), grad: 'gr' },
  ];
  return (
    <Svg width="100%" height={64} viewBox="0 0 300 64" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="gw" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#6B5BD6" />
          <Stop offset="1" stopColor="#C4B4FF" />
        </LinearGradient>
        <LinearGradient id="gn" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#C98A45" />
          <Stop offset="1" stopColor="#FFD9A8" />
        </LinearGradient>
        <LinearGradient id="gr" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#C2564A" />
          <Stop offset="1" stopColor="#FFB3A3" />
        </LinearGradient>
      </Defs>
      {bars.map((b) => (
        <Rect key={b.x} x={b.x} y={baseline - b.h} width={52} height={b.h} rx={5} fill={`url(#${b.grad})`} />
      ))}
      <Rect x={246} y={49} width={52} height={7} rx={5} fill="rgba(255,255,255,0.14)" />
    </Svg>
  );
}

export function DScreen() {
  const is24h = useIs24h();
  const go = useSomnoStore((s) => s.go);
  // Whether a reminder is scheduled *and still ahead*. The flag behind this used to be a plain
  // boolean that neither expired across days nor survived a restart.
  const reminderAt = useSomnoStore((s) => s.tonightReminderAt);
  const reminderSet = reminderAt != null && reminderAt > Date.now();
  const markReminderSet = useSomnoStore((s) => s.markTonightReminderSet);
  const openSheet = useSomnoStore((s) => s.openSheet);
  const [adding, setAdding] = useState(false);

  /**
   * Sets a reminder for tonight's recommended bedtime.
   *
   * This used to write the bedtime — and the nap — into the user's calendar. A calendar is for
   * appointments with other people: things that clash, that get shared, that you are late for.
   * "Wind down at 22:45" is none of those, and filing it there meant a wellness app holding
   * calendar read and write permission to leave a recurring trace of somebody's sleep in a place
   * their colleagues might see. A reminder does the same job, half an hour ahead, and is gone.
   */
  const handleRemindMe = async () => {
    if (adding || reminderSet) return;
    setAdding(true);
    const r = await scheduleTonightReminder(recommendation.bedtimeMin, recommendation.nap?.startMin ?? null);
    setAdding(false);

    switch (r.status) {
      case 'ok':
        haptics.success();
        markReminderSet(r.at.getTime());
        break;
      case 'denied':
        openSheet(
          'Notifications are off',
          'Somno needs permission to send the reminder. You can turn notifications on in system settings and try again.'
        );
        break;
      default:
        openSheet('Could not set the reminder', 'This device would not accept a scheduled notification.');
    }
  };
  const openLesson = useSomnoStore((s) => s.openLesson);
  const bedMin = useSomnoStore((s) => s.bedMin);
  const debt = useTodayDebt();
  const sample = useIsSampleData();
  const ledger = useDebtLedger();

  const nightWord = (n: number) => `${n} ${n === 1 ? 'night' : 'nights'}`;

  /** What the number above was estimated against. */
  const ledgerNote = (() => {
    const need = `${ledger.needHours} h`;
    const source = ledger.needIsPersonal
      ? 'your own nights, which run longer than the average for your age'
      : 'the published recommendation for your age';
    const basis = `Estimated across ${nightWord(ledger.nights)} against a ${need} target, taken from ${source}.`;
    if (ledger.atCeiling) return `${basis} The figure is capped — past this point the arithmetic stops meaning anything.`;
    if (ledger.nightsSinceLog > 2) return `${basis} Nothing has been logged for ${nightWord(ledger.nightsSinceLog)}, so this has been fading rather than tracking.`;
    return basis;
  })();

  /**
   * One bad night and a fortnight of short ones need different things said about them, and the
   * person carrying the second is the one least able to tell — restricted sleepers in the
   * published trials rated their own sleepiness as near-stable while their lapse rates climbed.
   */
  const patternNote = (() => {
    if (ledger.hours < 0.5) return 'Nothing outstanding. Your logged nights are meeting your target.';
    const clear = ledger.nightsToClear;
    const tail = clear
      ? ` At your usual nights it takes about ${nightWord(clear)} to clear.`
      : ' Clearing it will take longer than this screen can usefully predict.';
    if (ledger.pattern === 'chronic')
      return `This has built up across a run of short nights, not one of them. That kind of debt is the sort people stop noticing while it is still costing them.${tail}`;
    if (ledger.pattern === 'acute')
      return `Most of this is one short night. That recovers faster than a standing pattern does.${tail}`;
    if (ledger.pattern === 'mixed')
      return `A few short nights among better ones.${tail}`;
    return `Your recent nights are meeting your target, so this is what is left of earlier ones.${tail}`;
  })();
  const recommendation = useTonightRecommendation();
  const recoveryCurve = useRecoveryCurve();
  // Says when, not just that: a reminder with no time attached is the kind of claim a user has to
  // take on trust, and this one used to persist across days for a notification that had long fired.
  const calendarLabel = adding
    ? 'Setting…'
    : reminderSet
      ? `Reminder set for ${fmt((new Date(reminderAt).getHours() * 60) + new Date(reminderAt).getMinutes(), is24h)} ✓`
      : 'Remind me tonight';

  const bedtimeDeltaMin = (((bedMin - recommendation.bedtimeMin) % 1440) + 1440) % 1440;
  const bedtimeSub = bedtimeDeltaMin === 0 ? 'Same as usual' : `${Math.min(bedtimeDeltaMin, 1440 - bedtimeDeltaMin)} min earlier than usual`;
  const debtTrendPoints: ChartPoint[] = recoveryCurve.map((v, i) => ({ v, l: `Night ${i + 1}` }));

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* source: 250x250 at right -70/top 40, dusk ring from 40deg, blur(58px) saturate(150%), .24, floaty 22s */}
        <AmbientBlob size={250} style={{ right: -70, top: 40, left: undefined }} ring="dusk" fromDeg={40} blurPx={58} saturate={1.5} opacity={0.24} durationMs={22000} motion="floaty" />
        <View style={styles.header}>
          <Text style={styles.headline}>Your recovery</Text>
          <Text style={styles.subtext}>Where the debt sits, and what tonight can do about it.</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          <GlassCard variant="strong" radiusSize={24} pad={16}>
            <View style={{ gap: 9 }}>
              <View style={styles.rowBaseline}>
                <Text style={styles.cardTitle}>Debt by stage</Text>
                <Text style={styles.totalValue}>{sample.debt ? '—' : `${debt.compositeDebtHours} h`}</Text>
              </View>
              {/* Before the first night is logged there is nothing to compute a debt from. The
                  figure above is a dash, and this says why — the app used to print an invented
                  4.2 hours here and label it an example, which a week of real use reasonably read
                  as the screen not showing the user's data. It wasn't. */}
              {sample.debt ? (
                <Text style={styles.sampleNote}>
                  Log a night and your debt is estimated here. Until then there is nothing to
                  estimate it from.
                </Text>
              ) : (
                /* What the figure was measured against, in the words of the model that produced
                   it. A debt in hours means nothing without the target it is a shortfall from,
                   and that target is no longer a flat eight for everybody. */
                <Text style={styles.sampleNote}>{ledgerNote}</Text>
              )}
              <StageDebtChart wake={debt.wakeDebtHours} nrem={debt.nremDebtHours} rem={debt.remDebtHours} />
              <View style={styles.legendRow}>
                <Text style={styles.legendText}>Wake {debt.wakeDebtHours}h</Text>
                <Text style={styles.legendText}>NREM {debt.nremDebtHours}h</Text>
                <Text style={styles.legendText}>REM {debt.remDebtHours}h</Text>
                <Text style={styles.legendText}>Other</Text>
              </View>
              {/* The stage figures are the most measurement-like thing on this screen and the
                  least measured — nothing here watched you sleep. stages.ts derives the split
                  from where in the night the shortfall fell, against a published population
                  architecture. The card has to say that in the user's words, not only in ours. */}
              <Text style={styles.helper}>
                The stage split is modelled from when in the night your sleep was lost, against a
                typical adult night — not measured on you. Recovery isn&apos;t 1-for-1 either:
                expect gradual improvement over several nights, not overnight.
              </Text>
            </View>
          </GlassCard>

          <View style={styles.tonightCard}>
            <Text style={styles.tonightLabel}>TONIGHT</Text>
            <View style={styles.rowBaselineBetween}>
              <View>
                <Text style={styles.bedtimeValue}>{fmt(recommendation.bedtimeMin, is24h)}</Text>
                <Text style={styles.bedtimeSub}>{bedtimeSub}</Text>
              </View>
              {recommendation.nap && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.napLabel}>Nap window</Text>
                  <Text style={styles.napValue}>
                    {napRange(recommendation.nap.startMin, recommendation.nap.endMin, is24h)}
                  </Text>
                </View>
              )}
            </View>
            <Pressable onPress={handleRemindMe} disabled={adding || reminderSet} style={styles.calBtn} accessibilityRole="button">
              <Text style={styles.calBtnText}>{calendarLabel}</Text>
            </Pressable>
          </View>

          <GlassCard variant="faint" radiusSize={24} pad={14}>
            <View style={{ gap: 8 }}>
              <Text style={styles.cardTitle}>Debt over the last 10 nights</Text>
              {/*
                No debt, no curve.

                The projection used to be drawn from a substituted three hours whenever the real
                debt was zero, so a user who had logged nothing — or who was genuinely caught up —
                was shown a convincing ten-night recovery line for a deficit they did not have. An
                empty state that says so is the honest version of the same card.
              */}
              {debtTrendPoints.length === 0 ? (
                <Text style={styles.emptyNote}>
                  Nothing to recover from right now. Log a night that ran short and the projection appears here.
                </Text>
              ) : (
                <>
                  {/* The dashed rule is "today": everything left of it happened, everything right of
                      it is the recovery model's projection. */}
                  <LineChart
                    points={debtTrendPoints}
                    height={48}
                    strokeColors={['#C4B4FF', '#C4B4FF']}
                    markerIndex={Math.max(0, Math.min(debtTrendPoints.length - 1, 6))}
                  />
                  {/* This line used to read "Your recovery has plateaued, which is normal after
                      several nights of restriction" — printed regardless of whether anything had
                      plateaued, or whether there had been any restriction, or any nights at all. It
                      now says what the ledger found. */}
                  <View style={styles.plateauRow}>
                    <View style={styles.plateauDot} />
                    <Text style={styles.plateauText}>{patternNote}</Text>
                  </View>
                </>
              )}
            </View>
          </GlassCard>

          <View style={{ gap: 9 }}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Short lessons</Text>
              <Pressable onPress={() => go('DL')} accessibilityRole="button">
                <Text style={styles.seeAll}>See all</Text>
              </Pressable>
            </View>
            <View style={styles.lessonsRow}>
              {lessons.slice(0, 2).map((l, i) => (
                <Pressable key={l.t} onPress={() => openLesson(i)} style={styles.lessonCard} accessibilityRole="button">
                  <View style={[styles.lessonStripe, { backgroundColor: i === 0 ? 'rgba(138,123,255,0.5)' : 'rgba(255,184,119,0.5)' }]} />
                  <View style={{ padding: 12 }}>
                    <Text style={styles.lessonTitle}>{l.t}</Text>
                    <Text style={styles.lessonMeta}>60-second read</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ height: 90 }} />
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sampleNote: { fontFamily: font.sans600, fontSize: 11, lineHeight: 15, color: color.textDim45 },
  safe: { flex: 1 },
  header: { paddingHorizontal: 22, paddingTop: 14 },
  headline: { fontFamily: font.serif, fontSize: 27, lineHeight: 30.24, color: color.text, marginBottom: 2 }, // 27px/1.12
  subtext: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim50 },
  scrollBody: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  rowBaseline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowBaselineBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: font.sans700, fontSize: 13, color: color.text },
  totalValue: { fontFamily: font.serif, fontSize: 20, color: color.text },
  helper: { fontFamily: font.sans400, fontSize: 11.5, lineHeight: 17, color: color.textDim45 },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between' },
  legendText: { fontFamily: font.sans500, fontSize: 10.5, color: color.textDim45 },
  tonightCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(120,100,230,0.20)',
    padding: 18,
    gap: 10,
  },
  tonightLabel: { fontFamily: font.sans600, fontSize: 10.5, letterSpacing: 1.6, color: 'rgba(236,234,246,0.6)' },
  bedtimeValue: { fontFamily: font.sans600, ...displayNumeral(40), color: color.text }, // 40px/1
  bedtimeSub: { marginTop: 5, fontFamily: font.sans500, fontSize: 11.5, color: 'rgba(236,234,246,0.6)' },
  napLabel: { fontFamily: font.sans500, fontSize: 11, color: 'rgba(236,234,246,0.6)' },
  napValue: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  calBtn: {
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calBtnText: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  plateauRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  plateauDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFB877', marginTop: 5 },
  emptyNote: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim55 },
  plateauText: { flex: 1, fontFamily: font.sans400, fontSize: 11.5, lineHeight: 17, color: color.textDim50 },
  seeAll: { fontFamily: font.sans500, fontSize: 12, color: color.textDim45 },
  lessonsRow: { flexDirection: 'row', gap: 9 },
  lessonCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    overflow: 'hidden',
  },
  lessonStripe: { height: 30 },
  lessonTitle: { fontFamily: font.sans600, fontSize: 12.5, lineHeight: 16, color: color.text },
  lessonMeta: { marginTop: 2, fontFamily: font.sans500, fontSize: 10.5, color: color.textDim40 },
});
