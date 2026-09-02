import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, ProgressStep, AlarmDial, Toggle } from '../../components';
import { Icon } from '../../components/Icons';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore, useIs24h } from '../../store/useSomnoStore';
import { ensureAlarmNotifications } from '../../lib/notifications';
import { fmtAP } from '../../utils/format';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// A screen reader reading out "T" twice is useless; spell the day.
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function A9Screen() {
  const is24h = useIs24h();
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const alarmMin = useSomnoStore((s) => s.alarmMin);
  const setAlarmMin = useSomnoStore((s) => s.setAlarmMin);
  const alarmEarlier = useSomnoStore((s) => s.alarmEarlier);
  const alarmLater = useSomnoStore((s) => s.alarmLater);
  const days = useSomnoStore((s) => s.days);
  const toggleDay = useSomnoStore((s) => s.toggleDay);
  const smartWake = useSomnoStore((s) => s.smartWake);
  const toggleSmartWake = useSomnoStore((s) => s.toggleSmartWake);
  const finishOnboarding = useSomnoStore((s) => s.finishOnboarding);
  const openSheet = useSomnoStore((s) => s.openSheet);
  // The alarm created here is the user's first, so this is where the app finds out whether it will
  // be allowed to show itself. Asked once, and never blocking: the alarm is saved either way.
  const saveAlarm = async () => {
    // The same rule as the editor: an alarm with no days can never ring, and a first alarm that
    // silently does nothing is the worst possible introduction to an alarm clock.
    if (!days.some(Boolean)) {
      openSheet(
        'Pick at least one day',
        'An alarm with no days selected can never ring. Choose the days you want to be woken.'
      );
      return;
    }
    await ensureAlarmNotifications();
    finishOnboarding();
  };

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ProgressStep step={9} />
        <View style={styles.body}>
          <Text style={styles.headline}>Your first alarm</Text>
          <GlassCard variant="strong" radiusSize={26} pad={22}>
            <View style={styles.dialWrap}>
              <AlarmDial minutes={alarmMin} is24h={is24h} onChange={setAlarmMin} amPm={fmtAP(alarmMin, is24h)} />
              <View style={styles.stepRow}>
                <Pressable style={styles.stepBtn} onPress={alarmEarlier} accessibilityRole="button" accessibilityLabel="Five minutes earlier">
                  <Icon name="minus" size={15} color={color.textDim70} strokeWidth={2} />
                </Pressable>
                <Text style={styles.stepLabel}>5 MIN</Text>
                <Pressable style={styles.stepBtn} onPress={alarmLater} accessibilityRole="button" accessibilityLabel="Five minutes later">
                  <Icon name="plus" size={15} color={color.textDim70} strokeWidth={2} />
                </Pressable>
              </View>
              <View style={styles.daysRow}>
                {DAY_LETTERS.map((d, i) => (
                  <Pressable
                    key={i}
                    onPress={() => toggleDay(i)}
                    accessibilityRole="checkbox"
                    accessibilityLabel={DAY_NAMES[i]}
                    accessibilityState={{ checked: days[i] }}
                    style={[styles.dayCircle, { backgroundColor: days[i] ? 'rgba(236,234,246,0.92)' : 'rgba(255,255,255,0.05)' }]}
                  >
                    <Text style={[styles.dayLetter, { color: days[i] ? '#150F2C' : color.textDim70 }]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </GlassCard>
          <Pressable onPress={toggleSmartWake} accessibilityRole="switch" accessibilityLabel="Smart Wake" accessibilityState={{ checked: smartWake }}>
            <GlassCard variant="faint" radiusSize={22} pad={18}>
              <View style={{ gap: 10 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.smartTitle}>Smart Wake</Text>
                  <Toggle label="Smart Wake" value={smartWake} onToggle={toggleSmartWake} interactive={false} />
                </View>
                <Text style={styles.smartBody}>When your alarm goes off, Somno checks how alert you are before deciding whether snoozing actually helps.</Text>
              </View>
            </GlassCard>
          </Pressable>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <PrimaryButton label="Save alarm" onPress={saveAlarm} />
          <Pressable onPress={finishOnboarding} accessibilityRole="button">
            <Text style={styles.later}>Set this up later</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 16, gap: 16 },
  headline: { fontFamily: font.serif, fontSize: 32, lineHeight: 36, color: color.text },
  dialWrap: { alignItems: 'center', gap: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 38,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { fontFamily: font.sans600, fontSize: 11.5, letterSpacing: 1.5, color: color.textDim45 },
  daysRow: { flexDirection: 'row', gap: 6 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  dayLetter: { fontFamily: font.sans600, fontSize: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  smartTitle: { fontFamily: font.sans700, fontSize: 15, color: color.text },
  smartBody: { fontFamily: font.sans500, fontSize: 13, lineHeight: 19, color: color.textDim55 },
  footer: { paddingHorizontal: 24, paddingBottom: 0, paddingTop: 14, gap: 10 },
  later: { textAlign: 'center', fontFamily: font.sans500, fontSize: 14, color: color.textDim45 },
});
