import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { color, font } from '../theme/tokens';
import { motion } from '../theme/motion';
import { useReduceMotion } from '../theme/useReduceMotion';

/**
 * The face-scan ring, layered exactly as the design builds it inside a 300px box:
 *   300px  radial bloom, blur(3px), `breathe 3.4s`
 *   246px  glass disc, rgba(255,255,255,.06) + 1px rim
 *   246px  1px ring running the `ripple 2.6s` keyframe (scale .7 -> 1.7, opacity .55 -> 0)
 *   290px  progress ring, r=46, 1.6px stroke
 *   centre 44px reading + "FACE SIGNAL"
 * plus a bright halo pair when the low-light assist is on.
 *
 * The ripple is the animation that tells the user the scan is live; without it the screen looked
 * frozen while the ring filled.
 */
export function ScanRing({ pct, lowLight, size = 300 }: { pct: number; lowLight?: boolean; size?: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const k = size / 300; // every measurement below is quoted against the design's 300px box

  const breathe = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    // Reduce Motion: the ring still fills, which is the actual progress signal — only the
    // decorative pulse and bloom stop.
    if (reduceMotion) {
      breathe.setValue(1);
      ripple.setValue(0);
      return;
    }
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1700, easing: motion.breathe.easing, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1700, easing: motion.breathe.easing, useNativeDriver: true }),
      ])
    );
    const p = Animated.loop(
      Animated.timing(ripple, {
        toValue: 1,
        duration: motion.ripple.duration,
        easing: motion.ripple.easing,
        useNativeDriver: true,
      })
    );
    b.start();
    p.start();
    return () => {
      b.stop();
      p.stop();
    };
  }, [breathe, ripple, reduceMotion]);

  const disc = 246 * k;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* bloom */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [motion.breathe.fromOpacity, 1] }),
          transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, motion.breathe.toScale] }) }],
        }}
      >
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            {/* `circle at 36% 30%` sizes to the farthest corner, so r is ~95% of the box. */}
            <RadialGradient id="scanBloom" cx="36%" cy="30%" r="95%">
              <Stop offset="0" stopColor="#BEACFF" stopOpacity={0.75} />
              <Stop offset="0.46" stopColor="#6C56E8" stopOpacity={0.42} />
              <Stop offset="0.72" stopColor="#1E1646" stopOpacity={0.2} />
              <Stop offset="0.78" stopColor="#1E1646" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#scanBloom)" />
        </Svg>
      </Animated.View>

      {lowLight && (
        <>
          <View style={[styles.lowLightHalo, { width: 326 * k, height: 326 * k, borderRadius: (326 * k) / 2 }]} />
          <View
            style={[
              styles.lowLightRing,
              { width: 314 * k, height: 314 * k, borderRadius: (314 * k) / 2, borderWidth: 14 * k },
            ]}
          />
        </>
      )}

      <View style={[styles.disc, { width: disc, height: disc, borderRadius: disc / 2 }]} />

      {/* ripple */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.rippleRing,
          {
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            opacity: ripple.interpolate({ inputRange: [0, 1], outputRange: [motion.ripple.fromOpacity, 0] }),
            transform: [
              {
                scale: ripple.interpolate({
                  inputRange: [0, 1],
                  outputRange: [motion.ripple.fromScale, motion.ripple.toScale],
                }),
              },
            ],
          },
        ]}
      />

      <Svg width={290 * k} height={290 * k} viewBox="0 0 100 100" style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={50} cy={50} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1.6} />
        <Circle cx={50} cy={50} r={r} fill="none" stroke="#D8CCFF" strokeWidth={1.6} strokeLinecap="round" strokeDasharray={`${dash} ${c}`} />
      </Svg>

      <View style={styles.center} pointerEvents="none">
        <Text style={styles.pct}>{pct}%</Text>
        <Text style={styles.tag}>FACE SIGNAL</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  rippleRing: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  lowLightHalo: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.14)' },
  lowLightRing: { position: 'absolute', borderColor: 'rgba(255,255,255,0.16)' },
  center: { alignItems: 'center', gap: 6 },
  pct: { fontFamily: font.sans600, fontSize: 44, color: color.text, letterSpacing: -0.88 }, // 600 44px, -.02em
  tag: { fontFamily: font.sans500, fontSize: 11.5, color: color.textDim50, letterSpacing: 0.92 }, // .08em
});
