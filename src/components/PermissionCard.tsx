import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from './GlassCard';
import { Icon, IconName } from './Icons';
import { color, font } from '../theme/tokens';
import type { PermState } from '../store/types';

interface Props {
  icon: IconName;
  title: string;
  body: string;
  state: PermState;
  optional?: boolean;
  onPress: () => void;
  iconBg?: [string, string];
  /** Onboarding's A3 cards are 16px; Settings' F2 cards are 15px. */
  pad?: number;
  /**
   * Settings' permission rows are a notch smaller than onboarding's in the design: 14/11.5/11.5px
   * against 14.5/12/12px, and the body there has no explicit line-height.
   */
  compact?: boolean;
}

const LABELS: Record<PermState, string> = { granted: 'Granted', denied: 'Denied', skip: 'Skipped', ask: 'Allow' };

export function PermissionCard({ icon, title, body, state, optional, onPress, iconBg, pad = 16, compact }: Props) {
  const label = LABELS[state];
  const isAsk = state === 'ask';
  return (
    <GlassCard variant="strong" radiusSize={22} pad={pad} style={{ marginBottom: 0 }}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, iconBg && { backgroundColor: iconBg[0] }]}>
          <Icon name={icon} size={19} color={color.ink3} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, compact && styles.titleCompact]}>
            {title} {optional && <Text style={styles.optional}>optional</Text>}
          </Text>
          <Text style={[styles.body, compact && styles.bodyCompact]}>{body}</Text>
        </View>
        <Pressable
          onPress={onPress}
          style={[
            styles.pill,
            { backgroundColor: state === 'granted' ? 'rgba(138,123,255,0.28)' : isAsk ? 'rgba(236,234,246,0.95)' : 'rgba(255,255,255,0.07)' },
          ]}
         accessibilityRole="button">
          <Text style={[styles.pillText, compact && styles.pillTextCompact, { color: isAsk ? color.ink : color.textDim70 }]}>{label}</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 0 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(178,160,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: font.sans700, fontSize: 14.5, color: color.text },
  titleCompact: { fontSize: 14 },
  optional: { fontFamily: font.sans500, fontSize: 11, color: color.textDim40 },
  body: { marginTop: 2, fontFamily: font.sans500, fontSize: 12, lineHeight: 16.8, color: color.textDim45 }, // 12px/1.4
  bodyCompact: { fontSize: 11.5, lineHeight: undefined },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  pillText: { fontFamily: font.sans600, fontSize: 12 },
  pillTextCompact: { fontSize: 11.5 },
});
