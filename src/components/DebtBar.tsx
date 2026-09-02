import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { font } from '../theme/tokens';

export function DebtBar({ label, pct, hours, grad }: { label: string; pct: number; hours: string; grad: readonly [string, string] }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <LinearGradient colors={grad as unknown as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.hours}>{hours}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { width: 42, fontFamily: font.sans500, fontSize: 10.5, color: 'rgba(236,234,246,0.45)' },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },
  hours: { width: 30, textAlign: 'right', fontFamily: font.sans500, fontSize: 10.5, color: 'rgba(236,234,246,0.45)' },
});
