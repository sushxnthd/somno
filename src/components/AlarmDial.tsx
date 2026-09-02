import React, { useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, LinearGradient, Path, Stop, Defs } from 'react-native-svg';
import { angleToMinutes, faceLabels, faceTicks, posOn } from '../utils/dial';
import { fmtHM } from '../utils/format';
import { color, font, displayNumeral } from '../theme/tokens';
import { haptics } from '../theme/haptics';
import { AmbientBlob } from './AmbientBlob';
import { ArcBand, BAND_MID, DialBase, DialDefs, DialInnerFace, DialTicks, HANDLE_R } from './DialFace';

interface Props {
  minutes: number;
  onChange: (min: number) => void;
  size?: number;
  amPm?: string;
  /** Render the readout on a 24-hour clock, following the device. Off by default. */
  is24h?: boolean;
  arcFrom?: number; // defaults to 0 (like onboarding A9's "time until alarm" arc)
}

// `alarmArc`: conic from 0deg, rgba(138,123,255,.85) -> rgba(201,166,255,.9) at 60% of the sweep
// -> rgba(255,184,119,.95) at the end.
const ALARM_ARC_STOPS: [number, string][] = [
  [0, 'rgba(138,123,255,0.85)'],
  [0.6, 'rgba(201,166,255,0.9)'],
  [1, 'rgba(255,184,119,0.95)'],
];

/** Large glass 24h alarm-time dial with a draggable handle (prototype A9 / F4E). Ported from the
 * source's layered-glass dial: outer blurred conic-gradient halo, an inset 3D glass disc
 * (top-left highlight + dark vignette), a full ring of 72 tick marks (bright where "elapsed",
 * dim otherwise), and a violet->lilac->amber progress arc with a soft glow. */
export function AlarmDial({ minutes, onChange, size = 224, amPm, is24h = false, arcFrom = 0 }: Props) {
  const viewRef = useRef<View>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const measure = () => {
    viewRef.current?.measureInWindow((x, y, w, h) => {
      centerRef.current = { x: x + w / 2, y: y + h / 2 };
    });
  };

  const lastStep = useRef<number | null>(null);
  const handleTouch = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    const dx = pageX - centerRef.current.x;
    const dy = pageY - centerRef.current.y;
    const next = angleToMinutes(dx, dy, 5);
    // One tick per step crossed, not per touch event — a physical dial has detents, and firing on
    // every frame would be a continuous buzz rather than feedback.
    if (lastStep.current !== next) {
      lastStep.current = next;
      haptics.tick();
    }
    onChange(next);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setDragging(true);
        measure();
        handleTouch(e);
      },
      onPanResponderMove: handleTouch,
      onPanResponderRelease: () => setDragging(false),
    })
  ).current;

  const span = (((minutes - arcFrom) % 1440) + 1440) % 1440;
  const sweepFrac = span / 1440;
  const ticks = faceTicks(arcFrom, minutes);
  const labels = faceLabels(24.16);
  const handle = posOn(minutes, BAND_MID);


  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Halo: the source's `inset:-14px` conic blob on a 224px dial -> 252px, warm ring from
          200deg, blur(30px) saturate(170%), opacity .4, swirl 24s. */}
      <AmbientBlob size={size * 1.125} warm fromDeg={200} blurPx={30} saturate={1.7} opacity={0.4} durationMs={24000} />

      <View
        ref={viewRef}
        style={{ width: size, height: size }}
        onLayout={measure}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Alarm time"
        accessibilityValue={{ text: `${fmtHM(minutes, is24h)}${amPm ? ' ' + amPm : ''}` }}
        accessibilityHint="Swipe up or down to change the alarm time in five-minute steps"
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') onChange(minutes + 5);
          if (e.nativeEvent.actionName === 'decrement') onChange(minutes - 5);
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        {...panResponder.panHandlers}
      >
        <DialBase size={size} />

        <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
          <DialDefs />
          <DialTicks ticks={ticks} />
          <ArcBand
            fromDeg={(arcFrom / 1440) * 360}
            sweepDeg={sweepFrac * 360}
            stops={ALARM_ARC_STOPS}
            glowColor="rgba(255,180,120,0.5)"
          />
        </Svg>

        <DialInnerFace size={size} />

        {/* handle: the source's 30px puck, riding the middle of the band */}
        <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="dialHandle" x1="0.2" y1="0" x2="0.8" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="1" stopColor="#D9D2FF" />
            </LinearGradient>
          </Defs>
          <Circle cx={`${handle.xPct}%`} cy={`${handle.yPct}%`} r={HANDLE_R + 2.2} fill="rgba(200,180,255,0.14)" />
          <Circle
            cx={`${handle.xPct}%`}
            cy={`${handle.yPct}%`}
            r={HANDLE_R}
            fill="url(#dialHandle)"
            stroke="rgba(255,255,255,0.8)"
            strokeWidth={0.45}
          />
        </Svg>

        {/* hour labels */}
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

        {/* readout */}
        <View style={styles.readout} pointerEvents="none">
          <Text style={styles.time}>{fmtHM(minutes, is24h)}</Text>
          {!!amPm && <Text style={styles.ap}>{amPm}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  faceLabel: {
    position: 'absolute',
    transform: [{ translateX: -21 }, { translateY: -8 }],
    width: 42,
    textAlign: 'center',
  },
  readout: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3, // source: `gap:3px`
  },
  time: {
    fontFamily: font.sans600,
    ...displayNumeral(28),
    color: color.text,
    letterSpacing: -0.7, // -.025em
  },
  ap: {
    fontFamily: font.sans700,
    fontSize: 10.5,
    letterSpacing: 2.1, // .2em
    color: color.textDim55,
  },
});
