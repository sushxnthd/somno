import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, AlarmAmbience , CssGradient } from '../../components';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font, displayNumeral } from '../../theme/tokens';
import { useSomnoStore, useIs24h } from '../../store/useSomnoStore';
import { fmt } from '../../utils/format';

export function G1Screen() {
  const is24h = useIs24h();
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(46);
  const snoozes = useSomnoStore((s) => s.snoozes);
  const maxSnoozes = useSomnoStore((s) => s.maxSnoozes);
  const snoozeLen = useSomnoStore((s) => s.snoozeLen);
  const snoozeArmed = useSomnoStore((s) => s.snoozeArmed);
  const startAlarmPvt = useSomnoStore((s) => s.startAlarmPvt);
  const stopAlarm = useSomnoStore((s) => s.stopAlarm);
  const snooze = useSomnoStore((s) => s.snooze);
  /**
   * Whether the alarm that fired has Smart Wake switched on.
   *
   * This is what the per-alarm toggle now means. Before, `alarm.smart` changed nothing anyone could
   * observe: every alarm — smart or not — opened this screen offering a check-in, and the only way
   * to snooze at all was to take a reaction-time test first. Someone who deliberately turned Smart
   * Wake off still got the smart alarm.
   *
   * With it off this is an ordinary alarm clock: snooze for a fixed number of minutes, or stop. No
   * measurement is asked for, and none is taken.
   */
  const smart = useSomnoStore((s) => s.smartWakeActive());
  const outOfSnoozes = snoozes >= maxSnoozes;

  /**
   * The actual time, now, on this device.
   *
   * The prototype's mockup showed a fixed "SUNDAY, 9 AUGUST" under a clock reading whatever the
   * alarm dial happened to be set to, and the port kept both. So the one screen a user sees while
   * half asleep — the screen whose entire job is to be a clock — showed a date in the past and a
   * time that was not the time. It is hard to imagine a better way to produce the report "the
   * app's time doesn't sync with my device's actual time".
   *
   * Ticks on the minute so it stays right through a snooze without spending a timer per second.
   */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    // Aligned to the next minute boundary rather than a rolling 60s, so the readout changes when
    // the phone's clock does.
    let interval: ReturnType<typeof setInterval> | null = null;
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Alarms are not only for mornings — this app's own onboarding sets an evening one. "Good
  // morning" at 7pm is the same mockup-copied-verbatim mistake as the fixed date underneath it.
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

  const tail = smart
    ? 'Thirty seconds tells us if another one helps.'
    : outOfSnoozes
      ? 'That was the last one.'
      : 'Snooze again or stop the alarm.';
  /**
   * This screen is shown in two different states and has to tell them apart.
   *
   * Right after the snooze button, the alarm is silent and a ring is pending — that is what
   * `snoozeArmed` means. When that ring arrives, `beginAlarmSession` clears the flag, because the
   * snooze has been spent, and the alarm is sounding again.
   *
   * The flag used to survive the re-fire, so the screen said "ringing again in 9 minutes" at the
   * exact moment it was ringing for that reason. Clearing it correctly then exposed the other half
   * of the same conflation: the false branch read "this device could not arm another ring", a
   * failure message, on every ordinary re-fire. A snooze that genuinely fails to arm now says so in
   * its own sheet, at the moment it happens — see `snooze` in the store — which leaves this line
   * with only the two states it can actually distinguish.
   */
  const alarmSub =
    snoozes > 0
      ? snoozeArmed
        ? `Snooze ${snoozes} of ${maxSnoozes} — ringing again in ${snoozeLen} minutes. ${tail}`
        : `Snooze ${snoozes} of ${maxSnoozes}. ${tail}`
      : smart
        ? 'Thirty seconds tells us whether another few minutes would actually help.'
        // Not a restatement of the two buttons below it — what the buttons do not say, which is how
        // many times the snooze can be taken before the alarm stops offering it.
        : `Snooze runs ${snoozeLen} minutes at a time, up to ${maxSnoozes}.`;

  return (
    <ScreenContainer>
      <AlarmAmbience />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.headline}>{greeting}</Text>
          <Text style={styles.date}>{todayLabel}</Text>
          <View style={styles.clockPill}>
            <Text style={styles.clock}>{fmt(nowMin, is24h)}</Text>
          </View>
          <Text style={styles.sub}>{alarmSub}</Text>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          {/* Smart Wake on: the check-in is the primary action. Off: snooze is, until the cap. */}
          {(smart || !outOfSnoozes) && (
            <Pressable onPress={smart ? startAlarmPvt : snooze} accessibilityRole="button">
              {/* `linear-gradient(150deg, ...)` — the design fills its CTAs with a gradient, not a flat tint. */}
              <CssGradient angle={150} colors={['rgba(255,255,255,0.97)', 'rgba(255,226,196,0.9)']} style={styles.primary}>
                <Text style={styles.primaryText}>{smart ? 'Check in' : `Snooze ${snoozeLen} minutes`}</Text>
              </CssGradient>
            </Pressable>
          )}
          <Pressable style={styles.secondary} onPress={() => stopAlarm('manual_stop')} accessibilityRole="button">
            <Text style={styles.secondaryText}>{smart ? 'Just stop the alarm' : 'Stop alarm'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 30 },
  headline: { fontFamily: font.serif, fontSize: 52, lineHeight: 54, color: color.text, textAlign: 'center' },
  date: { fontFamily: font.sans700, fontSize: 10.5, letterSpacing: 2.2, color: color.text, opacity: 0.5 },
  clockPill: {
    marginTop: 10,
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  clock: { fontFamily: font.sans600, ...displayNumeral(54), color: color.text, letterSpacing: -1.62 }, // 54px/1, -.03em
  sub: { marginTop: 8, fontFamily: font.sans500, fontSize: 14.5, lineHeight: 22, color: color.text, opacity: 0.62, textAlign: 'center' },
  footer: { paddingHorizontal: 24, paddingBottom: 0, gap: 11 },
  primary: {
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFAA5A',
    shadowOpacity: 0.28,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
  },
  primaryText: { fontFamily: font.sans700, fontSize: 17, color: '#2A1A10' },
  secondary: { height: 60, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: font.sans700, fontSize: 17, color: color.text },
});
