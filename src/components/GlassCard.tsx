import React, { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { GlassBackdrop } from './Glass';
import { CssGradient } from './CssGradient';
import { color, radius } from '../theme/tokens';

interface GlassCardProps extends PropsWithChildren {
  style?: ViewStyle | ViewStyle[];
  variant?: 'strong' | 'soft' | 'faint' | 'deep';
  radiusSize?: number;
  onPress?: () => void;
  noBorder?: boolean;
  /** Inner padding. The design does NOT use one value everywhere — it runs 14px on the tight list
   * cards up to 22px on the hero cards — and a single hardcoded 18px made several cards 8px too
   * tall each, which compounded down every scrolling screen. */
  pad?: number;
}

const VARIANT_GRADIENT: Record<string, [string, string]> = {
  strong: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.04)'],
  soft: ['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.035)'],
  faint: ['rgba(255,255,255,0.055)', 'rgba(255,255,255,0.055)'],
  deep: ['rgba(10,9,18,0.55)', 'rgba(10,9,18,0.55)'],
};

export function GlassCard({ children, style, variant = 'strong', radiusSize = radius.xxl, noBorder, pad = 18 }: GlassCardProps) {
  const colors = VARIANT_GRADIENT[variant];
  return (
    <View style={[{ borderRadius: radiusSize, overflow: 'hidden' }, style]}>
      <GlassBackdrop intensity={28} />
      {/* Every card fill in the design is `linear-gradient(160deg, ...)`. The angle resolves
          against the card's own aspect ratio, which a fixed start/end pair cannot do. */}
      <CssGradient angle={160} colors={colors} style={StyleSheet.absoluteFill} />
      <View
        style={[
          { padding: pad, borderRadius: radiusSize },
          !noBorder && { borderWidth: 1, borderColor: variant === 'faint' ? color.glassBorder12 : color.glassBorder },
        ]}
      >
        {children}
      </View>
    </View>
  );
}
