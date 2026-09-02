import React, { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { haptics } from '../theme/haptics';

const TRACK_H = 6;
const THUMB = 26;
/** The design's `input[type=range]` occupies 15px of layout; its 26px thumb overhangs it.
 * Measured off the rendered prototype rather than guessed — a range input's box height is a
 * browser default, not something the stylesheet states. */
const ROW_H = 15;
/** Padding that grows the touch target back to thumb size without costing any layout height. */
const GRAB = (THUMB - ROW_H) / 2;

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Spoken name, e.g. "Age". */
  label: string;
  /** Formats the value for a screen reader; defaults to the raw number. */
  formatValue?: (v: number) => string;
}

/**
 * The design's age slider, ported from its `input[type=range]` styling:
 *   track: 6px, radius 3, linear-gradient(90deg, rgba(138,123,255,.9), rgba(138,123,255,.18))
 *   thumb: 26px, #ECEAF6, box-shadow 0 0 18px rgba(138,123,255,.8), margin-top:-10px
 *
 * Two things the platform slider could not do. Visually, its thumb is a small flat dot against a
 * thin grey track where the design has a large glowing white puck on a violet gradient — the
 * single most obvious wrong element on the Profile screen. Structurally, a range input occupies
 * only ~18px of layout with its thumb overhanging, whereas the platform component reserves its
 * full thumb height, which made the Age card 20px too tall and pushed the sleep dial off its mark.
 */
export function RangeSlider({ value, min, max, step = 1, onChange, label, formatValue }: Props) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const leftRef = useRef(0);
  const viewRef = useRef<View>(null);
  const lastStep = useRef<number | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
    viewRef.current?.measureInWindow((x) => {
      leftRef.current = x;
    });
  }, []);

  const emit = useCallback(
    (pageX: number) => {
      const w = widthRef.current;
      if (!w) return;
      const usable = Math.max(1, w - THUMB);
      const frac = Math.max(0, Math.min(1, (pageX - leftRef.current - THUMB / 2) / usable));
      const raw = min + frac * (max - min);
      const next = Math.round(raw / step) * step;
      if (lastStep.current !== next) {
        lastStep.current = next;
        haptics.tick(); // one detent per step crossed
      }
      onChange(next);
    },
    [min, max, step, onChange]
  );

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        viewRef.current?.measureInWindow((x) => {
          leftRef.current = x;
        });
        emit(e.nativeEvent.pageX);
      },
      onPanResponderMove: (e) => emit(e.nativeEvent.pageX),
    })
  ).current;

  const frac = max === min ? 0 : (value - min) / (max - min);
  // A range thumb stays fully inside its track: its centre travels from thumbW/2 to w - thumbW/2,
  // not from 0 to w. Without the inset the thumb sat ~11px left of the design's at the same value
  // and hung half off each end at the extremes.
  const thumbLeft = frac * (width - THUMB);

  return (
    <View
      ref={viewRef}
      onLayout={onLayout}
      style={styles.root}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: formatValue?.(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + step));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - step));
      }}
      {...pan.panHandlers}
    >
      <LinearGradient
        colors={['rgba(138,123,255,0.9)', 'rgba(138,123,255,0.18)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.track}
      />
      {width > 0 && <View style={[styles.thumb, { left: thumbLeft }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    // Box is thumb-height so the drag target is usable, then the extra is pulled back out of
    // layout with a negative margin — the row still occupies the design's ROW_H.
    height: THUMB,
    marginVertical: -GRAB,
    justifyContent: 'center',
    overflow: 'visible',
  },
  track: { height: TRACK_H, borderRadius: TRACK_H / 2 },
  thumb: {
    position: 'absolute',
    top: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#ECEAF6',
    shadowColor: '#8A7BFF',
    shadowOpacity: 0.8,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});
