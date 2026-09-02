import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { color } from '../theme/tokens';
import { motion } from '../theme/motion';
import { haptics } from '../theme/haptics';
import { useReduceMotion } from '../theme/useReduceMotion';

const TRACK_W = 48;
const TRACK_H = 28;
const PAD = 3;
const KNOB = TRACK_H - PAD * 2;
const TRAVEL = TRACK_W - PAD * 2 - KNOB;

/**
 * The knob slides and the track crossfades rather than snapping between states, on the design's
 * own easing. A switch that jumps reads as a redraw; one that travels reads as a thing being
 * moved, and it also makes the state change legible when the toggle is under your thumb.
 */
export function Toggle({
  value,
  onToggle,
  label,
  interactive = true,
}: {
  value: boolean;
  onToggle: () => void;
  /** Spoken name for screen readers, e.g. "Smart Wake". */
  label?: string;
  /**
   * Whether this switch handles its own taps.
   *
   * Set false when the switch sits inside a settings row whose whole width already toggles it.
   * Nesting a Pressable inside a Pressable that runs the *same* handler fires it twice on any
   * platform where events bubble — react-native-web is one — so tapping the switch itself flipped
   * the setting and flipped it straight back, and the one control users actually aim at was the
   * only part of the row that did nothing. Non-interactive means one handler, on the row, and the
   * row carries the switch role for screen readers.
   */
  interactive?: boolean;
}) {
  const t = useRef(new Animated.Value(value ? 1 : 0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      t.setValue(value ? 1 : 0);
      return;
    }
    Animated.timing(t, {
      toValue: value ? 1 : 0,
      duration: motion.tabIndicator.duration,
      easing: motion.tabIndicator.easing,
      // Native, which means the whole toggle animates on the UI thread and stays smooth even while
      // the screen behind it is doing something expensive. `backgroundColor` is what used to force
      // this onto the JS driver; the track is now two stacked fills cross-faded by opacity, which
      // is a property the driver can carry, and the knob's translate rides the same value.
      useNativeDriver: true,
    }).start();
  }, [value, t, reduceMotion]);

  const track = (
    <View style={[styles.track, { backgroundColor: color.toggleOff }]}>
        {/* The "on" fill sits on top of the "off" one and fades in. Two flat fills crossfading is
            indistinguishable from interpolating the colour, and unlike the colour it can leave the
            JS thread. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: TRACK_H / 2, backgroundColor: color.toggleOn, opacity: t }]}
        />
      <Animated.View
        style={[styles.knob, { transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) }] }]}
      />
    </View>
  );

  // Rendered as scenery: the parent row owns both the tap and the switch role.
  if (!interactive) return <View pointerEvents="none">{track}</View>;

  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onToggle();
      }}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
    >
      {track}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    padding: PAD,
    flexDirection: 'row',
    alignItems: 'center',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#ECEAF6',
  },
});
