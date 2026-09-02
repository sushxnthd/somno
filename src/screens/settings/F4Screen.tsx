import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, SleepWindowDial, Toggle, AmbientBlob } from '../../components';
import { Icon } from '../../components/Icons';
import { color, font, displayNumeral } from '../../theme/tokens';
import { useSomnoStore, useIs24h, FIXED_SNOOZE_MIN } from '../../store/useSomnoStore';
import { dayLabelOf, fmt } from '../../utils/format';
import { SettingsHeader } from './_shared';
import type { Alarm } from '../../store/types';
import { canScheduleExactAlarms, canUseFullScreenIntent, openFullScreenIntentSettings } from '../../lib/alarmSound';

function splitTime(min: number, is24h: boolean) {
  // On a 24-hour clock there is no meridiem to split off, so the second half is simply empty.
  const [time, ap] = fmt(min, is24h).split(' ');
  return { time, ap: (ap ?? '').toUpperCase() };
}

export function F4Screen() {
  const is24h = useIs24h();
  const [exactAllowed, setExactAllowed] = useState(true);
  const [fullScreenAllowed, setFullScreenAllowed] = useState(true);
  // Re-checked on entry rather than cached at launch: both are revoked in system settings, which
  // means the app was in the background the moment they changed.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    setExactAllowed(canScheduleExactAlarms());
    setFullScreenAllowed(canUseFullScreenIntent());
  }, []);

  const go = useSomnoStore((s) => s.go);
  const alarms = useSomnoStore((s) => s.alarms);
  const openAlarm = useSomnoStore((s) => s.openAlarm);
  const newAlarm = useSomnoStore((s) => s.newAlarm);
  const toggleAlarmOn = useSomnoStore((s) => s.toggleAlarmOn);
  const bedMin = useSomnoStore((s) => s.bedMin);
  const wakeMin = useSomnoStore((s) => s.wakeMin);
  const setBedMin = useSomnoStore((s) => s.setBedMin);
  const setWakeMin = useSomnoStore((s) => s.setWakeMin);
  const maxSnoozes = useSomnoStore((s) => s.maxSnoozes);
  const setMaxSnoozes = useSomnoStore((s) => s.setMaxSnoozes);
  const scanOptimize = useSomnoStore((s) => s.scanOptimize);
  const toggleScanOptimize = useSomnoStore((s) => s.toggleScanOptimize);
  const startAlarmDemo = useSomnoStore((s) => s.startAlarmDemo);

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SettingsHeader
          title="Alarms"
          onBack={() => go('F0')}
          right={
            <Pressable onPress={newAlarm} hitSlop={10} accessibilityRole="button" accessibilityLabel="Add alarm">
              <Icon name="plus" size={21} color="#A99BFF" strokeWidth={1.7} />
            </Pressable>
          }
        />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* An alarm app that has quietly lost permission to be exact should say so here, where
              the alarms are, rather than let someone find out by waking up late. */}
          {!exactAllowed && (
            <Pressable
              onPress={() => Linking.openSettings().catch(() => {})}
              style={styles.warnCard}
              accessibilityRole="button"
            >
              <Icon name="bell" size={16} color="#FFD9A0" />
              <Text style={styles.warnText}>
                Exact alarms are switched off for Somno, so wake-ups can drift by a few minutes. Tap to allow them.
              </Text>
            </Pressable>
          )}
          {/* The other way an alarm goes quiet without saying so. On Android 14 and later this
              permission can be taken away, and when it is, the alarm still posts — as a banner,
              behind the lock screen, instead of as the screen that wakes you. */}
          {!fullScreenAllowed && (
            <Pressable onPress={openFullScreenIntentSettings} style={styles.warnCard} accessibilityRole="button">
              <Icon name="bell" size={16} color="#FFD9A0" />
              <Text style={styles.warnText}>
                Somno cannot show the alarm over your lock screen, so it will arrive as a notification
                you could sleep through. Tap to allow full-screen alarms.
              </Text>
            </Pressable>
          )}
          {alarms.map((a: Alarm) => {
            const { time, ap } = splitTime(a.min, is24h);
            const sub = (a.label ? a.label + ' · ' : '') + dayLabelOf(a.days) + ' · Smart Wake ' + (a.smart ? 'on' : 'off');
            /*
             * Two controls, side by side, not one inside the other.
             *
             * The switch used to sit *inside* the card's Pressable, and the two do different things
             * — the switch turns the alarm off, the card opens the editor. On any platform where a
             * tap reaches both, flicking an alarm off also pushed the edit screen over the top of
             * it, so the user's next tap landed somewhere they had not asked to be. Making them
             * siblings means each target does exactly its own job.
             */
            return (
              <View
                key={a.id}
                style={[styles.alarmCard, { opacity: a.on ? 1 : 0.62, borderColor: a.on ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)' }]}
              >
                <Pressable
                  onPress={() => openAlarm(a.id)}
                  style={styles.alarmCardBody}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit alarm ${time} ${ap}`}
                >
                  <View style={styles.timeRow}>
                    <Text style={styles.time}>{time}</Text>
                    <Text style={styles.ap}>{ap}</Text>
                  </View>
                  <Text style={styles.sub}>{sub}</Text>
                </Pressable>
                <Toggle label={`Alarm ${time} ${ap}`} value={a.on} onToggle={() => toggleAlarmOn(a.id)} />
              </View>
            );
          })}

          {alarms.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No alarms yet</Text>
              <Text style={styles.emptyBody}>Your sleep window below still guides wind-down reminders. Add an alarm to use Smart Wake.</Text>
              <Pressable onPress={newAlarm} style={styles.emptyBtn} accessibilityRole="button">
                <Text style={styles.emptyBtnText}>Add an alarm</Text>
              </Pressable>
            </View>
          )}

          <GlassCard variant="strong" radiusSize={28} pad={20} style={{ overflow: 'hidden' }}>
            {/* source: 220x220 at left -60 / bottom -80, from 150deg, blur(40px)
                saturate(165%), opacity .4, swirl 24s */}
            <AmbientBlob
              size={220}
              style={{ left: -60, bottom: -80, top: undefined }}
              fromDeg={150}
              blurPx={40}
              saturate={1.65}
              opacity={0.4}
              durationMs={24000}
            />
            <View style={{ alignItems: 'center', gap: 14 }}>
              <View style={styles.rowIconFull}>
                <Icon name="bed" size={17} color={color.textDim70} />
                <Text style={styles.cardTitle}>Your usual night</Text>
                <Text style={styles.dragHint}>drag either handle</Text>
              </View>
              <SleepWindowDial bedMin={bedMin} wakeMin={wakeMin} onChangeBed={setBedMin} onChangeWake={setWakeMin} is24h={is24h} size={224} />
              <Text style={styles.dragSub}>Drag either handle to reshape the night</Text>
              <View style={styles.wheelsRow}>
                <View style={styles.timeCard}>
                  <Icon name="moon" size={16} color="#C9BCFF" />
                  <View>
                    <Text style={styles.timeCardLabel}>BEDTIME</Text>
                    <Text style={styles.timeCardValue}>{fmt(bedMin, is24h)}</Text>
                  </View>
                </View>
                <View style={styles.timeCard}>
                  <Icon name="sun" size={16} color="#FFC98F" />
                  <View>
                    <Text style={styles.timeCardLabel}>WAKE</Text>
                    <Text style={styles.timeCardValue}>{fmt(wakeMin, is24h)}</Text>
                  </View>
                </View>
              </View>
            </View>
          </GlassCard>

          <Text style={styles.section}>SMART WAKE</Text>
          <View style={styles.group}>
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={styles.rowLabel}>Maximum snoozes</Text>
              <View style={styles.stepperRow}>
                <Pressable style={styles.stepBtn} onPress={() => setMaxSnoozes(maxSnoozes - 1)} accessibilityRole="button">
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{maxSnoozes}</Text>
                <Pressable style={styles.stepBtn} onPress={() => setMaxSnoozes(maxSnoozes + 1)} accessibilityRole="button">
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Pressable onPress={toggleScanOptimize} style={[styles.row, styles.rowBorder]} accessibilityRole="switch" accessibilityLabel="Check-in sets snooze length" accessibilityState={{ checked: scanOptimize }}>
              <View style={{ flex: 1 }}>
                {/* Named for what decides it. The check-in's SDI is fused from the face scan, the
                    tap test, the rating and accumulated debt — calling it "face scan sets snooze
                    length" credited one of four signals with the whole decision, and a user who
                    skipped the scan reasonably concluded the setting no longer applied to them. */}
                <Text style={styles.rowLabel}>Check-in sets snooze length</Text>
                <Text style={styles.rowSub}>{`Your check-in score picks 0, 7 or 11 minutes. Off means every snooze is ${FIXED_SNOOZE_MIN} minutes.`}</Text>
              </View>
              <Toggle label="Check-in sets snooze length" value={scanOptimize} onToggle={toggleScanOptimize} interactive={false} />
            </Pressable>
            {/* A statement, not a switch. This row used to carry a Toggle hard-wired to `true`
                with an empty handler — it could be tapped, it looked on, and it controlled
                nothing. Escalation is not optional: the alarm starts quiet and reaches full
                volume inside a minute precisely so Smart Wake can never leave someone less likely
                to wake than a plain alarm would have. Saying so is honest; a dead switch is not. */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Volume always escalates</Text>
                <Text style={styles.rowSub}>
                  Starts quiet and reaches full volume within a minute, with vibration after fifteen
                  seconds. Always on, so a Smart Wake alarm can never be easier to sleep through
                  than an ordinary one.
                </Text>
              </View>
            </View>
          </View>

          <Pressable onPress={startAlarmDemo} style={styles.previewBtn} accessibilityRole="button">
            <Text style={styles.previewBtnText}>Preview the alarm check-in</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  warnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,200,140,0.35)',
    backgroundColor: 'rgba(255,190,120,0.09)',
  },
  warnText: { flex: 1, fontFamily: font.sans600, fontSize: 12, lineHeight: 17, color: '#FFD9A0' },
  safe: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, gap: 10 },
  alarmCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Fills the card so the whole area left of the switch opens the editor.
  alarmCardBody: { flex: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  time: { fontFamily: font.sans600, ...displayNumeral(36), color: color.text }, // 36px/1
  ap: { fontFamily: font.sans700, fontSize: 13, color: color.textDim50 },
  sub: { fontFamily: font.sans500, fontSize: 11.5, color: color.textDim45, marginTop: 6 },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: { fontFamily: font.serif, fontSize: 21, color: color.text },
  emptyBody: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim50, textAlign: 'center', maxWidth: 230 },
  emptyBtn: { marginTop: 4, height: 42, paddingHorizontal: 20, borderRadius: 21, backgroundColor: '#ECEAF6', alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { fontFamily: font.sans700, fontSize: 13.5, color: color.ink },
  rowIconFull: { flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'stretch' },
  cardTitle: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  dragHint: { marginLeft: 'auto', fontFamily: font.sans500, fontSize: 11.5, color: color.textDim45 },
  dragSub: { fontFamily: font.sans500, fontSize: 12, color: color.textDim50 },
  wheelsRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  timeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    padding: 12,
  },
  timeCardLabel: { fontFamily: font.sans700, fontSize: 10.5, letterSpacing: 1, color: color.textDim45 },
  timeCardValue: { fontFamily: font.sans700, fontSize: 14, color: color.text },
  section: { fontFamily: font.sans700, fontSize: 10.5, letterSpacing: 1.6, color: color.textDim40, paddingLeft: 6, marginTop: 6 },
  group: { backgroundColor: color.glassFillFaint, borderWidth: 1, borderColor: color.glassBorder12, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  rowLabel: { fontFamily: font.sans500, fontSize: 14, color: color.text },
  rowSub: { fontFamily: font.sans500, fontSize: 11.5, lineHeight: 15, color: color.textDim45, marginTop: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: 'auto' },
  stepBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: font.sans700, fontSize: 15, color: color.text },
  stepValue: { fontFamily: font.sans700, fontSize: 15, color: color.text, minWidth: 14, textAlign: 'center' },
  previewBtn: { height: 50, borderRadius: 25, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  previewBtnText: { fontFamily: font.sans700, fontSize: 14, color: color.text },
});
