import React, { PropsWithChildren, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { color, layout } from '../theme/tokens';
import { ScreenIn } from './ScreenIn';
import { useReduceMotion } from '../theme/useReduceMotion';

const AnimatedView = Animated.View;

/**
 * Full-bleed dark canvas behind every screen, including the app-wide ambient wash the prototype
 * paints onto its phone frame:
 *   background: #08070E
 *   + radial-gradient(120% 55% at 18% -5%,  rgba(122,92,255,.38), transparent 62%)
 *   + radial-gradient(100% 50% at 95% 105%, rgba(255,150,90,.16), transparent 62%)
 *   animation: drift 16s ease-in-out infinite
 * Without this the app reads as flat black while the mockup has a subtle violet-to-warm depth on
 * every single screen — it's the highest-leverage difference between the two.
 */
interface ContainerProps extends PropsWithChildren {
  /** Set false on the six screens the design deliberately leaves without an entry animation. */
  entry?: boolean;
}

export function ScreenContainer({ children, entry = true }: ContainerProps) {
  const drift = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  // The prototype reserves a fixed 30px status-bar strip at the top of its phone frame, and every
  // screen's layout is measured from below it. A device's real safe-area inset can be larger (a
  // notched iPhone is ~47-59pt) or smaller (Android ~24pt), so we top up to the design's 30px
  // floor and let a larger physical inset win when the hardware demands it. Screens already wrap
  // in SafeAreaView, which contributes `insets.top`; this adds only the remainder, so the total is
  // exactly max(insets.top, 30) — matching the mockup 1:1 wherever the hardware allows.
  const topUp = Math.max(0, layout.statusBarHeight - insets.top);

  useEffect(() => {
    if (reduceMotion) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 8000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 8000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reduceMotion]);

  // Mirrors the CSS keyframe: translate3d(6%,-4%) + scale(1.12) at the midpoint.
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 22] });
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -16] });
  const scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  return (
    <View style={styles.root}>
      <AnimatedView
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transform: [{ translateX }, { translateY }, { scale }] }]}
      >
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            {/* A RadialGradient's cx/cy/rx/ry are in the *painted shape's* bounding box, not the
                viewport — so the CSS `at 18% -5%` position belongs on the <Ellipse> geometry and
                the gradient itself must stay centred (50%/50%) and fill it (rx/ry 50%). Putting
                the CSS percentages on the gradient instead pushed its centre far off-canvas and
                the whole wash rendered as nothing, leaving every screen flat black. */}
            <RadialGradient id="ambientViolet" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#7A5CFF" stopOpacity={0.38} />
              <Stop offset="0.62" stopColor="#7A5CFF" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="ambientWarm" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#FF965A" stopOpacity={0.16} />
              <Stop offset="0.62" stopColor="#FF965A" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="18" cy="-5" rx="120" ry="55" fill="url(#ambientViolet)" />
          <Ellipse cx="95" cy="105" rx="100" ry="50" fill="url(#ambientWarm)" />
        </Svg>
      </AnimatedView>
      {/* The entry animation belongs to the screen's content, not to the frame: in the design
          the ambient wash lives on the phone frame and stays put while the screen slides in. */}
      <ScreenIn enabled={entry && !reduceMotion} style={[styles.content, { paddingTop: topUp }]}>
        {children}
      </ScreenIn>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bgFrame,
  },
  content: { flex: 1 },
});
