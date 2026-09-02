import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme/tokens';
import { fmt, mod } from '../utils/format';
import { Icon } from './Icons';

interface Props {
  label: string;
  minutes: number;
  step?: number;
  is24h?: boolean;
  onChange: (m: number) => void;
}

/** Vertical 3-row time picker (prev/current/next) with +/- steppers, replacing the prototype's
 * mouse-wheel-driven "wheelRows" column (A4 bedtime/wake/ideal-wake pickers). */
export function TimeWheel({ label, minutes, step = 15, is24h = false, onChange }: Props) {
  const rows = [-1, 0, 1].map((d) => mod(minutes + d * step, 1440));
  return (
    <View style={styles.col}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.wheel}>
        {rows.map((v, i) => (
          <Pressable key={i} style={styles.row} onPress={() => onChange(v)} accessibilityRole="button">
            <Text style={[styles.rowText, i === 1 ? styles.rowActive : styles.rowInactive]}>{fmt(v, is24h)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.steppers}>
        <Pressable style={styles.stepBtn} onPress={() => onChange(mod(minutes - step, 1440))} accessibilityRole="button">
          <Icon name="minus" size={14} color={color.textDim70} strokeWidth={2} />
        </Pressable>
        <Pressable style={styles.stepBtn} onPress={() => onChange(mod(minutes + step, 1440))} accessibilityRole="button">
          <Icon name="plus" size={14} color={color.textDim70} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { flex: 1, alignItems: 'center', gap: 8 },
  label: { fontFamily: font.sans700, fontSize: 11, letterSpacing: 1, color: color.textDim50 },
  wheel: { width: '100%', height: 132, justifyContent: 'center' },
  row: { height: 44, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontFamily: font.sans700 },
  rowActive: { fontSize: 21, color: color.text },
  rowInactive: { fontSize: 14, fontFamily: font.sans500, color: 'rgba(236,234,246,0.4)' },
  steppers: { flexDirection: 'row', gap: 8 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
