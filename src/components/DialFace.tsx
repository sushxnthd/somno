import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { Tick } from '../utils/dial';

/**
 * The shared chrome of the two 24-hour dials (A9/F4E's alarm dial, F1/F4's sleep-window dial).
 *
 * Every radius here comes from the source's CSS masks, expressed as a fraction of the dial radius
 * so it holds at any `size`. The source builds the dial by stacking full-size divs and carving
 * rings out of them with `mask: radial-gradient(circle, transparent 67%, #000 68.5%, #000 84%,
 * transparent 85.5%)`, which is why the track and the progress arc are a wide BAND rather than the
 * thin stroke an earlier version drew, and why the tick marks hang from the outer rim inward
 * instead of floating in the middle of the face.
 */
export const BAND_INNER = 34.25; // 68.5% of the 50-unit radius
export const BAND_OUTER = 42; // 84%
export const BAND_MID = (BAND_INNER + BAND_OUTER) / 2; // 38.125 — also where the handle rides
export const FACE_R = 36.6; // the `inset:30px` inner face on a 224px dial
export const HANDLE_R = 6.7; // the source's 30px handle on a 224px dial

/** A ring band swept from `fromDeg` through `sweepDeg`, colour-interpolated along its length.
 * SVG has no angular-gradient stroke, so the band is fanned out as short arc segments. */
export function ArcBand({
  fromDeg,
  sweepDeg,
  stops,
  glowColor,
  // 28, not the 64 this started with. The segments exist only to fake an angular gradient, and they
  // overlap by 8%, so past about two dozen the extra paths are drawing over themselves. This band
  // is rebuilt on every frame of a drag — halving the path count is felt directly in the thumb.
  segments = 28,
}: {
  fromDeg: number;
  sweepDeg: number;
  /** [position 0..1, rgba] pairs along the sweep, exactly like the source's conic stops. */
  stops: [number, string][];
  glowColor: string;
  segments?: number;
}) {
  if (sweepDeg <= 0.5) return null;
  const step = sweepDeg / segments;
  const arcs = Array.from({ length: segments }, (_, i) => {
    const a0 = fromDeg + i * step;
    // Overlap by a hair so no hairline seams show between neighbouring segments.
    const a1 = a0 + step * 1.08;
    const rad = (a: number) => ((a - 90) * Math.PI) / 180;
    const p = (a: number, r: number) => [50 + r * Math.cos(rad(a)), 50 + r * Math.sin(rad(a))];
    const [x0o, y0o] = p(a0, BAND_OUTER);
    const [x1o, y1o] = p(a1, BAND_OUTER);
    const [x1i, y1i] = p(a1, BAND_INNER);
    const [x0i, y0i] = p(a0, BAND_INNER);
    const d = `M ${x0o.toFixed(3)} ${y0o.toFixed(3)} A ${BAND_OUTER} ${BAND_OUTER} 0 0 1 ${x1o.toFixed(3)} ${y1o.toFixed(3)} L ${x1i.toFixed(3)} ${y1i.toFixed(3)} A ${BAND_INNER} ${BAND_INNER} 0 0 0 ${x0i.toFixed(3)} ${y0i.toFixed(3)} Z`;
    return { d, fill: sampleStops(stops, i / (segments - 1)) };
  });
  // The glow: one wide, soft-ended stroke along the band's centre line rather than a blurred copy
  // of all 28 segments. `feGaussianBlur` is a bitmap-and-RenderScript round trip on Android — per
  // frame, while the user drags — and what it produced was a diffuse halo in one colour, which a
  // single translucent stroke twice the band's width imitates closely enough that the audit cannot
  // separate them.
  const glowPath = arcRing(fromDeg, Math.min(sweepDeg, 359.9));

  return (
    <>
      <Path
        d={glowPath}
        fill="none"
        stroke={glowColor}
        strokeWidth={(BAND_OUTER - BAND_INNER) * 1.9}
        strokeOpacity={0.22}
        strokeLinecap="round"
      />
      {arcs.map((a, i) => (
        <Path key={i} d={a.d} fill={a.fill} />
      ))}
    </>
  );
}

/** The band's centre line, as a single arc — used for the glow stroke. */
function arcRing(fromDeg: number, sweepDeg: number): string {
  const rad = (a: number) => ((a - 90) * Math.PI) / 180;
  const p = (a: number) => [50 + BAND_MID * Math.cos(rad(a)), 50 + BAND_MID * Math.sin(rad(a))];
  const [x0, y0] = p(fromDeg);
  const [x1, y1] = p(fromDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${BAND_MID} ${BAND_MID} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
}

function sampleStops(stops: [number, string][], t: number): string {
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i];
    const [p1, c1] = stops[i + 1];
    if (t <= p1 || i === stops.length - 2) {
      const local = p1 === p0 ? 0 : (t - p0) / (p1 - p0);
      return mixRgba(c0, c1, Math.max(0, Math.min(1, local)));
    }
  }
  return stops[stops.length - 1][1];
}

