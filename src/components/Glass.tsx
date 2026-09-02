import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

/**
 * The backdrop layer under the app's glass surfaces.
 *
 * The design puts `backdrop-filter: blur(N)` on every card, the tab bar and the sheet. That is
 * real on iOS and on the web. On Android it is not: `expo-blur`'s `blurMethod` defaults to `none`,
 * and the only way to get an actual blur is `dimezisBlurView` plus a `blurTarget`, which renders
 * the content behind into a bitmap and blurs it *every frame the content changes*. Under a tab bar
 * pinned over a scrolling list, that is the most expensive thing on the screen.
 *
 * So on Android the app draws what `expo-blur` would have drawn anyway — its own fallback tint —
 * as a plain view, without mounting a native blur view per card that can never blur. Same pixels,
 * one fewer native view on every glass surface in the app, and no route by which a future default
 * flips a hundred cards onto a per-frame bitmap blur without anyone noticing.
 *
 * The visual loss on Android is small by construction: what sits behind these surfaces is a
 * near-black field, and blurring a near-uniform field returns it unchanged. It shows only where a
 * card overlaps an ambient blob, and there the blob is already a 30–60px Gaussian.
 */

/** `expo-blur`'s own dark-tint fallback, reproduced so the two platforms agree. */
const darkTint = (intensity: number) => `rgba(25,25,25,${(intensity / 100) * 0.78})`;

export function GlassBackdrop({
  intensity,
  style,
  ...rest
}: { intensity: number } & ViewProps) {
  if (Platform.OS === 'android') {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: darkTint(intensity) }, style]} {...rest} />;
  }
  return <BlurView intensity={intensity} tint="dark" style={[StyleSheet.absoluteFill, style]} {...rest} />;
}
