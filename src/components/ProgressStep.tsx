import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme/tokens';

/** Thin onboarding progress bar with "Step N of 9" caption (prototype screens A2-A9). */
export function ProgressStep({ step, total = 9, showLabel = true }: { step: number; total?: number; showLabel?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 26, paddingTop: 16 }}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(step / total) * 100}%` }]} />
      </View>
      {showLabel && <Text style={styles.label}>Step {step} of {total}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: color.violet,
  },
  label: {
    marginTop: 9,
    fontFamily: font.sans500,
    fontSize: 11,
    color: color.textDim45,
  },
});
