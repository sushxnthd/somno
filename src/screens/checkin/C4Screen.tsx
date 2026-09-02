import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, KSSSelector } from '../../components';
import { BackChevron } from '../../components/TopBar';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { kssWords, kssBodies } from '../../data/content';

export function C4Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const go = useSomnoStore((s) => s.go);
  const kss = useSomnoStore((s) => s.kss);
  const setKss = useSomnoStore((s) => s.setKss);
  const submitKss = useSomnoStore((s) => s.submitKss);

  const title = kss ? `${kss} · ${kssWords[kss - 1]}` : 'Pick the number that fits';
  const body = kss ? kssBodies[kss - 1] : 'One tap. There is no right answer, and your own read is a real signal.';

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <BackChevron onPress={() => go('C1')} />
        </View>
        <View style={styles.body}>
          <Text style={styles.headline}>How sleepy do you feel right now?</Text>
          <View style={{ gap: 11 }}>
            <KSSSelector value={kss} onChange={setKss} />
            <View style={styles.rowBetween}>
              <Text style={styles.endLabel}>1 · Very alert</Text>
              <Text style={styles.endLabel}>9 · Fighting sleep</Text>
            </View>
          </View>
          <GlassCard variant="faint" radiusSize={22} pad={18}>
            <View>
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.cardBody}>{body}</Text>
            </View>
          </GlassCard>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <PrimaryButton label="Submit" onPress={submitKss} disabled={!kss} />
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 26, paddingTop: 20 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 26 },
  headline: { fontFamily: font.serif, fontSize: 33, lineHeight: 37, color: color.text },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  endLabel: { fontFamily: font.sans500, fontSize: 11.5, color: color.textDim45 },
  cardTitle: { fontFamily: font.sans700, fontSize: 14.5, color: color.text, marginBottom: 3 },
  cardBody: { fontFamily: font.sans500, fontSize: 13, lineHeight: 19.5, color: color.textDim55 },
  footer: { paddingHorizontal: 24, paddingBottom: 0, paddingTop: 14 },
});
