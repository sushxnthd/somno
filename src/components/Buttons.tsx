import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassBackdrop } from './Glass';
import { CssGradient } from './CssGradient';
import { color, font, radius, shadow } from '../theme/tokens';
import { haptics } from '../theme/haptics';
import { motion } from '../theme/motion';
import { useReduceMotion } from '../theme/useReduceMotion';
import { Icon, type IconName } from './Icons';

interface BtnProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: any;
  /**
   * `light` is the design's standard CTA, `warm` the amber-tinted one it uses on the two
   * alarm-wake screens. Both are `linear-gradient(150deg, ...)`.
   */
  tone?: 'light' | 'warm';
  /** Height override — the design's CTAs are 56, 58 or 60px depending on the screen. */
  height?: number;
  /**
   * Leading icon, as the design's sign-in CTAs carry. Rendered in the label's own colour at the
   * design's 18px (primary) / 17px (secondary) with a 9px gap.
   */
  icon?: IconName;
}

/** `linear-gradient(150deg, rgba(255,255,255,.96), rgba(214,208,255,.86))` */
const CTA_LIGHT = ['rgba(255,255,255,0.96)', 'rgba(214,208,255,0.86)'] as const;
/** `linear-gradient(150deg, rgba(255,255,255,.97), rgba(255,226,196,.9))` */
const CTA_WARM = ['rgba(255,255,255,0.97)', 'rgba(255,226,196,0.9)'] as const;

export function PrimaryButton({ label, onPress, disabled, loading, style, tone = 'light', height = 58, icon }: BtnProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  const press = (to: number) => {
    if (reduceMotion) return;
    Animated.timing(scale, { toValue: to, duration: 200, easing: motion.press.easing, useNativeDriver: true }).start();
  };
  // The prototype's disabled CTA is NOT a faded white pill — it swaps to a flat, near-transparent
  // dark fill with dimmed label (`rgba(255,255,255,.07)` / `rgba(236,234,246,.3)`), which reads as
  // genuinely inert rather than as a washed-out enabled button.
  if (disabled) {
    return (
      <Pressable onPress={undefined} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: true }} style={style}>
        <View style={[styles.primary, { height, borderRadius: height / 2 }, styles.primaryDisabled]}>
          {icon && <Icon name={icon} size={18} color="rgba(236,234,246,0.3)" strokeWidth={1.7} />}
          <Text style={styles.primaryDisabledText}>{label}</Text>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptics.press();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => press(0.97)}
      onPressOut={() => press(1)}
      style={style}
    >
      {/* The design animates its CTA with `transition: transform .2s ease`; on touch the press is
          where that belongs, so the button gives slightly under the finger. */}
      <Animated.View style={{ transform: [{ scale }] }}>
        <CssGradient
          angle={150}
          colors={tone === 'warm' ? CTA_WARM : CTA_LIGHT}
          style={[styles.primary, { height, borderRadius: height / 2 }, shadow.button]}
        >
          {loading ? (
            <ActivityIndicator color={tone === 'warm' ? '#2A1A10' : color.ink} />
          ) : (
            <>
              {icon && <Icon name={icon} size={18} color={tone === 'warm' ? '#2A1A10' : color.ink} strokeWidth={1.7} />}
              <Text style={[styles.primaryText, tone === 'warm' && styles.primaryTextWarm]}>{label}</Text>
            </>
          )}
        </CssGradient>
      </Animated.View>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled, style, icon }: BtnProps) {
  return (
    <Pressable
      onPress={
        disabled
          ? undefined
          : () => {
              haptics.press();
              onPress?.();
            }
      }
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }, style]}
    >
      <View style={styles.secondaryWrap}>
        <GlassBackdrop intensity={20} />
        {icon && <Icon name={icon} size={17} color={color.text} strokeWidth={1.7} />}
        <Text style={styles.secondaryText}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, style }: BtnProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={style}>
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    height: 58,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryText: {
    fontFamily: font.sans700,
    fontSize: 16,
    color: color.ink,
  },
  primaryTextWarm: { color: '#2A1A10' },
  primaryDisabled: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  primaryDisabledText: {
    fontFamily: font.sans700,
    fontSize: 16,
    color: 'rgba(236,234,246,0.3)',
  },
  secondaryWrap: {
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: color.glassBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    overflow: 'hidden',
  },
  secondaryText: {
    fontFamily: font.sans700,
    fontSize: 15,
    color: color.text,
  },
  ghostText: {
    fontFamily: font.sans700,
    fontSize: 14,
    color: color.textDim45,
    textAlign: 'center',
  },
});
