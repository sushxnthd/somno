import React, { useEffect, useRef, useState } from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { motion } from '../theme/motion';
import { useReduceMotion } from '../theme/useReduceMotion';

/**
 * A numeral that counts to its new value instead of cutting to it.
 *
 * The design is static markup, so its scores simply appear. In the running app these numbers are
 * the result the user just waited through a test for — an SDI score, a reaction-time baseline, a
 * debt figure — and counting them up reads as the app arriving at an answer rather than swapping
 * out a label. It also draws the eye to the one thing on screen that changed.
 *
 * Under Reduce Motion, and on first mount, the value is simply shown.
 */
export function AnimatedNumber({
  value,
  style,
  decimals = 0,
  suffix = '',
  durationMs = 900,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  decimals?: number;
  suffix?: string;
  durationMs?: number;
}) {
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState(() => value.toFixed(decimals));
  const from = useRef(value);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** The last string actually rendered, so a tick that would not change it can be dropped. */
  const shownRef = useRef(value.toFixed(decimals));

  useEffect(() => {
    if (reduceMotion || from.current === value) {
      from.current = value;
      setShown(value.toFixed(decimals));
      return;
    }
    const start = Date.now();
    const a = from.current;
    const b = value;
    from.current = value;
    if (timer.current) clearInterval(timer.current);

    // 30Hz, not 60. The output is text, so this cannot use the animation driver — every tick is a
    // React render on the JS thread, and there are three or four of these on the home screen at
    // once. A numeral changing thirty times a second is already faster than anyone can read; the
    // second thirty renders bought nothing and competed with the entrance animations for the frame.
    let last = shownRef.current;
    timer.current = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      // Same ease-out shape as the rest of the app's motion, so the count decelerates into place.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = (a + (b - a) * eased).toFixed(decimals);
      // And skip the render entirely when the digits have not changed, which for an integer
      // counting through a small range is most ticks.
      if (next !== last) {
        last = next;
        shownRef.current = next;
        setShown(next);
      }
      if (t >= 1 && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }, 33);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [value, durationMs, decimals, reduceMotion]);

  return (
    <Text style={style} accessibilityLiveRegion="polite">
      {shown}
      {suffix}
    </Text>
  );
}

/** Shared easing note: `motion` is imported so the timing constants stay in one place. */
export const NUMBER_EASE = motion.popIn.easing;
