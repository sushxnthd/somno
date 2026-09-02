import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, AlarmAmbience, AmbientBlob, GlassOrb , CssGradient } from '../../components';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';

export function G3Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(44);
  const sdi = useSomnoStore((s) => s.sdi);
  const snoozes = useSomnoStore((s) => s.snoozes);
  const maxSnoozes = useSomnoStore((s) => s.maxSnoozes);
  const snoozeLen = useSomnoStore((s) => s.snoozeLen);
  const snooze = useSomnoStore((s) => s.snooze);
  const stopAlarm = useSomnoStore((s) => s.stopAlarm);
  const go = useSomnoStore((s) => s.go);
  const face = useSomnoStore((s) => s.lastFaceMetrics);
  const pvtTimes = useSomnoStore((s) => s.pvtTimes);
  const checkIns = useSomnoStore((s) => s.checkIns);
  const faceUsed = !!face && !face.provisional;
  const pvtUsed = pvtTimes.length > 0;
  const weekAverage = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    const week = checkIns.filter((c) => c.timestamp >= cutoff);
    // Two prior check-ins is the least that can carry the word "most of your mornings".
    if (week.length < 3) return null;
    return Math.round(week.reduce((a, c) => a + c.sdi, 0) / week.length);
  }, [checkIns]);

  const outOfSnoozes = snoozes >= maxSnoozes;
  const alert = sdi >= 60;

  /**
   * Which signals this reading was actually built from.
   *
   * The screen used to state "your face scan and taps agree" and "your scan and taps both sit
   * below baseline" unconditionally — on a check-in where the scan was skipped, where the camera
   * was denied, or where the face baseline was still provisional and excluded from the fusion, it
   * asserted agreement between two measurements when only one had been taken. It also claimed the
   * reading was "sharper than most of your mornings this week" without consulting the week.
   */
  const signalWord =
    faceUsed && pvtUsed ? 'Your face scan and taps agree'
    : faceUsed ? 'Your face scan says so'
    : pvtUsed ? 'Your taps say so'
    : 'Going on your own rating';
  const belowWord =
    faceUsed && pvtUsed ? 'Your scan and taps both sit below baseline'
    : faceUsed ? 'Your scan sits below baseline'
    : pvtUsed ? 'Your taps sit below baseline'
    : 'Your own rating puts you below par';
  // Compared against the week only when there is a week to compare against.
  const vsWeek =
    weekAverage != null && sdi - weekAverage >= 5 ? 'Sharper than most of your mornings this week. '
    : weekAverage != null && weekAverage - sdi >= 5 ? 'Below your usual morning, but awake. '
    : '';

  const wakeHeadline = outOfSnoozes ? 'Time to get up' : alert ? "You're up. Alarm stopped." : `Still groggy. ${snoozeLen} more minutes?`;
  const wakeBody = outOfSnoozes
    ? 'That was your last snooze, so the alarm stops here. More snoozing past this point tends to make the morning worse, not better. Ten minutes of daylight will do more.'
    : alert
    ? `${vsWeek}${signalWord}.`
    : `${belowWord}. Somno picked ${snoozeLen} minutes for you — long enough to help, and short enough that you are unlikely to drop into deep sleep and wake up worse.`;
  const wakePrimary = outOfSnoozes ? "See today's recovery tip" : alert ? 'Open Somno' : `Snooze ${snoozeLen} minutes`;

  const onPrimary = () => {
    if (outOfSnoozes) {
      // The cap did the stopping, not the user. Recorded as such so the safety rule is auditable.
      stopAlarm('checkin_snoozed_out');
      go('D');
    } else if (alert) {
      stopAlarm('checkin_passed');
    } else {
      snooze();
    }
  };

  return (
    <ScreenContainer>
      <AlarmAmbience withViolet={false} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <View style={styles.orbWrap}>
            {/* source: inset:-12px on a 180px orb -> 204px, warm from 120deg, blur(28px) saturate(165%), .7, 15s */}
            <AmbientBlob size={204} warm fromDeg={120} blurPx={28} saturate={1.65} opacity={0.7} durationMs={15000} />
            <GlassOrb size={180} highlight={0.32} borderAlpha={0.18} breatheMs={4000}>
              <Text style={styles.sdi}>{sdi}</Text>
            </GlassOrb>
          </View>
          <Text style={styles.headline}>{wakeHeadline}</Text>
          <Text style={styles.body}>{wakeBody}</Text>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <Pressable onPress={onPrimary} accessibilityRole="button">
            {/* `linear-gradient(150deg, ...)` — the design fills its CTAs with a gradient, not a flat tint. */}
            <CssGradient angle={150} colors={['rgba(255,255,255,0.97)', 'rgba(255,226,196,0.9)']} style={styles.primary}>
              <Text style={styles.primaryText}>{wakePrimary}</Text>
            </CssGradient>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => stopAlarm('manual_stop')} accessibilityRole="button">
            <Text style={styles.secondaryText}>Just stop the alarm</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 32 },
  orbWrap: { width: 204, height: 204, alignItems: 'center', justifyContent: 'center' },
  sdi: { fontFamily: font.sans600, fontSize: 62, color: color.text },
  headline: { fontFamily: font.serif, fontSize: 32, lineHeight: 36, color: color.text, textAlign: 'center' },
  body: { fontFamily: font.sans400, fontSize: 14, lineHeight: 21, color: color.text, opacity: 0.72, textAlign: 'center' },
  footer: { paddingHorizontal: 24, paddingBottom: 0, gap: 10 },
  primary: { height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: font.sans700, fontSize: 16, color: '#2A1A10' },
  secondary: { height: 58, borderRadius: 29, borderWidth: 1, borderColor: 'rgba(255,255,255,0.42)', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: font.sans700, fontSize: 16, color: color.text },
});
