import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Path, Rect } from 'react-native-svg';
import { ScreenContainer, GlassCard } from '../../components';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { RowIcon, SettingsHeader } from './_shared';

export function F3Screen() {
  const go = useSomnoStore((s) => s.go);

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SettingsHeader title="Integrations" onBack={() => go('F0')} />
        <View style={styles.body}>
          {/* Health Connect import is v1.5 in the spec's own sequencing, and this card used to be a
              toggle that flipped a flag and imported nothing. It states where it stands instead. */}
          <GlassCard variant="faint" radiusSize={24} pad={18}>
            <View style={{ gap: 11 }}>
              <View style={styles.row}>
                <RowIcon size={38} bg="rgba(255,150,130,0.35)" fg="#2A0E0A">
                  <Path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20z" />
                </RowIcon>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Health Connect</Text>
                  <Text style={styles.sub}>Not in this version</Text>
                </View>
              </View>
              <Text style={styles.body2}>
                Importing sleep you already track is planned, not built. Until then the manual sleep log is the
                input, and it feeds everything the import would have.
              </Text>
            </View>
          </GlassCard>

          {/* The calendar integration is gone. It existed to write tonight's bedtime into the
              user's own calendar, which is the wrong place for it: a calendar holds appointments
              with other people, and filing sleep plans there meant holding read and write access to
              it. The same job is now a reminder, which needs nothing but the notification
              permission the app already asks for. */}
          <GlassCard variant="faint" radiusSize={24} pad={18}>
            <View style={{ gap: 11 }}>
              <View style={styles.row}>
                <RowIcon size={38} bg="rgba(160,190,255,0.55)" fg="#0C1430">
                  <Rect x={3.5} y={5} width={17} height={15.5} rx={3} />
                  <Path d="M8 3v4M16 3v4M3.5 10h17" />
                </RowIcon>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Calendar</Text>
                  <Text style={styles.sub}>Not used</Text>
                </View>
              </View>
              <Text style={styles.body2}>
                Somno does not read or write your calendar. Tonight&apos;s plan is a reminder from the app
                instead, set from the Recovery tab.
              </Text>
            </View>
          </GlassCard>
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  title: { fontFamily: font.sans700, fontSize: 15, color: color.text },
  sub: { fontFamily: font.sans500, fontSize: 11, color: color.textDim45, marginTop: 1 },
  body2: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim55 },
});
