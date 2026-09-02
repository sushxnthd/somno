import React, { useRef } from 'react';
import { GestureResponderEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg from 'react-native-svg';
import { CssGradient } from './CssGradient';
import { angGap, angleToMinutes, faceLabels, faceTicks, posOn } from '../utils/dial';
import { dur, fmtHM } from '../utils/format';
import { color, font, displayNumeral } from '../theme/tokens';
import { haptics } from '../theme/haptics';
import { Icon } from './Icons';
import { AmbientBlob } from './AmbientBlob';
import { ArcBand, BAND_MID, DialBase, DialDefs, DialInnerFace, DialTicks } from './DialFace';

interface Props {
  /** Announce times on a 24-hour clock, following the device. */
  is24h?: boolean;
  bedMin: number;
  wakeMin: number;
  onChangeBed: (m: number) => void;
  onChangeWake: (m: number) => void;
  size?: number;
}

const SCHED_ARC_STOPS: [number, string][] = [
  [0, 'rgba(185,174,255,0.95)'],
  [1, 'rgba(255,201,143,0.95)'],
];

/**
 * Two-handle 24h dial for the bedtime/wake window (prototype A4 / F1). Ported from the source's
 * layered dial: glow halo, glass disc with inset shading, 72-tick ring lit across the sleep
 * window, a violet->amber arc, an inner dark face carrying the 12AM/6AM/12PM/6PM hour labels and
 * a "N h M m / IN BED" readout, and two draggable pucks — a violet moon (bedtime) and an amber
 * sun (wake).
 */
export function SleepWindowDial({ bedMin, wakeMin, onChangeBed, onChangeWake, is24h = false, size = 224 }: Props) {
  const viewRef = useRef<View>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const dragKey = useRef<'bed' | 'wake' | null>(null);
  const lastStep = useRef<number | null>(null);

  const measure = () => {
    viewRef.current?.measureInWindow((x, y, w, h) => {
      centerRef.current = { x: x + w / 2, y: y + h / 2 };
    });
  };

  const resolve = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    return angleToMinutes(pageX - centerRef.current.x, pageY - centerRef.current.y, 5);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        measure();
        const m = resolve(e);
        dragKey.current = angGap(m, bedMin) <= angGap(m, wakeMin) ? 'bed' : 'wake';
        lastStep.current = m;
        haptics.select(); // grabbing a handle
        (dragKey.current === 'bed' ? onChangeBed : onChangeWake)(m);
      },
      onPanResponderMove: (e) => {
        if (!dragKey.current) return;
        const m = resolve(e);
        // One detent per step crossed while dragging, not one per frame.
        if (lastStep.current !== m) {
          lastStep.current = m;
          haptics.tick();
        }
        (dragKey.current === 'bed' ? onChangeBed : onChangeWake)(m);
      },
      onPanResponderRelease: () => {
        dragKey.current = null;
      },
    })
  ).current;

  const span = (((wakeMin - bedMin) % 1440) + 1440) % 1440;
  const sweepFrac = span / 1440;
  const ticks = faceTicks(bedMin, wakeMin);
  const labels = faceLabels(24.16);
  const bedPos = posOn(bedMin, BAND_MID);
  const wakePos = posOn(wakeMin, BAND_MID);

  const innerInset = size * 0.134; // matches the source's `inset:30px` on a 224px dial

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* The halo is the same conic blob every other orb uses, not a radial ring:
          `inset:-14px` on a 224px dial -> 252px, from 200deg, blur(30px) saturate(170%), .34, 24s.
          A radial ring put its brightest band uniformly around the rim and lost the amber quadrant
          that anchors the dial's warm side. */}
      <AmbientBlob size={size * 1.125} fromDeg={200} blurPx={30} saturate={1.7} opacity={0.34} durationMs={24000} />

      <View
        ref={viewRef}
        style={{ width: size, height: size }}
        onLayout={measure}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Sleep window"
        accessibilityValue={{ text: `In bed ${fmtHM(bedMin, is24h)}, up ${fmtHM(wakeMin, is24h)}, ${dur(bedMin, wakeMin)}` }}
        accessibilityHint="Swipe up or down to move your wake time in fifteen-minute steps"
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') onChangeWake(wakeMin + 15);
          if (e.nativeEvent.actionName === 'decrement') onChangeWake(wakeMin - 15);
        }}
        {...panResponder.panHandlers}
      >
        <DialBase size={size} />

        <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
          <DialDefs />
          <DialTicks ticks={ticks} />
          {/* `schedArc`: conic from the bedtime bearing, rgba(185,174,255,.95) -> rgba(255,201,143,.95) */}
          <ArcBand
            fromDeg={(bedMin / 1440) * 360}
            sweepDeg={sweepFrac * 360}
            stops={SCHED_ARC_STOPS}
            glowColor="rgba(170,150,255,0.42)"
          />
        </Svg>

        <DialInnerFace size={size} />

        {/* hour labels, laid out on the inner face like the source's inset:30px label ring */}
        {labels.map((l, i) => (
          <Text
            key={i}
            style={[
              styles.faceLabel,
              {
                left: `${l.xPct}%`,
                top: `${l.yPct}%`,
                fontFamily: l.big ? font.sans700 : font.sans600,
                color: l.big ? '#F2EFFF' : 'rgba(236,234,246,0.5)',
                fontSize: l.big ? 11.5 : 10.5,
              },
            ]}
            numberOfLines={1}
          >
            {l.lab}
          </Text>
        ))}

        <View style={styles.readout} pointerEvents="none">
          <Text style={styles.duration}>{dur(bedMin, wakeMin)}</Text>
          <Text style={styles.inBed}>IN BED</Text>
        </View>

        {/* draggable pucks */}
        <View style={[styles.puckWrap, { left: `${bedPos.xPct}%`, top: `${bedPos.yPct}%` }]} pointerEvents="none">
          <CssGradient angle={150} colors={['#F4F0FF', '#B9AEFF']} style={styles.puck}>
            <Icon name="moon" size={16} color="#1A1330" strokeWidth={1.7} />
          </CssGradient>
        </View>
        <View style={[styles.puckWrap, { left: `${wakePos.xPct}%`, top: `${wakePos.yPct}%` }]} pointerEvents="none">
          <CssGradient angle={150} colors={['#FFF6EA', '#FFC98F']} style={styles.puck}>
            <Icon name="sun" size={16} color="#2A1608" strokeWidth={1.7} />
          </CssGradient>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  innerFace: {
    position: 'absolute',
    backgroundColor: 'rgba(16,13,26,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  faceLabel: {
    position: 'absolute',
    transform: [{ translateX: -21 }, { translateY: -7 }],
    width: 42,
    textAlign: 'center',
  },
  readout: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  duration: { fontFamily: font.sans600, ...displayNumeral(21), color: color.text, letterSpacing: -0.525 }, // 21px/1, -.025em
  inBed: { marginTop: 2, fontFamily: font.sans700, fontSize: 10, letterSpacing: 2, color: 'rgba(236,234,246,0.5)' },
  puckWrap: { position: 'absolute', marginLeft: -16, marginTop: -16 },
  puck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
});
