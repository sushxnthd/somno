import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';
import { useReduceMotion } from '../theme/useReduceMotion';
import { BLOB_OVERSCAN, blobRungFor, blobTextureFor, type BlobRing } from './blobTextures';

/**
 * The ambient glow behind gauges, avatars and hero moments.
 *
 * The design writes each one as `conic-gradient(from Ndeg, …) + filter: blur(Npx) saturate(165%)`
 * with a slow rotation. This used to be ported literally — 48 SVG wedges under an `feGaussianBlur`,
 * spinning a `<G>` — and on Android that was catastrophic: `react-native-svg` implements the filter
 * by rasterising to a Bitmap and blurring it through **RenderScript**, deprecated since Android 12,
 * with the radius clamped to 25. Every frame of the rotation paid for all of it, on the JS driver,
 * because an animated `<G>` cannot use the native one. The app crawled, and the clamp meant the
 * blob rendered as a hard-edged coloured disc rather than a glow — the thing was expensive *and*
 * wrong.
 *
 * Nothing about a blurred gradient is per-frame work. `scripts/make-blobs.py` bakes each ring at a
 * ladder of blur radii using the same maths the CSS uses, and this component draws the nearest one
 * as an ordinary image with its rotation on the native driver. Per frame the app now does nothing
 * at all: the UI thread spins a texture the GPU already holds.
 */

interface Props {
  size: number;
  /** Which colour ring. The four are defined in scripts/make-blobs.py and baked from there. */
  ring?: BlobRing;
  /** `from Ndeg` in the CSS source — a fixed rotation offset, free to apply. */
  fromDeg?: number;
  opacity?: number;
  /** CSS `blur(Npx)`, in the same layout pixels as `size`; snapped to the nearest baked rung. */
  blurPx?: number;
  /**
   * Kept for call-site fidelity to the design, but baked at 1.65 for every texture. The call sites
   * span 1.5–1.8, and the difference at these opacities is not visible without the two side by
   * side — where a per-saturation texture set would be four more images per rung.
   */
  saturate?: number;
  spinMs?: number;
  reverse?: boolean;
  /**
   * `swirl` spins the gradient a full turn; `floaty` doesn't rotate at all, it drifts the blob by
   * translate3d(-4%, 5%) and back. The two big background washes are floaty — spinning them made
   * them read as active hero orbs rather than as still atmosphere.
   */
  motion?: 'swirl' | 'floaty';
  style?: any;
}

export function ConicBlob({
  size,
  ring = 'cool',
  fromDeg = 0,
  opacity = 0.6,
  blurPx = 34,
  spinMs = 18000,
  reverse = false,
  motion = 'swirl',
  style,
}: Props) {
  const drive = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  const rung = useMemo(() => blobRungFor(size, blurPx), [size, blurPx]);
  const source = useMemo(() => blobTextureFor(ring, rung), [ring, rung]);
  // The texture carries the blur's bleed around the disc, so it is drawn larger than the layout box
  // and centred on it; the disc inside then measures exactly `size` on screen.
  const drawn = size * BLOB_OVERSCAN[rung];
  const inset = -(drawn - size) / 2;

  useEffect(() => {
    // Reduce Motion holds the blob at its resting frame. Colour, size and position are unchanged —
    // it simply stops moving.
    if (reduceMotion || !spinMs) {
      drive.setValue(0);
      return;
    }
    const loop =
      motion === 'floaty'
        ? Animated.loop(
            Animated.sequence([
              Animated.timing(drive, { toValue: 1, duration: spinMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
              Animated.timing(drive, { toValue: 0, duration: spinMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
          )
        : Animated.loop(Animated.timing(drive, { toValue: 1, duration: spinMs, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [drive, spinMs, motion, reduceMotion]);

  const animatedStyle =
    motion === 'floaty'
      ? {
          // `floaty` translates by a percentage of the element's own box, so -4%/5% of `size`.
          transform: [
            { translateX: drive.interpolate({ inputRange: [0, 1], outputRange: [0, -0.04 * size] }) },
            { translateY: drive.interpolate({ inputRange: [0, 1], outputRange: [0, 0.05 * size] }) },
          ],
        }
      : {
          transform: [
            {
              rotate: drive.interpolate({
                inputRange: [0, 1],
                outputRange: reverse ? [`${fromDeg}deg`, `${fromDeg - 360}deg`] : [`${fromDeg}deg`, `${fromDeg + 360}deg`],
              }),
            },
          ],
        };

  return (
    // The outer box is the layout box the call sites position: `size` square, wherever `style` puts
    // it. It must not clip, because the glow is deliberately larger than it.
    <View pointerEvents="none" style={[{ width: size, height: size, position: 'absolute', overflow: 'visible' }, style]}>
      <Animated.View
        // Sized to the whole texture, not to the layout box, and *that* is what carries the
        // rasterisation. A hardware layer is allocated at the bounds of the view it is set on, so
        // when this sat on the size-square box with the texture overflowing it, Android cropped the
        // halo to a hard square edge — visible on every glow in the app, and invisible to a web
        // audit because the flag is a no-op there.
        renderToHardwareTextureAndroid
        shouldRasterizeIOS
        style={[
          { position: 'absolute', left: inset, top: inset, width: drawn, height: drawn, opacity },
          animatedStyle,
        ]}
      >
        <Image
          source={source}
          style={{ width: drawn, height: drawn }}
          // The textures are the only thing in the app that would benefit from fading in, and a blob
          // fading in behind a gauge reads as a flicker.
          fadeDuration={0}
        />
      </Animated.View>
    </View>
  );
}

/**
 * The colour rings, kept as names now that the gradients themselves are baked.
 *
 * The hex values live in scripts/make-blobs.py, which is the only thing that can act on them. These
 * exports remain so the screens keep reading the way they did.
 */
export const CONIC_COOL: BlobRing = 'cool';
export const CONIC_WARM: BlobRing = 'warm';
export const CONIC_DUSK: BlobRing = 'dusk';
export const CONIC_TEAL: BlobRing = 'teal';
