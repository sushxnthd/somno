import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { motion } from '../theme/motion';

/**
 * A bar fill that animates to its new width instead of jumping, matching the design's
 * `transition: width .3s ease` on the tap-test progress bar.
 *
 * Driven by `scaleX` on the native driver rather than by an animated percentage width. A width is a
 * layout property: every frame of it goes through the JS thread and re-runs layout for the subtree,
 * which is why the tap-test bar stuttered on exactly the screen where the user is being timed. A
 * scale is a transform, so the whole animation runs on the UI thread and cannot be starved.
 *
 * Scaling happens about the view's centre, so the bar is pinned to its left edge by translating it
 * back by half of what the scale removed — the standard stand-in for the `transform-origin` that
 * React Native does not have.
 */
export function ProgressFill({
  pct,
  colors,
  height,
  radius,
  durationMs = motion.progressBar.duration,
  style,
}: {
  pct: number;
  colors: [string, string];
  height: number;
  radius: number;
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useRef(new Animated.Value(Math.max(0, Math.min(1, pct / 100)))).current;
  // The track's width, needed to convert a scale into the left-anchoring offset. Until the first
  // layout the bar renders at zero, which is where every one of these starts anyway.
  const [trackW, setTrackW] = useState(0);

  useEffect(() => {
    Animated.timing(t, {
      toValue: Math.max(0, Math.min(1, pct / 100)),
      duration: durationMs,
      easing: motion.progressBar.easing,
      useNativeDriver: true,
    }).start();
  }, [pct, t, durationMs]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w && Math.abs(w - trackW) > 0.5) setTrackW(w);
  };

  return (
    <View style={[{ height, borderRadius: radius, overflow: 'hidden' }, style]} onLayout={onLayout}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-trackW / 2, 0] }) },
              { scaleX: t },
            ],
          },
        ]}
      >
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: radius }} />
      </Animated.View>
    </View>
  );
}
