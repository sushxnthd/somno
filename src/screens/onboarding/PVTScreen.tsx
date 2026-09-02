import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, ProgressFill } from '../../components';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';

export function PVTScreen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(44);
  const pvtTrial = useSomnoStore((s) => s.pvtTrial);
  const pvtTotal = useSomnoStore((s) => s.pvtTotal);
  const pvtLive = useSomnoStore((s) => s.pvtLive);
  const pvtFalse = useSomnoStore((s) => s.pvtFalse);
  const lastMs = useSomnoStore((s) => s.lastMs);
  const pvtTap = useSomnoStore((s) => s.pvtTap);
  const abortTest = useSomnoStore((s) => s.abortTest);

  const pct = Math.round((pvtTrial / (pvtTotal || 12)) * 100);
  const glow = pvtFalse ? 'rgba(255,150,110,0.55)' : pvtLive ? 'rgba(190,172,255,0.85)' : 'rgba(120,100,220,0.18)';
  const fill = pvtFalse ? 'rgba(255,150,110,0.22)' : pvtLive ? 'rgba(226,218,255,0.92)' : 'rgba(255,255,255,0.05)';
  const border = pvtLive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.12)';
  const text = pvtFalse ? 'too soon' : pvtLive ? 'tap' : lastMs ? `${lastMs} ms` : '';
  const textColor = pvtLive ? '#221B3C' : color.textDim55;
  const hint = pvtFalse ? 'Wait for the glow, then tap.' : pvtLive ? 'Now' : 'Tap the moment it lights up';

  return (
    <ScreenContainer entry={false}>
      <Pressable style={{ flex: 1 }} onPress={pvtTap} accessibilityRole="button">
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.progressWrap}>
            <View style={styles.track}>
              {/* `linear-gradient(90deg,#8A7BFF,#C9A6FF)` with `transition: width .3s ease` */}
              <ProgressFill pct={pct} colors={['#8A7BFF', '#C9A6FF']} height={3} radius={2} />
            </View>
            <Text style={styles.count}>Trial {Math.min(pvtTrial + 1, pvtTotal || 12)} of {pvtTotal || 12}</Text>
          </View>
          <View style={styles.center}>
            <View style={[styles.glow, { backgroundColor: glow }]} />
            <View style={[styles.stim, { backgroundColor: fill, borderColor: border }]}>
              <Text style={[styles.stimText, { color: textColor }]}>{text}</Text>
            </View>
          </View>
          <View style={[styles.footer, { paddingBottom: bottomPad }]}>
            <Text style={styles.hint}>{hint}</Text>
            <Pressable onPress={abortTest} hitSlop={10} accessibilityRole="button">
              <Text style={styles.stop}>Stop the test</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  progressWrap: { paddingHorizontal: 30, paddingTop: 22, gap: 9 },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  count: { fontFamily: font.sans500, fontSize: 12, color: color.textDim45 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // `filter: blur(28px)` on the 230px glow — approximated with a large soft shadow so the
  // disc sits in light rather than on a hard-edged circle.
  glow: { position: 'absolute', width: 230, height: 230, borderRadius: 115, opacity: 0.75 },
  stim: { width: 186, height: 186, borderRadius: 93, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stimText: { fontFamily: font.serif, fontSize: 34 },
  footer: { paddingHorizontal: 30, paddingBottom: 0, alignItems: 'center', gap: 14 },
  hint: { fontFamily: font.sans500, fontSize: 13.5, color: color.textDim42 },
  stop: { fontFamily: font.sans500, fontSize: 13, color: color.textDim35 },
});
