import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { ScreenContainer, GlassCard , CssGradient } from '../../components';
import { color, font, displayNumeral } from '../../theme/tokens';
import { useSomnoStore, useIs24h } from '../../store/useSomnoStore';
import { dur, fmt } from '../../utils/format';
import { localDateKey } from '../../utils/clock';
import type { SomnoState } from '../../store/types';

const QUALITIES: SomnoState['logQuality'][] = ['Restless', 'Okay', 'Solid'];

export function CLogScreen() {
  const is24h = useIs24h();
  const go = useSomnoStore((s) => s.go);
  const logBed = useSomnoStore((s) => s.logBed);
  const logWake = useSomnoStore((s) => s.logWake);
  const bumpLogBed = useSomnoStore((s) => s.bumpLogBed);
  const bumpLogWake = useSomnoStore((s) => s.bumpLogWake);
  const logQuality = useSomnoStore((s) => s.logQuality);
  const setLogQuality = useSomnoStore((s) => s.setLogQuality);
  const logRest = useSomnoStore((s) => s.logRest);
  const setLogRest = useSomnoStore((s) => s.setLogRest);
  const saveLog = useSomnoStore((s) => s.saveLog);
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);

  const logRestWord = logRest >= 75 ? 'Rested' : logRest >= 45 ? 'Fair' : 'Unrested';

  /** "Last night — woke Monday 18 August", from the same date key `saveLog` writes. */
  const nightLabel = (() => {
    const woke = new Date();
    const already = sleepLogs.some((l) => l.date === localDateKey());
    const when = woke.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    return already ? `Last night — woke ${when}. Saving replaces the entry you already made.` : `Last night — woke ${when}`;
  })();

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => go('B')} accessibilityRole="button">
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Log sleep</Text>
          <Pressable onPress={saveLog} accessibilityRole="button">
            <Text style={styles.save}>Save</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/*
            Which night this is.

            The screen recorded a night against today's date and never said so, and "went to bed
            23:52 / woke 06:41" spans two dates — so a user logging at nine in the morning and a
            user logging at eleven at night had no way to tell whether they were describing the same
            thing. The record is the night that ended this morning; now it says that.

            Re-logging the same night replaces it rather than adding a second, which is also worth
            knowing before tapping Save.
          */}
          <Text style={styles.nightLabel}>{nightLabel}</Text>
          <GlassCard variant="strong" radiusSize={26} pad={20}>
            <View style={styles.timesRow}>
              <TimeColumn label="WENT TO BED" value={fmt(logBed, is24h)} onBump={(dir, step) => bumpLogBed(dir, step)} />
              <View style={styles.divider} />
              <TimeColumn label="WOKE UP" value={fmt(logWake, is24h)} onBump={(dir, step) => bumpLogWake(dir, step)} />
            </View>
          </GlassCard>

          <GlassCard variant="faint" radiusSize={22} pad={16}>
            <View style={styles.rowBetween}>
              <Text style={styles.durLabel}>Time asleep</Text>
              <Text style={styles.durValue}>{dur(logBed, logWake)}</Text>
            </View>
          </GlassCard>

          <View style={{ gap: 9 }}>
            <Text style={styles.sectionLabel}>How was it?</Text>
            <View style={styles.qualityRow}>
              {QUALITIES.map((q) => {
                const active = logQuality === q;
                return (
                  <Pressable key={q} onPress={() => setLogQuality(q)} style={[styles.qualityChip, { backgroundColor: active ? 'rgba(236,234,246,0.92)' : 'rgba(255,255,255,0.05)' }]} accessibilityRole="button">
                    <Text style={[styles.qualityText, { color: active ? '#0C0A18' : color.textDim70 }]}>{q}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.restCard}>
            <View style={styles.rowBaseline}>
              <Text style={styles.sectionLabel}>How rested do you feel?</Text>
              <Text style={styles.restValue}>{logRest}% · {logRestWord}</Text>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={100}
              step={1}
              value={logRest}
              onValueChange={setLogRest}
              minimumTrackTintColor={color.violet}
              maximumTrackTintColor="rgba(255,255,255,0.18)"
              thumbTintColor="#ECEAF6"
            />
          </View>

          {/* The design promised a weighting against imported sleep. There is no import in this
              version, so this says what the entry is actually for. */}
          <Text style={styles.footnote}>What you log here drives your sleep debt, tonight&apos;s bedtime and the recovery curve.</Text>

          <Pressable onPress={saveLog} accessibilityRole="button">
            {/* `linear-gradient(150deg, ...)` — the design fills its CTAs with a gradient, not a flat tint. */}
            <CssGradient angle={150} colors={['rgba(255,255,255,0.96)', 'rgba(214,208,255,0.86)']} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save sleep entry</Text>
            </CssGradient>
          </Pressable>
          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

function TimeColumn({ label, value, onBump }: { label: string; value: string; onBump: (dir: 1 | -1, step: number) => void }) {
  const say = (dir: 1 | -1, step: number) =>
    `${label.toLowerCase()} ${dir < 0 ? 'earlier' : 'later'} by ${step} minute${step === 1 ? '' : 's'}`;
  return (
    <View style={styles.timeCol}>
      <Text style={styles.timeLabel}>{label}</Text>
      <Text style={styles.timeValue}>{value}</Text>
      <View style={styles.bumpRow}>
        <Pressable onPress={() => onBump(-1, 15)} accessibilityLabel={say(-1, 15)} style={({ pressed }) => [styles.bumpBtnWide, pressed && styles.bumpBtnPressed]} accessibilityRole="button">
          <Text style={styles.bumpText}>−15</Text>
        </Pressable>
        <Pressable onPress={() => onBump(-1, 1)} accessibilityLabel={say(-1, 1)} style={({ pressed }) => [styles.bumpBtn, pressed && styles.bumpBtnPressed]} accessibilityRole="button">
          <Text style={styles.bumpText}>−1</Text>
        </Pressable>
        <Pressable onPress={() => onBump(1, 1)} accessibilityLabel={say(1, 1)} style={({ pressed }) => [styles.bumpBtn, pressed && styles.bumpBtnPressed]} accessibilityRole="button">
          <Text style={styles.bumpText}>+1</Text>
        </Pressable>
        <Pressable onPress={() => onBump(1, 15)} accessibilityLabel={say(1, 15)} style={({ pressed }) => [styles.bumpBtnWide, pressed && styles.bumpBtnPressed]} accessibilityRole="button">
          <Text style={styles.bumpText}>+15</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20 },
  cancel: { fontFamily: font.sans500, fontSize: 14.5, color: color.textDim50 },
  headerTitle: { fontFamily: font.sans700, fontSize: 15, color: color.text },
  save: { fontFamily: font.sans700, fontSize: 14.5, color: '#A99BFF' },
  body: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, gap: 14 },
  timesRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.12)' },
  timeCol: { flex: 1, alignItems: 'center', gap: 8 },
  timeLabel: { fontFamily: font.sans600, fontSize: 11, letterSpacing: 1.1, color: color.textDim45 },
  timeValue: { fontFamily: font.sans600, ...displayNumeral(28), color: color.text }, // 28px/1
  bumpRow: { flexDirection: 'row', gap: 5 },
  bumpBtn: {
    width: 30,
    height: 32,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bumpBtnWide: {
    width: 34,
    height: 32,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // hover/press: rgba(255,255,255,.14)
  bumpBtnPressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  bumpText: { fontFamily: font.sans600, fontSize: 11.5, color: color.text },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  durLabel: { fontFamily: font.sans500, fontSize: 14, color: color.text },
  durValue: { fontFamily: font.serif, fontSize: 24, lineHeight: 28, color: color.text },
  sectionLabel: { fontFamily: font.sans700, fontSize: 13, color: color.text },
  qualityRow: { flexDirection: 'row', gap: 8 },
  qualityChip: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityText: { fontFamily: font.sans600, fontSize: 13 },
  restCard: {
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 22,
    padding: 16,
  },
  rowBaseline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  restValue: { fontFamily: font.sans700, fontSize: 13, color: '#C9BCFF' },
  nightLabel: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim55, paddingHorizontal: 4 },
  footnote: { fontFamily: font.sans400, fontSize: 12, lineHeight: 18, color: color.textDim40 },
  saveBtn: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontFamily: font.sans700, fontSize: 15, color: '#0C0A18' },
});
