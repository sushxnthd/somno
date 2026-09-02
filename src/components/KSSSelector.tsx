import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, font } from '../theme/tokens';
import { kssWords } from '../data/content';

export function KSSSelector({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="How sleepy do you feel right now">
      {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
        const active = value === n;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityLabel={`${n}, ${kssWords[n - 1]}`}
            accessibilityState={{ selected: active }}
            style={styles.cellWrap}
          >
            {active ? (
              <LinearGradient colors={['#F1EEFF', '#C9BCFF']} style={styles.cell}>
                <Text style={[styles.num, { color: '#150F2C' }]}>{n}</Text>
              </LinearGradient>
            ) : (
              <View style={[styles.cell, styles.cellInactive]}>
                <Text style={[styles.num, { color: color.textDim70 }]}>{n}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  cellWrap: { width: '28%' },
  cell: { height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cellInactive: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  num: { fontFamily: font.sans700, fontSize: 18 },
});