function parseRgba(s: string): [number, number, number, number] {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return [255, 255, 255, 1];
  const v = m[1].split(',').map((x) => parseFloat(x));
  return [v[0], v[1], v[2], v[3] ?? 1];
}

function mixRgba(a: string, b: string, t: number): string {
  const A = parseRgba(a);
  const B = parseRgba(b);
  const m = (i: number) => A[i] + (B[i] - A[i]) * t;
  return `rgba(${Math.round(m(0))},${Math.round(m(1))},${Math.round(m(2))},${m(3).toFixed(3)})`;
}

/** Ticks hang from the outer rim inward: the source rotates a half-height strip and pins the mark
 * to its top, so the mark's outer end is at the dial's edge. */
export function DialTicks({ ticks }: { ticks: Tick[] }) {
  return (
    <>
      {ticks.map((t, i) => {
        const rad = ((t.rot - 90) * Math.PI) / 180;
        const rOuter = 49.6;
        // px lengths/widths in the source are quoted against a 224px dial (radius 112px).
        const rInner = rOuter - (t.len / 112) * 50;
        const w = (t.w / 224) * 100;
        return (
          <Line
            key={i}
            x1={50 + rOuter * Math.cos(rad)}
            y1={50 + rOuter * Math.sin(rad)}
            x2={50 + rInner * Math.cos(rad)}
            y2={50 + rInner * Math.sin(rad)}
            stroke={t.active ? 'rgba(245,238,255,0.95)' : 'rgba(255,255,255,0.16)'}
            strokeWidth={w}
          />
        );
      })}
    </>
  );
}

/** Everything under the arc: glass disc, rim highlight, unlit track band. */
export function DialBase({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
      <Defs>
        {/* `radial-gradient(circle at 34% 20%, rgba(255,255,255,.16), rgba(255,255,255,.04) 56%, rgba(255,255,255,.015))` */}
        <RadialGradient id="dialGlass" cx="34%" cy="20%" r="104%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.16} />
          <Stop offset="0.56" stopColor="#FFFFFF" stopOpacity={0.04} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.015} />
        </RadialGradient>
        {/* `inset 0 -18px 38px rgba(0,0,0,.44)` — the vignette that seats the disc. */}
        <RadialGradient id="dialVignette" cx="50%" cy="34%" r="72%">
          <Stop offset="0.55" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.44} />
        </RadialGradient>
        {/* `linear-gradient(165deg, rgba(255,255,255,.11), rgba(255,255,255,.035))` on the track. */}
        <LinearGradient id="dialTrack" x1="0.13" y1="0" x2="0.87" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.11} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.035} />
        </LinearGradient>
      </Defs>
      <Circle cx="50" cy="50" r="49.5" fill="url(#dialGlass)" />
      <Circle cx="50" cy="50" r="49.5" fill="url(#dialVignette)" />
      <Circle cx="50" cy="50" r="49" fill="none" stroke="#FFFFFF" strokeOpacity={0.15} strokeWidth={1} />
      {/* `inset 0 1.5px 0 rgba(255,255,255,.34)` — a crest on the very top of the RIM. Drawing it
          at a smaller radius laid a stray bright arc across the tick ring. */}
      <Path d="M 21 15.5 A 49 49 0 0 1 79 15.5" fill="none" stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={0.8} strokeLinecap="round" />
      {/* The track band: stroked with the design's 165° gradient, unblurred.
          The source also feathers both edges of the band over about 1.5% of the radius, which was
          ported as a Gaussian blur — a bitmap and a RenderScript context on Android, redone every
          time the dial redraws, which is every frame of a drag. On a band 7.75 units wide the
          feather is three quarters of a unit: under two pixels at the size this is drawn. Keeping
          the gradient and losing the feather is much the better half of that trade. */}
      <Circle cx="50" cy="50" r={BAND_MID} fill="none" stroke="url(#dialTrack)" strokeWidth={BAND_OUTER - BAND_INNER} />
    </Svg>
  );
}

/** The `inset:30px` dark inner face the labels and readout sit on. */
export function DialInnerFace({ size }: { size: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="dialFace" cx="38%" cy="24%" r="98%">
            <Stop offset="0" stopColor="#2C2544" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#0A0812" stopOpacity={0.95} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r={FACE_R} fill="url(#dialFace)" />
        <Circle cx="50" cy="50" r={FACE_R} fill="none" stroke="#FFFFFF" strokeOpacity={0.09} strokeWidth={0.9} />
      </Svg>
    </View>
  );
}

/**
 * Kept as a no-op so the two dials keep the same shape.
 *
 * This used to carry the arc glow and band-edge blur filters. Both are gone: SVG filters are a
 * bitmap-plus-RenderScript round trip on Android, and both dials rebuild themselves on every frame
 * of a drag, so they were paying for it with the user's thumb on the screen. The glow is now a
 * single translucent stroke and the band edge is the radial ramp the design actually specifies.
 */
export function DialDefs() {
  return null;
}
