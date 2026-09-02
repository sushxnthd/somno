import React, { useState } from 'react';
import { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient, LinearGradientProps } from 'expo-linear-gradient';

/**
 * Converts a CSS `linear-gradient(Ndeg, ...)` angle into the start/end points expo-linear-gradient
 * wants, for a box of the given size.
 *
 * CSS measures the angle clockwise from "to top", and the gradient line is sized so the gradient
 * covers the whole box — which means the endpoints depend on the box's aspect ratio, not just the
 * angle. Hand-picked start/end pairs like {0.2,0}->{0.8,1} only happen to look right on a square;
 * on a 342x58 button the design's 150deg is far closer to vertical than that, and on a tall card
 * far closer to horizontal.
 */
export function cssGradientPoints(angleDeg: number, w: number, h: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad); // screen coords: y grows downward
  if (!w || !h) return { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } };
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const halfX = ((len / 2) * dx) / w;
  const halfY = ((len / 2) * dy) / h;
  return { start: { x: 0.5 - halfX, y: 0.5 - halfY }, end: { x: 0.5 + halfX, y: 0.5 + halfY } };
}

interface Props extends Omit<LinearGradientProps, 'start' | 'end' | 'colors'> {
  /** The CSS angle, e.g. 150 for `linear-gradient(150deg, ...)`. */
  angle: number;
  colors: readonly string[];  // widened at the call boundary below
  style?: StyleProp<ViewStyle>;
}

/** A LinearGradient that measures itself so a CSS angle resolves the way it does in the browser. */
export function CssGradient({ angle, colors, style, onLayout, children, ...rest }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const handle = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
    onLayout?.(e);
  };
  const { start, end } = cssGradientPoints(angle, size.w, size.h);
  return (
    <LinearGradient
      colors={colors as unknown as readonly [string, string, ...string[]]}
      start={start}
      end={end}
      style={style}
      onLayout={handle}
      {...rest}
    >
      {children}
    </LinearGradient>
  );
}
