import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { color, font } from '../theme/tokens';

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? color.chipOn : color.chipOff, borderColor: active ? 'transparent' : 'rgba(255,255,255,0.12)' },
      ]}
     accessibilityRole="button">
      <Text style={[styles.text, { color: active ? color.chipInkOn : color.chipInkOff }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, borderWidth: 1 },
  text: { fontFamily: font.sans600, fontSize: 13 },
});
