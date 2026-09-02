import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { font } from '../theme/tokens';

interface Props {
  label: string;
  value: number; // 0-100
  color: string;
  /** Direction of travel. '→' when there is nothing to compare against yet. */
  arrow: '↗' | '↘' | '→';
  arrowColor: string;
  onPress?: () => void;
}

/** Small ring + value used in Home's "Duration / Quality / Habits" mini-stat row. */
export function MiniDonut({ label, value, color, arrow, arrowColor, onPress }: Props) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value} out of 100`}
      // The design lifts these tiles to rgba(255,255,255,.06) on hover; on touch that is the
      // press state.
      style={({ pressed }) => [styles.wrap, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]}
    >
      <Text style={styles.label}>{label} ›</Text>
      <View style={styles.row}>
        <Svg width={20} height={20} viewBox="0 0 22 22" style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={11} cy={11} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={2.2} />
          <Circle cx={11} cy={11} r={r} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeDasharray={`${dash} ${c}`} />
        </Svg>
        <Text style={styles.value}>{value}</Text>
        <Text style={[styles.arrow, { color: arrowColor }]}>{arrow}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 7 },
  label: { fontFamily: font.sans600, fontSize: 12.5, color: 'rgba(236,234,246,0.5)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  value: { fontFamily: font.sans700, fontSize: 20, color: '#ECEAF6', letterSpacing: -0.4 },
  arrow: { fontFamily: font.sans600, fontSize: 13 },
});
