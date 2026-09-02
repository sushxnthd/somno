import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color, font } from '../theme/tokens';

interface Props {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  skip?: () => void;
}

export function BackChevron({ onPress, opacity = 0.6 }: { onPress?: () => void; opacity?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ opacity }}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color.text} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <Path d="m15 5-7 7 7 7" />
      </Svg>
    </Pressable>
  );
}

export function TopBar({ title, onBack, right, skip }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.side}>{onBack ? <BackChevron onPress={onBack} /> : null}</View>
      {title ? <Text style={styles.title}>{title}</Text> : <View style={{ flex: 1 }} />}
      <View style={[styles.side, { alignItems: 'flex-end' }]}>
        {right}
        {skip ? (
          <Pressable onPress={skip} hitSlop={8} accessibilityRole="button" accessibilityLabel="Skip">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  side: { minWidth: 24 },
  title: { flex: 1, fontFamily: font.sans700, fontSize: 16, color: color.text, textAlign: 'center' },
  skip: { fontFamily: font.sans500, fontSize: 14, color: color.textDim50 },
});
