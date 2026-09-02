// Small shared building blocks reused across the settings (F*) screens only.
// Lives under src/screens/settings/, not src/components/, per the settings-agent's ground rules.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg from 'react-native-svg';
import { BackChevron } from '../../components/TopBar';
import { color, font } from '../../theme/tokens';

export function SettingsHeader({ title, onBack, right, serif }: { title: string; onBack: () => void; right?: React.ReactNode; serif?: boolean }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <BackChevron onPress={onBack} />
        <Text style={serif ? styles.headerTitleSerif : styles.headerTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function GroupCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

/** One-off inline icon glyph, matching the prototype's raw SVG shapes exactly (kept local to
 * settings screens rather than growing the shared Icons.tsx set with settings-only shapes).
 * `children` are react-native-svg elements (Path/Rect/Circle) at viewBox "0 0 24 24". */
export function RowIcon({ children, bg, fg = color.textDim70, size = 28 }: { children: React.ReactNode; bg?: string; fg?: string; size?: number }) {
  return (
    <View style={[styles.iconWrap, { width: size, height: size, borderRadius: size * 0.36 }, bg ? { backgroundColor: bg } : null]}>
      <Svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </Svg>
    </View>
  );
}

export function Row({ icon, label, trailing, onPress, last }: { icon?: React.ReactNode; label: string; trailing?: React.ReactNode; onPress?: () => void; last?: boolean }) {
  return (
    // The design lifts a row to rgba(255,255,255,.05) on hover; that is its press state on touch.
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.rowPressed]} accessibilityRole="button">
      {icon}
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      {trailing ?? <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontFamily: font.sans700, fontSize: 17, color: color.text },
  headerTitleSerif: { fontFamily: font.serif, fontSize: 26, lineHeight: 31.2, color: color.text }, // 26px/1.2
  section: {
    fontFamily: font.sans600,
    fontSize: 10.5,
    color: color.textDim40,
    letterSpacing: 1.6,
    paddingLeft: 6,
  },
  group: {
    backgroundColor: color.glassFillFaint,
    borderWidth: 1,
    borderColor: color.glassBorder12,
    borderRadius: 22,
    overflow: 'hidden',
  },
  iconWrap: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15, // source: `padding:15px 16px`
    paddingHorizontal: 16,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  rowLabel: { flex: 1, fontFamily: font.sans500, fontSize: 14, color: color.text },
  rowMeta: { fontFamily: font.sans500, fontSize: 12, color: color.textDim40 },
  chevron: { fontSize: 15, color: color.textDim35 },
});
