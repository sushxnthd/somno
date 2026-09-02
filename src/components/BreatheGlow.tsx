import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useReduceMotion } from '../theme/useReduceMotion';

/**
 * A soft, slowly breathing radial glow — NOT one of the conic blobs. The Recalibrate screen is the
 * one hero orb in the design that is a plain radial gradient:
 *   radial-gradient(circle at 36% 30%, rgba(190,172,255,.75), rgba(108,86,232,.35) 48%, transparent 74%)
 *   animation: breathe 5s ease-in-out infinite   -> scale 1 -> 1.05, opacity .85 -> 1
 * Substituting an AmbientBlob there produced a spinning multi-hue orb where the design has a still,
 * single-hue violet bloom.
 */
export function BreatheGlow({ size, durationMs = 5000 }: { size: number; durationMs?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      t.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: durationMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: durationMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t, durationMs, reduceMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          {/* `circle at 36% 30%` — the offset centre is what gives the bloom its top-left lift. */}
          <RadialGradient id="breatheGlow" cx="36%" cy="30%" r="95%">
            <Stop offset="0" stopColor="#BEACFF" stopOpacity={0.75} />
            <Stop offset="0.48" stopColor="#6C56E8" stopOpacity={0.35} />
            <Stop offset="1" stopColor="#6C56E8" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#breatheGlow)" />
      </Svg>
    </Animated.View>
  );
}
