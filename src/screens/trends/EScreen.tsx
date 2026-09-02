import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, LineChart, AmbientBlob } from '../../components';
import { Icon } from '../../components/Icons';
import { color, font } from '../../theme/tokens';
import { useSomnoStore, useSdiHistory, usePvtHistory, useIsSampleData, useDebtHistory, useRegularity, useDriver } from '../../store/useSomnoStore';
import { rangeWord } from '../../data/content';
import { exportAllData } from '../../lib/exportData';
import type { ChartPoint } from '../../utils/chart';

const RANGES: { id: '7' | '30' | '90'; label: string }[] = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
];

export function EScreen() {
  const go = useSomnoStore((s) => s.go);
  const range = useSomnoStore((s) => s.range);
  const setRange = useSomnoStore((s) => s.setRange);
  const baseline = useSomnoStore((s) => s.baseline);
  const avgMs = useSomnoStore((s) => s.avgMs);
  const openSheet = useSomnoStore((s) => s.openSheet);
  const sdiHistory = useSdiHistory(range);
  const rtHistory = usePvtHistory();
  const sample = useIsSampleData();
  const debtHistory = useDebtHistory(range);
  const regularity = useRegularity();
  const driver = useDriver();

  // Axis labels come from the series being drawn, not from a fixed pair of dates. The sample
  // series is labelled by day number, so it gets its own honest labels rather than real dates.
  const fmtDay = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const axisStart = sample.sdi ? 'Day 1' : sdiHistory[0]?.l ?? '';
  const axisEnd = sample.sdi ? `Day ${sdiHistory.length}` : sdiHistory[sdiHistory.length - 1]?.l ?? '';

  const peak = debtHistory.length ? debtHistory.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const debtPoints: ChartPoint[] = debtHistory.map((d) => ({ v: d.v, l: d.l }));
  const debtTrendGlyph =
    debtHistory.length >= 2 && debtHistory[debtHistory.length - 1].v < debtHistory[0].v ? '▾' : '▴';
  const debtSummary = !debtHistory.length
    ? 'Log a night to start tracking debt ›'
    : `Peaked at ${peak!.v.toFixed(1)} h on ${fmtDay(peak!.at)} ›`;

  const values = sdiHistory.map((p) => p.v);
  // An empty history divides by zero, and `Math.round(NaN)` is NaN, which React renders happily as
  // the literal text "Average NaN". A screen with nothing to average says so.
  const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  const delta = values.length >= 2 ? values[values.length - 1] - values[0] : null;
  const rangeSummary = avg == null ? `No check-ins yet · ${rangeWord[range]}` : `Average ${avg} · ${rangeWord[range]}`;
  const rangeDelta = delta == null ? '' : `${delta >= 0 ? '+' : ''}${delta}`;

  const sdiPoints: ChartPoint[] = sdiHistory;
  const rtPoints: ChartPoint[] = rtHistory;

  const curAvgMs = avgMs();
  const rtSummary = `${curAvgMs} ms average · ${Math.abs(curAvgMs - baseline)} ms ${curAvgMs > baseline ? 'above' : 'below'} baseline`;

  const [exporting, setExporting] = useState(false);
  const exportData = async () => {
    if (exporting) return;
    setExporting(true);
    const r = await exportAllData();
    setExporting(false);
    if (r.status === 'empty') {
      openSheet('Nothing to export yet', 'Once you have a check-in or a logged night, this hands you the whole record as CSV and JSON.');
    } else if (r.status === 'unavailable') {
      openSheet('Sharing unavailable', 'This device has nowhere to send the files. On a phone this opens the usual share sheet.');
    } else if (r.status === 'error') {
      openSheet('Could not export', r.message);
    }
    // On success the share sheet is already open; a confirmation on top of it would be noise.
  };

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* source: 260x260 at left -80/top 120, teal ring from 200deg, blur(60px) saturate(150%), .2, floaty 26s */}
        <AmbientBlob size={260} style={{ left: -80, top: 120 }} ring="teal" fromDeg={200} blurPx={60} saturate={1.5} opacity={0.2} durationMs={26000} motion="floaty" />
        <View style={styles.header}>
          <Text style={styles.headline}>Trends</Text>
          <Pressable onPress={() => go('W1')} style={styles.weeklyPill} accessibilityRole="button">
            <Icon name="sparkle" size={15} color="#DCD3FF" strokeWidth={1.7} />
            <Text style={styles.weeklyText}>Weekly review</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          <View style={styles.segmented}>
            {RANGES.map((r) => {
              const active = range === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setRange(r.id)}
                  style={[styles.segment, { backgroundColor: active ? 'rgba(236,234,246,0.92)' : 'transparent' }]}
                 accessibilityRole="button">
                  <Text style={[styles.segmentText, { color: active ? '#0C0A18' : 'rgba(236,234,246,0.6)' }]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <GlassCard variant="strong" radiusSize={24} pad={16}>
            <View style={{ gap: 9 }}>
              <View style={styles.rowBaseline}>
                <View>
                  <Text style={styles.cardTitle}>SDI</Text>
                  <Text style={styles.cardMeta}>{rangeSummary}</Text>
                </View>
                {/* The pill compares the first reading with the latest, so it needs two. Below
                    that it says how many there are rather than showing an empty badge or a
                    comparison against nothing. */}
                {rangeDelta ? (
                  <View style={styles.deltaPill}>
                    <Text style={styles.deltaText}>{rangeDelta}</Text>
                  </View>
                ) : (
                  <Text style={styles.cardMeta}>
                    {sdiPoints.length === 0 ? 'No check-ins yet' : '1 check-in'}
                  </Text>
                )}
              </View>
              {/* An empty chart that says why, rather than a full one drawn from invented numbers.
                  This card used to render a demo series whenever real history was thin, which is
                  how a week of real use could end with the screens showing nobody's data. */}
              {sdiPoints.length >= 1 ? (
                <>
                  <LineChart points={sdiPoints} height={112} min={0} max={100} strokeColors={['#7FE9DA', '#8FD8FF', '#E07BFF']} />
                  <View style={styles.rowBetween}>
                    <Text style={styles.axisLabel}>{axisStart}</Text>
                    <Text style={styles.axisLabel}>{axisEnd}</Text>
                  </View>
                  {/* What is drawn is every reading there is. Saying how many, and what a trend
                      would need, is the honest version of hiding the chart until there are three. */}
                  {sdiPoints.length < 3 && (
                    <Text style={styles.emptyChartText}>
                      {sdiPoints.length === 1
                        ? 'One check-in so far. A third gives this a direction.'
                        : 'Two check-ins so far. A third gives this a direction.'}
                    </Text>
                  )}
                </>
              ) : (
                <View style={styles.emptyChart}>
                  <Text style={styles.emptyChartText}>Check in once and your first reading appears here.</Text>
                </View>
              )}
            </View>
          </GlassCard>

          <GlassCard variant="faint" radiusSize={24} pad={14}>
            <View style={{ gap: 8 }}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.cardTitle}>Reaction time</Text>
                  <Text style={styles.cardMeta}>{rtSummary}</Text>
                </View>
                {sample.pvt ? <Text style={styles.cardMeta}>{rtPoints.length ? `${rtPoints.length} so far` : 'No tap tests yet'}</Text> : <Text style={styles.trendGlyph}>▴</Text>}
              </View>
              {rtPoints.length >= 1 ? (
                <>
                  <LineChart points={rtPoints} height={74} strokeColors={['#8FD8FF', '#7FE9DA']} />
                  <Text style={styles.axisLabel}>Dashed line: your baseline, {baseline} ms</Text>
                </>
              ) : (
                <View style={styles.emptyChart}>
                  <Text style={styles.emptyChartText}>Your first tap test plots here.</Text>
                </View>
              )}
            </View>
          </GlassCard>

          {/* The spec's third series. Only drawn once there are enough logged nights to make a
              line rather than a dot — two points is not a trend. */}
          {debtHistory.length >= 3 && (
            <GlassCard variant="faint" radiusSize={24} pad={14}>
              <View style={{ gap: 8 }}>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.cardTitle}>Sleep debt</Text>
                    <Text style={styles.cardMeta}>{`${debtHistory[debtHistory.length - 1].v.toFixed(1)} h now · ${debtHistory.length} nights logged`}</Text>
                  </View>
                  <Text style={styles.trendGlyph}>{debtTrendGlyph}</Text>
                </View>
                <LineChart points={debtPoints} height={74} strokeColors={['#FFB877', '#FF8E7A']} />
                <Text style={styles.axisLabel}>Hours of accumulated debt, lower is better</Text>
              </View>
            </GlassCard>
          )}

          {/* Sleep regularity — the Sleep Regularity Index, computed from the logged nights. It is
              here because it is the one thing none of the charts above can show: someone can average
              eight hours and still score badly by taking them at a different time every night. */}
          {regularity && (
            <GlassCard variant="faint" radiusSize={24} pad={16}>
              <View style={{ gap: 8 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Sleep regularity</Text>
                  <Text style={styles.regularityValue}>{regularity.sri}</Text>
                </View>
                <View style={styles.regularityTrack}>
                  <View style={[styles.regularityFill, { width: `${regularity.sri}%` }]} />
                </View>
                <Text style={styles.cardMeta}>
                  {regularity.word} · how often you are asleep at the same clock time two days
                  running, across {regularity.nights} logged nights.
                </Text>
              </View>
            </GlassCard>
          )}

          {/* What this person's own mornings actually follow. Absent until there are enough
              night-and-morning pairs, and absent when nothing correlates — see engine/trends.ts. */}
          {driver && (
            <GlassCard variant="faint" radiusSize={24} pad={16}>
              <View style={{ gap: 7 }}>
                <Text style={styles.cardTitle}>What your mornings follow</Text>
                <Text style={styles.driverSentence}>{driver.sentence}</Text>
                <Text style={styles.cardMeta}>
                  Correlation of r={driver.r.toFixed(2)} across {driver.n} nights of your own logs. A
                  pattern in your data, not proof that changing it changes the outcome.
                </Text>
              </View>
            </GlassCard>
          )}

          <Pressable onPress={() => go('D')} style={styles.simpleCard} accessibilityRole="button">
            <View>
              <Text style={styles.cardTitle}>Sleep debt</Text>
              <Text style={styles.cardMeta}>{debtSummary}</Text>
            </View>
            <Text style={styles.trendGlyph}>▾</Text>
          </Pressable>

          <Pressable
            onPress={exportData}
            disabled={exporting}
            style={{ alignItems: 'center', paddingTop: 2 }}
            accessibilityRole="button"
            accessibilityState={{ busy: exporting }}
          >
            <Text style={styles.exportText}>{exporting ? 'Preparing your files…' : 'Export my data'}</Text>
          </Pressable>

          <View style={{ height: 90 }} />
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

/**
 * The marker for an illustrative series. Deliberately plain and legible rather than tucked away —
 * its whole job is to stop a chart being read as the user's own record.
 */

const styles = StyleSheet.create({
  sampleTag: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sampleTagText: { fontFamily: font.sans700, fontSize: 9.5, letterSpacing: 1, color: color.textDim70 },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 22,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headline: { fontFamily: font.serif, fontSize: 27, lineHeight: 32, color: color.text },
  weeklyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  weeklyText: { fontFamily: font.sans700, fontSize: 12, color: color.text },
  scrollBody: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  segmented: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 18 },
  segment: { flex: 1, height: 34, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: font.sans600, fontSize: 12.5 },
  rowBaseline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: font.sans700, fontSize: 13, color: color.text },
  emptyChart: { paddingVertical: 22, alignItems: 'center', justifyContent: 'center' },
  emptyChartText: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim45, textAlign: 'center' },
  regularityValue: { fontFamily: font.sans700, fontSize: 20, color: color.text },
  regularityTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
  regularityFill: { height: 6, borderRadius: 3, backgroundColor: color.lilac },
  driverSentence: { fontFamily: font.sans600, fontSize: 13.5, lineHeight: 20, color: color.text },
  cardMeta: { marginTop: 1, fontFamily: font.sans500, fontSize: 11, color: color.textDim45 },
  deltaPill: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.10)' },
  deltaText: { fontFamily: font.sans600, fontSize: 11.5, color: color.text },
  axisLabel: { fontFamily: font.sans500, fontSize: 10, color: color.textDim40 },
  trendGlyph: { color: color.textDim35, fontSize: 16 },
  simpleCard: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exportText: { fontFamily: font.sans700, fontSize: 13, color: '#A99BFF' },
});
