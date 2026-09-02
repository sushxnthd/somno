import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { AmbientBlob, GlassOrb } from './AmbientBlob';
import { AnimatedNumber } from './AnimatedNumber';
import { color, font, displayNumeral } from '../theme/tokens';
import { motion } from '../theme/motion';
import { useReduceMotion } from '../theme/useReduceMotion';

interface Props {
  /** The score, or null when no check-in has ever been made. */
  value: number | null;
  word: string;
  deltaLabel: string;
  size?: number;
  onPress?: () => void;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function SDIGauge({ value, word, deltaLabel, size = 238, onPress }: Props) {
  // A brand-new install has no score. The app used to seed 72 here — a plausible, confident,
  // entirely invented number in the largest type on the home screen, above an equally invented
  // "+8 vs your weekly average". The ring reads empty and the numeral reads a dash until there is
  // a check-in to draw.
  const hasReading = value != null;
  const shown = value ?? 0;
  const stroke = 4.4;
  const r = 45;
  const c = 2 * Math.PI * r;
  const reduceMotion = useReduceMotion();
  // The ring sweeps to the new score alongside the numeral counting to it, so the two read as one
  // movement rather than a label change next to a redrawn arc.
  const sweep = useRef(new Animated.Value((shown / 100) * c)).current;
  useEffect(() => {
    const target = (shown / 100) * c;
    if (reduceMotion) {
      sweep.setValue(target);
      return;
    }
    // The one animation left on the JS driver, deliberately. `strokeDasharray` is not a property
    // the native driver can carry, and the alternatives — a rotating mask, or a stack of shutters —
    // need either an SVG mask or an opaque background, and this arc sits over the blob. What it
    // costs is one prop update on a single path, once, for 900ms; the things that made this screen
    // stutter were the blob's per-frame RenderScript blur and four numerals re-rendering at 60Hz,
    // and both of those are gone.
    Animated.timing(sweep, { toValue: target, duration: 900, easing: motion.carousel.easing, useNativeDriver: false }).start();
  }, [shown, c, sweep, reduceMotion]);
  const dash = sweep.interpolate({ inputRange: [0, c], outputRange: [`0 ${c}`, `${c} ${c}`] });
  return (
    // The source reserves a fixed 272px-tall, full-width band for the gauge — taller than the
    // 260px blob it holds. Sizing this block to the blob instead shortened the column by 12px and
    // pulled everything below it (sleep debt, quick actions, insight) up off its mark.
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hasReading ? `Sleep Deprivation Index ${shown}, ${word}. ${deltaLabel}` : `Sleep Deprivation Index, no reading yet. ${deltaLabel}`}
      accessibilityHint="Opens an explanation of the score"
      style={{ width: '100%', height: 272, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* source: 260x260, conic from 200deg, blur(34px) saturate(150%), opacity .5, swirl 18s */}
      <AmbientBlob size={size + 22} fromDeg={200} blurPx={34} saturate={1.5} opacity={0.5} durationMs={18000} />
      <GlassOrb size={size} highlight={0.34} borderAlpha={0.16} breatheMs={6000}>
        {/* The ring svg is 252px in the source, deliberately larger than the 238px glass disc it
            sits on, so the progress arc rides just outside the disc edge. */}
        <Svg width={size * 1.059} height={size * 1.059} viewBox="0 0 100 100" style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Defs>
            <LinearGradient id="sdiring" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={color.amber} />
              <Stop offset="0.45" stopColor={color.lilac} />
              <Stop offset="1" stopColor={color.violet} />
            </LinearGradient>
          </Defs>
          <Circle cx={50} cy={50} r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={2.6} />
          <AnimatedCircle
            cx={50}
            cy={50}
            r={r}
            fill="none"
            stroke="url(#sdiring)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={dash as unknown as string}
          />
        </Svg>
        <View style={styles.center}>
          <Text style={styles.sdiLabel}>SDI</Text>
          {/* Counts to the new score rather than swapping the label. */}
          {hasReading ? (
            <AnimatedNumber value={shown} style={styles.sdiValue} />
          ) : (
            <Text style={styles.sdiValue}>—</Text>
          )}
          <Text style={styles.sdiWord}>{word}</Text>
          <Text style={styles.sdiDelta} numberOfLines={2}>{deltaLabel}</Text>
        </View>
      </GlassOrb>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    width: 150,
    gap: 1, // source: `gap:1px` on the centred column
  },
  sdiLabel: {
    fontFamily: font.sans700,
    fontSize: 10,
    letterSpacing: 2.2, // .22em
    color: color.textDim50,
  },
  sdiValue: {
    fontFamily: font.sans700,
    ...displayNumeral(88),
    color: color.text,
    letterSpacing: -4.84, // -.055em
  },
  sdiWord: {
    marginTop: 5,
    fontFamily: font.sans700,
    fontSize: 11.5,
    letterSpacing: 0.46, // .04em
    color: color.textDim70,
  },
  sdiDelta: {
    fontFamily: font.sans500,
    fontSize: 10.5,
    lineHeight: 14.2, // 10.5px/1.35
    color: color.textDim42,
    textAlign: 'center',
  },
});
