import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer } from '../../components';
import { BackChevron } from '../../components/TopBar';
import { Icon, IconName } from '../../components/Icons';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { lessons } from '../../data/content';

const LESSON_TINTS = ['rgba(138,123,255,0.55)', 'rgba(255,184,119,0.55)', 'rgba(255,142,122,0.55)', 'rgba(160,190,255,0.55)'];
const LESSON_SUBS = [
  'What screens do to melatonin, in plain terms.',
  'How long a nap should be, and when.',
  'Why 4pm coffee is still with you at midnight.',
  'The one habit that steadies everything else.',
];

export function DLScreen() {
  const go = useSomnoStore((s) => s.go);
  const openLesson = useSomnoStore((s) => s.openLesson);

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <BackChevron onPress={() => go('D')} />
          <Text style={styles.headerTitle}>Sleep hygiene</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {lessons.map((l, i) => (
            <Pressable key={l.t} onPress={() => openLesson(i)} style={styles.row} accessibilityRole="button">
              <View style={[styles.iconWrap, { backgroundColor: LESSON_TINTS[i] }]}>
                <Icon name={l.icon as IconName} size={22} color="#F2EFFF" strokeWidth={1.7} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{l.t}</Text>
                <Text style={styles.rowSub}>{LESSON_SUBS[i]}</Text>
              </View>
              <Text style={styles.meta}>1 min</Text>
            </Pressable>
          ))}
          <View style={{ height: 90 }} />
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontFamily: font.sans700, fontSize: 17, color: color.text },
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 9 },
  row: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  iconWrap: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: font.sans700, fontSize: 14, color: color.text },
  rowSub: { marginTop: 2, fontFamily: font.sans500, fontSize: 11.5, lineHeight: 16, color: color.textDim45 },
  meta: { fontFamily: font.sans500, fontSize: 11, color: color.textDim40 },
});
