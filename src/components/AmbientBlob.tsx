import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ConicBlob } from './ConicBlob';
import type { BlobRing } from './blobTextures';
import { useReduceMotion } from '../theme/useReduceMotion';

interface Props {
  size?: number;
  warm?: boolean;
  style?: any;
  spin?: boolean;
  /** Overall opacity of the glow. Hero moments (Splash, A1, A5, paywall) use the ~0.7-0.85 range
   * from the source's `opacity:.62`/`.68` hero blobs; secondary in-card accents use ~0.35-0.45,
   * matching the source's `opacity:.42` card-corner blobs. */
  opacity?: number;
  /** Rotation period in ms — the source varies this per usage (16-24s). */
  durationMs?: number;
  /** `conic-gradient(from Ndeg, ...)` start bearing; defaults match the source per variant. */
  fromDeg?: number;
  /** CSS `filter: blur(Npx)` from the source — 14px on the tightest orb up to 60px on the big
   * background washes. It is NOT proportional to `size`, so every call site passes its own. */
  blurPx?: number;
  /** CSS `filter: saturate(N%)` from the source, as a multiplier (165% -> 1.65). */
  saturate?: number;
  /** `animation: swirl ... reverse` in the source. */
  reverse?: boolean;
  /** Which of the four colour rings in the design this blob uses. `warm` is the shorthand the
   * screens already use for the amber-first ring; `dusk` and `teal` are the two one-off rings on
   * Recovery and Trends respectively. */
  ring?: 'cool' | 'warm' | 'dusk' | 'teal';
  /** `swirl` (rotate) vs `floaty` (drift) — see ConicBlob. */
  motion?: 'swirl' | 'floaty';
}


/**
 * Soft glowing blob behind gauges/avatars/icons — the prototype's
 * `conic-gradient(...) + filter: blur(...) + animation: swirl` in component form.
 * Thin wrapper over ConicBlob, which does the real angular-gradient work.
 */
export function AmbientBlob({
  size = 260,
  warm,
  style,
  spin = true,
  opacity = 0.8,
  durationMs = 18000,
  fromDeg,
  blurPx = 34,
  saturate = 1.65,
  reverse = false,
  ring,
  motion = 'swirl',
}: Props) {
  return (
    <ConicBlob
      size={size}
      ring={(ring ?? (warm ? 'warm' : 'cool')) as BlobRing}
      fromDeg={fromDeg ?? (warm ? 150 : 200)}
      opacity={opacity}
      blurPx={blurPx}
      saturate={saturate}
      reverse={reverse}
      motion={motion}
      // `spin={false}` used to mean "a rotation so slow it never visibly moves". Now it means what
      // it says: no animation is started at all, and the texture just sits there.
      spinMs={spin ? durationMs : 0}
      style={style}
    />
  );
}

interface GlassOrbProps {
  size?: number;
  style?: any;
  /**
   * Peak alpha of the `radial-gradient(circle at 34% 26%, rgba(255,255,255,A), ...)` highlight the
   * design paints on its big translucent orbs — .45 on Splash, .34 on the SDI gauge, .32 on G3,
   * .3 on A1/A5. Pass 0 for the small icon tiles, which use a flat `fill` instead.
   */
  highlight?: number;
  /** Flat `rgba(255,255,255,A)` fill used by the small icon tiles (AU1 .07, ScanErr .06, F9/PW .10). */
  fill?: number;
  /** Alpha of the 1px rim. */
  borderAlpha?: number;
  /** `animation: breathe Ns` on the glass layer; 0 disables it. */
  breatheMs?: number;
  /** Corner radius when the tile is a squircle rather than a circle (F9's avatar is 20px, the
   * paywall's icon tile is 38px). Defaults to a full circle. */
  cornerRadius?: number;
  /**
   * Adds a soft dark disc behind the orb's centre. Needed only when the orb holds a thin-stroke
   * ICON, which would otherwise wash out against the glow. Leave off for orbs holding large text
   * (the SDI gauge, A1's wordmark, G3's score) — the prototype keeps those fully translucent, and
   * a backing disc there reads as a wrong, heavy dark circle.
   */
  iconBacking?: boolean;
}

/**
 * The translucent glass disc that sits on top of an AmbientBlob.
 *
 * Deliberately does NOT blur or tint its backdrop. The source uses `backdrop-filter: blur(Npx)`,
 * which softens what's behind without darkening it; an `expo-blur` BlurView with `tint="dark"`
 * knocked roughly a third off the brightness of every hero orb, so the glow read as a muddy
 * purple instead of the mockup's bright lavender. And blurring here buys nothing anyway — what's
 * behind is already a 30-60px Gaussian blob.
 */
export function GlassOrb({
  size = 240,
  style,
  iconBacking = false,
  highlight = 0.3,
  fill = 0,
  borderAlpha = 0.16,
  breatheMs = 0,
  cornerRadius,
  children,
}: React.PropsWithChildren<GlassOrbProps>) {
  const breathe = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (!breatheMs || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: breatheMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: breatheMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, breatheMs, reduceMotion]);

  // `@keyframes breathe { 0%,100% { scale(1); opacity:.85 } 50% { scale(1.05); opacity:1 } }`
  const breatheStyle = breatheMs
    ? {
        opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
        transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
      }
    : null;

  // The glass layer is a circle on the hero orbs and a squircle on the two icon tiles; both are
  // drawn in the same 0-100 viewBox, so the corner radius has to be expressed in those units too.
  const rUnits = cornerRadius != null ? (cornerRadius * 100) / size : 50;
  const Shape = (props: React.ComponentProps<typeof Rect>) =>
    cornerRadius != null ? (
      <Rect x="0.5" y="0.5" width="99" height="99" rx={rUnits} ry={rUnits} {...props} />
    ) : (
      <Circle cx="50" cy="50" r="49.5" {...(props as any)} />
    );

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: cornerRadius ?? size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, breatheStyle]} pointerEvents="none">
        <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
          <Defs>
            {/* A CSS radial-gradient sizes itself to the FARTHEST CORNER by default, so
                `circle at 34% 26%` has a radius of ~99% of the box, and its percentage stops are
                fractions of that. Treating the last stop's 74% as the radius made the highlight
                two-thirds the size it should be and left every hero orb visibly dim. */}
            <RadialGradient id={`glassHighlight${size}`} cx="34%" cy="26%" r="99%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={highlight} />
              <Stop offset="0.58" stopColor="#FFFFFF" stopOpacity={highlight * 0.13} />
              <Stop offset="0.74" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {fill > 0 && <Shape fill="#FFFFFF" fillOpacity={fill} />}
          {highlight > 0 && <Shape fill={`url(#glassHighlight${size})`} />}
          <Shape fill="none" stroke="#FFFFFF" strokeOpacity={borderAlpha} strokeWidth={1} />
        </Svg>
      </Animated.View>
      <View style={styles.iconLayer} pointerEvents="box-none">
        {iconBacking && (
          <View style={[styles.iconBacking, { width: size * 0.56, height: size * 0.56, borderRadius: (size * 0.56) / 2 }]} />
        )}
        <View style={styles.iconCenter}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBacking: {
    position: 'absolute',
    backgroundColor: 'rgba(10,8,18,0.4)',
  },
  iconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
