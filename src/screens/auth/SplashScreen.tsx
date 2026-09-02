import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer, AmbientBlob, GlassOrb } from '../../components';
import { Icon } from '../../components/Icons';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';

export function SplashScreen() {
  const go = useSomnoStore((s) => s.go);

  useEffect(() => {
    const t = setTimeout(() => go('AU1'), 1900);
    return () => clearTimeout(t);
  }, [go]);

  return (
    <ScreenContainer entry={false}>
      <View style={styles.center}>
        <View style={styles.orbWrap}>
          {/* source: inset:0 of a 210px box, from 200deg, blur(36px) saturate(180%), .62, 18s */}
          <AmbientBlob size={210} fromDeg={200} blurPx={36} saturate={1.8} opacity={0.62} durationMs={18000} />
          <GlassOrb size={182} highlight={0.45} borderAlpha={0.2}>
            <Icon name="moon" size={52} color="#FFFFFF" strokeWidth={2.4} />
          </GlassOrb>
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.wordmark}>S O M N O</Text>
          <Text style={styles.tagline}>ALERTNESS, MEASURED</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26 },
  orbWrap: { width: 210, height: 210, alignItems: 'center', justifyContent: 'center' },
  textWrap: { alignItems: 'center', gap: 8 },
  wordmark: { fontFamily: font.sans700, fontSize: 25, color: color.text, letterSpacing: 6 },
  tagline: { fontFamily: font.sans500, fontSize: 12.5, color: color.textDim45, letterSpacing: 2 },
});
