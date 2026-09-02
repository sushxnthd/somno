import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, AlarmDial, Toggle } from '../../components';
import { Icon } from '../../components/Icons';
import { color, font } from '../../theme/tokens';
import { useSomnoStore, useIs24h } from '../../store/useSomnoStore';
import { ensureAlarmNotifications } from '../../lib/notifications';
import { listAlarmSounds } from '../../lib/alarmSound';
import { fmtAP } from '../../utils/format';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function F4EScreen() {
  const is24h = useIs24h();
  const go = useSomnoStore((s) => s.go);
  const editId = useSomnoStore((s) => s.editId);
  const alarmMin = useSomnoStore((s) => s.alarmMin);
  const setAlarmMin = useSomnoStore((s) => s.setAlarmMin);
  const alarmEarlier = useSomnoStore((s) => s.alarmEarlier);
  const alarmLater = useSomnoStore((s) => s.alarmLater);
  const days = useSomnoStore((s) => s.days);
  const toggleDay = useSomnoStore((s) => s.toggleDay);
  const smartWake = useSomnoStore((s) => s.smartWake);
  const toggleSmartWake = useSomnoStore((s) => s.toggleSmartWake);
  const alarmSound = useSomnoStore((s) => s.alarmSound);
  // The stored value is a ringtone URI; the row shows the name that URI belongs to.
  const soundName = useMemo(() => {
    if (!alarmSound) return 'Device alarm';
    return listAlarmSounds().find((snd) => snd.uri === alarmSound)?.name ?? 'Device alarm';
  }, [alarmSound]);
  const alarmLabel = useSomnoStore((s) => s.alarmLabel);
  const setAlarmLabel = useSomnoStore((s) => s.setAlarmLabel);
  const saveAlarm = useSomnoStore((s) => s.saveAlarm);
  const openSheet = useSomnoStore((s) => s.openSheet);
  // An alarm shows itself through a notification, so saving one is the moment to find out whether
  // this device will let it. Saving still happens either way — the alarm is the user's, not ours.
  const saveWithPermission = async () => {
    /**
     * Validation before permission: there is no point asking for notification access on behalf of
     * an alarm that is not going to be saved. `saveAlarm` refuses a day mask with nothing in it,
     * which used to save silently and never ring.
     */
    if (!days.some(Boolean)) {
      openSheet(
        'Pick at least one day',
        'An alarm with no days selected can never ring. Choose the days you want it on, or delete it if you no longer need it.'
      );
      return;
    }
    const granted = await ensureAlarmNotifications();
    saveAlarm();
    if (!granted) {
      openSheet(
        'Notifications are off',
        'This alarm will still ring, but Android will not let it show its wake-up screen without notification permission. You can turn it on in system settings.'
      );
    }
  };
  const deleteAlarm = useSomnoStore((s) => s.deleteAlarm);

  const editTitle = editId == null ? 'New alarm' : 'Edit alarm';

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.top}>
          <Pressable onPress={() => go('F4')} accessibilityRole="button">
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>{editTitle}</Text>
          <Pressable onPress={saveWithPermission} accessibilityRole="button">
            <Text style={styles.save}>Save</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
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
                  <Pressable key={i} onPress={() => toggleDay(i)} style={[styles.dayCircle, { backgroundColor: days[i] ? 'rgba(236,234,246,0.92)' : 'rgba(255,255,255,0.05)' }]} accessibilityRole="button">
                    <Text style={[styles.dayLetter, { color: days[i] ? '#150F2C' : color.textDim70 }]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </GlassCard>

          <View style={styles.group}>
            <Pressable onPress={toggleSmartWake} style={[styles.row, styles.rowBorder]} accessibilityRole="switch" accessibilityLabel="Smart Wake" accessibilityState={{ checked: smartWake }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Smart Wake</Text>
                {/*
                  Describes what the feature actually does.

                  It used to promise a ring "up to 30 minutes early, at the lightest sleep a model
                  of your night predicts". The early-wake mechanism was removed — nothing on this
                  phone can tell which stage anyone is in, and the offset it was based on now always
                  returns zero — but the sentence promising it stayed, so the toggle described a
                  capability the code no longer has. What it does now is the wake check-in and the
                  snooze length that follows from it.
                */}
                <Text style={styles.rowNote}>
                  Rings at the time you set, then offers a 30-second check-in and picks a snooze length from
                  the result. Off is an ordinary alarm with a fixed snooze. Nothing measures your sleep stages.
                </Text>
              </View>
              <Toggle label="Smart Wake" value={smartWake} onToggle={toggleSmartWake} interactive={false} />
            </Pressable>
            <Pressable onPress={() => go('F4S')} style={[styles.row, styles.rowBorder]} accessibilityRole="button">
              <Text style={styles.rowLabel}>Sound</Text>
              <Text style={styles.rowValue}>{soundName} ›</Text>
            </Pressable>
            <View style={[styles.row, { paddingVertical: 10 }]}>
              <Text style={styles.rowLabelFixed}>Label</Text>
              <TextInput
                value={alarmLabel}
                onChangeText={setAlarmLabel}
                placeholder="Weekday"
                placeholderTextColor={color.textDim32}
                style={styles.input}
              />
            </View>
          </View>

          {editId != null && (
            <Pressable onPress={deleteAlarm} style={styles.deleteBtn} accessibilityRole="button">
              <Text style={styles.deleteText}>Delete alarm</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 18 },
  cancel: { fontFamily: font.sans500, fontSize: 14.5, color: color.text, opacity: 0.55 },
  title: { fontFamily: font.sans700, fontSize: 15, color: color.text },
  save: { fontFamily: font.sans700, fontSize: 14.5, color: '#A99BFF' },
  body: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 24, gap: 16 },
  dialWrap: { alignItems: 'center', gap: 16 },
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
  group: { backgroundColor: color.glassFillFaint, borderWidth: 1, borderColor: color.glassBorder12, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  rowLabel: { flex: 1, fontFamily: font.sans500, fontSize: 14, color: color.text },
  rowNote: { fontFamily: font.sans500, fontSize: 11.5, lineHeight: 16, color: color.textDim45, marginTop: 3, paddingRight: 12 },
  rowLabelFixed: { fontFamily: font.sans500, fontSize: 14, color: color.text },
  rowValue: { fontFamily: font.sans500, fontSize: 13, color: color.textDim50 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: color.text,
    fontFamily: font.sans500,
    fontSize: 13.5,
    paddingHorizontal: 12,
    textAlign: 'right',
  },
  deleteBtn: {
    textAlign: 'center',
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(255,142,122,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,142,122,0.28)',
    alignItems: 'center',
  },
  deleteText: { fontFamily: font.sans700, fontSize: 14.5, color: '#FF8E7A' },
});
