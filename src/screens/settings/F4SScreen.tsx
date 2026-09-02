import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, Toggle } from '../../components';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { listAlarmSounds, previewSound, stopAlarmSound } from '../../lib/alarmSound';
import { GroupCard, SettingsHeader } from './_shared';

export function F4SScreen() {
  const go = useSomnoStore((s) => s.go);
  const alarmSound = useSomnoStore((s) => s.alarmSound);
  const setAlarmSound = useSomnoStore((s) => s.setAlarmSound);
  const vibrate = useSomnoStore((s) => s.vibrate);
  const toggleVibrate = useSomnoStore((s) => s.toggleVibrate);

  /**
   * The tones this device actually has, read from the system's alarm ringtones.
   *
   * The list used to be four invented names with no audio behind any of them — picking one changed
   * a label and nothing else. Each row here is a real file that the alarm will play, and tapping
   * one plays it so the choice can be heard rather than guessed at.
   */
  const [sounds, setSounds] = useState<{ uri: string; name: string }[]>([]);
  useEffect(() => setSounds(listAlarmSounds()), []);

  const [playing, setPlaying] = useState<string | null>(null);

  // Nothing should still be making a noise once this screen is gone.
  useEffect(() => () => stopAlarmSound(), []);

  const choose = (uri: string) => {
    setAlarmSound(uri);
    // Tapping the tone that is already playing stops it. Previews are short and stop themselves,
    // but a user who wants silence now should not have to wait for one.
    if (playing === uri) {
      stopAlarmSound();
      setPlaying(null);
      return;
    }
    previewSound(uri);
    setPlaying(uri);
  };

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SettingsHeader title="Alarm sound" onBack={() => go('F4E')} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <GroupCard>
            {sounds.length === 0 && (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>Your device&apos;s alarm sound</Text>
                  <Text style={styles.desc}>Somno uses the system alarm tone. Other tones appear here on a phone.</Text>
                </View>
              </View>
            )}
            {sounds.map((snd, i) => (
              <Pressable
                key={snd.uri}
                onPress={() => choose(snd.uri)}
                style={[styles.row, i < sounds.length - 1 && styles.rowBorder]}
                accessibilityRole="button"
                accessibilityState={{ selected: alarmSound === snd.uri }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{snd.name}</Text>
                  <Text style={styles.desc}>{playing === snd.uri ? 'Playing — tap to stop' : 'Tap to hear it'}</Text>
                </View>
                {alarmSound === snd.uri && <Text style={styles.check}>✓</Text>}
              </Pressable>
            ))}
          </GroupCard>

          <Pressable onPress={toggleVibrate} style={styles.vibRow} accessibilityRole="switch" accessibilityLabel="Vibrate with the sound" accessibilityState={{ checked: vibrate }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>Vibrate</Text>
              <Text style={styles.desc}>Rises with the sound</Text>
            </View>
            <Toggle label="Vibrate with the sound" value={vibrate} onToggle={toggleVibrate} interactive={false} />
          </Pressable>

          {/* Both halves of this used to be wrong. The ramp is 25% volume climbing in five steps of
              eight seconds, so it reaches full at forty seconds, not thirty — and escalation is not
              "set per alarm" anywhere, because it is not configurable at all. See AlarmSoundPlayer. */}
          <Text style={styles.footnote}>
            Sounds start at a quarter volume and reach full within about forty seconds, with
            vibration joining after fifteen. That is not adjustable, so a Smart Wake alarm can never
            be easier to sleep through than an ordinary one.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  name: { fontFamily: font.sans500, fontSize: 14, color: color.text },
  desc: { fontFamily: font.sans500, fontSize: 11.5, color: color.textDim42, marginTop: 2 },
  check: { fontFamily: font.sans700, fontSize: 15, color: '#A99BFF' },
  vibRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: color.glassFillFaint,
    borderWidth: 1,
    borderColor: color.glassBorder12,
  },
  footnote: { fontFamily: font.sans500, fontSize: 11.5, lineHeight: 17, color: color.textDim40, paddingHorizontal: 6 },
});
