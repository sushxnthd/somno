import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, View, ViewStyle } from 'react-native';
import { motion } from '../theme/motion';

/**
 * The design's `screenin` entry animation, which 35 of its 41 screens carry:
 *   from { opacity: 0; transform: translateY(10px) scale(.994) } to { opacity: 1; transform: none }
 *   .42s cubic-bezier(.22,1,.36,1) both
 *
 * Without it the app cut between screens instantly, which is the single biggest difference in how
 * it *feels* against the mockup — the design settles into every screen rather than snapping.
 *
 * The six screens the design leaves un-animated (Splash, the sign-in chooser, the calibration
 * intro, the live tap test, the baseline summary and the scan-failed state) opt out, because each
 * either fades in from something else or must not move while the user is reacting to it.
 */
export function ScreenIn({
  children,
  style,
  enabled = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  enabled?: boolean;
}) {
  const t = useRef(new Animated.Value(enabled ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) return;
    const a = Animated.timing(t, {
      toValue: 1,
      duration: motion.screenIn.duration,
      easing: motion.screenIn.easing,
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [t, enabled]);

  // Still render the wrapper when disabled: it carries the container's flex and top padding, and
  // dropping it collapsed the layout on the six opted-out screens.
  if (!enabled) return <View style={style}>{children}</View>;

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [motion.screenIn.fromY, 0] }) },
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [motion.screenIn.fromScale, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * `popin .5s cubic-bezier(.22,1,.36,1) both` — opacity 0->1, scale .92->1.
 * The design uses it on the check-in result's score, so the number lands rather than appears.
 */
export function PopIn({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(t, {
      toValue: 1,
      duration: motion.popIn.duration,
      easing: motion.popIn.easing,
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [t]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [motion.popIn.fromScale, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * `rise .25s ease` — opacity 0->1, translateY 8->0. The design runs it on each lesson-assistant
 * message as it appears, so replies slide up into the thread instead of popping in.
 */
export function Rise({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(t, {
      toValue: 1,
      duration: motion.rise.duration,
      easing: motion.rise.easing,
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [t]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [motion.rise.fromY, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
