import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, Toggle } from '../../components';
import { color, font } from '../../theme/tokens';
import { useSomnoStore, useIs24h } from '../../store/useSomnoStore';
import { fmt } from '../../utils/format';
import { SettingsHeader } from './_shared';
import { NOTIFICATION_BODIES, RECALIBRATE_AFTER_DAYS } from '../../lib/notifications';

export function FNScreen() {
  const is24h = useIs24h();
  const go = useSomnoStore((s) => s.go);
  const noteR = useSomnoStore((s) => s.noteR);
  const toggleNoteRecal = useSomnoStore((s) => s.toggleNoteRecal);
  const wakeMin = useSomnoStore((s) => s.wakeMin);
  const bedMin = useSomnoStore((s) => s.bedMin);
  const baselineAt = useSomnoStore((s) => s.baselineProfile?.createdAt ?? null);
  const windDownMin = ((bedMin - 60) % 1440 + 1440) % 1440;
  /**
   * When the nudge first arrives. It repeats monthly from there — it used to be a single date, and
   * the copy said "due", which was true exactly once.
   */
  const recalDue = baselineAt
    ? new Date(baselineAt + RECALIBRATE_AFTER_DAYS * 86_400_000).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    : '';
  const noteM = useSomnoStore((s) => s.noteM);
  const noteW = useSomnoStore((s) => s.noteW);
  const noteK = useSomnoStore((s) => s.noteK);
  const toggleNoteMorning = useSomnoStore((s) => s.toggleNoteMorning);
  const toggleNoteWind = useSomnoStore((s) => s.toggleNoteWind);
  const toggleNoteWeekly = useSomnoStore((s) => s.toggleNoteWeekly);

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SettingsHeader title="Notifications" onBack={() => go('F0')} />
        <View style={styles.body}>
          <Pressable onPress={toggleNoteMorning} accessibilityRole="switch" accessibilityLabel="Morning check-in reminder" accessibilityState={{ checked: noteM }}>
            <GlassCard variant="faint" radiusSize={22} pad={16}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Morning check-in</Text>
                  <Text style={styles.body2}>&ldquo;{NOTIFICATION_BODIES.morning}&rdquo;</Text>
                </View>
                <Toggle label="Morning check-in reminder" value={noteM} onToggle={toggleNoteMorning} interactive={false} />
              </View>
            </GlassCard>
          </Pressable>
          <Pressable onPress={toggleNoteWind} accessibilityRole="switch" accessibilityLabel="Wind-down reminder" accessibilityState={{ checked: noteW }}>
            <GlassCard variant="faint" radiusSize={22} pad={16}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Wind-down</Text>
                  <Text style={styles.body2}>&ldquo;{NOTIFICATION_BODIES.windDown}&rdquo;</Text>
                </View>
                <Toggle label="Wind-down reminder" value={noteW} onToggle={toggleNoteWind} interactive={false} />
              </View>
            </GlassCard>
          </Pressable>
          <Pressable onPress={toggleNoteWeekly} accessibilityRole="switch" accessibilityLabel="Weekly summary" accessibilityState={{ checked: noteK }}>
            <GlassCard variant="faint" radiusSize={22} pad={16}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Weekly summary</Text>
                  <Text style={styles.body2}>&ldquo;{NOTIFICATION_BODIES.weekly}&rdquo;</Text>
                </View>
                <Toggle label="Weekly summary" value={noteK} onToggle={toggleNoteWeekly} interactive={false} />
              </View>
            </GlassCard>
          </Pressable>
          {/* This card used to be dimmed to 75% with a Toggle hard-wired to `true` and an empty
              handler, above a quoted sentence nothing ever sent. The reminder is now scheduled for
              real, thirty days after the baseline was taken — see scheduleReminders — so the
              toggle controls something and the quote is the text that arrives. */}
          <Pressable onPress={toggleNoteRecal} accessibilityRole="switch" accessibilityLabel="Monthly recalibration nudge" accessibilityState={{ checked: noteR }}>
            <GlassCard variant="faint" radiusSize={22} pad={16}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Monthly recalibration nudge</Text>
                  <Text style={styles.body2}>&ldquo;{NOTIFICATION_BODIES.recalibrate}&rdquo;</Text>
                </View>
                <Toggle label="Monthly recalibration nudge" value={noteR} onToggle={toggleNoteRecal} interactive={false} />
              </View>
            </GlassCard>
          </Pressable>
          {/* What this used to say: "Quiet hours follow your bedtime, so nothing arrives between
              10:45pm and your alarm." Nobody's bedtime is 10:45pm unless they set it to that, and
              no quiet-hours rule existed anywhere in the app — it was a promise about behaviour
              with nothing behind it. What is actually true is simpler, and is now derived from the
              times the reminders are genuinely scheduled at. */}
          <Text style={styles.footnote}>
            {baselineAt
              ? `Reminders arrive at ${fmt(wakeMin, is24h)} and ${fmt(windDownMin, is24h)} — your wake time, and an hour before your bedtime. Nothing is scheduled while you are asleep. The recalibration nudge starts ${recalDue} and repeats monthly until you recalibrate.`
              : `Reminders arrive at ${fmt(wakeMin, is24h)} and ${fmt(windDownMin, is24h)} — your wake time, and an hour before your bedtime. Nothing is scheduled while you are asleep.`}
          </Text>
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: font.sans700, fontSize: 14, color: color.text },
  body2: { fontFamily: font.sans500, fontSize: 12, lineHeight: 17, color: color.textDim50, marginTop: 2 },
  footnote: { fontFamily: font.sans400, fontSize: 12, lineHeight: 18, color: color.textDim40, paddingHorizontal: 6, marginTop: 4 },
});
