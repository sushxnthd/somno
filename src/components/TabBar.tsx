import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassBackdrop } from './Glass';
import { LinearGradient } from 'expo-linear-gradient';
import { CssGradient } from './CssGradient';
import { color, font } from '../theme/tokens';
import { motion } from '../theme/motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '../theme/haptics';
import { Icon, IconName } from './Icons';
import type { ScreenId } from '../store/types';

const TABS: { id: ScreenId; icon: IconName; label: string }[] = [
  { id: 'B', icon: 'home', label: 'Home' },
  { id: 'C1', icon: 'pulse', label: 'Check-in' },
  { id: 'D', icon: 'recovery', label: 'Recovery' },
  { id: 'E', icon: 'trends', label: 'Trends' },
];

interface Props {
  active: ScreenId;
  onNavigate: (id: ScreenId) => void;
}

export function TabBar({ active, onNavigate }: Props) {
  const activeIdx = TABS.findIndex((t) => t.id === active || (t.id === 'D' && active === 'DL'));
  // The design slides the indicator between tabs (`transition: left .38s cubic-bezier(.22,1,.36,1)`)
  // rather than snapping it; the tint on the labels crossfades over .26s alongside.
  const insets = useSafeAreaInsets();
  const [pillW, setPillW] = useState(0);
  const slot = pillW > 0 ? (pillW - 14) / 4 : 0;
  const slide = useRef(new Animated.Value(Math.max(0, activeIdx))).current;
  const fades = TABS.map((_, i) => useRef(new Animated.Value(i === activeIdx ? 1 : 0)).current);

  useEffect(() => {
    if (activeIdx < 0) return;
    Animated.timing(slide, {
      toValue: activeIdx,
      duration: motion.tabIndicator.duration,
      easing: motion.tabIndicator.easing,
      useNativeDriver: true,
    }).start();
    fades.forEach((f, i) =>
      Animated.timing(f, {
        toValue: i === activeIdx ? 1 : 0,
        duration: motion.tabLabel.duration,
        easing: motion.tabLabel.easing,
        useNativeDriver: true,
      }).start()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);

  const onPillLayout = (e: LayoutChangeEvent) => setPillW(e.nativeEvent.layout.width);

  return (
    // The design's frame has no home indicator, so it can sit at a flat 18px from the bottom. On a
    // device that has one, that puts the bar underneath it — keep the design's 18px of breathing
    // room measured from the safe area instead.
    <>
      {/* The design lets content scroll under the floating bar, which on a phone leaves text
          colliding with the glass. A short scrim fades the page out beneath it so the bar always
          has something quiet to sit on, without cropping the content or moving the layout. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(8,7,14,0)', 'rgba(8,7,14,0.72)', 'rgba(8,7,14,0.94)']}
        style={[styles.scrim, { height: Math.max(18, insets.bottom + 6) + 74 + 28 }]}
      />
    <View style={[styles.wrap, { bottom: Math.max(18, insets.bottom + 6) }]} pointerEvents="box-none">
      <View style={styles.pill} onLayout={onPillLayout}>
        <GlassBackdrop intensity={40} />
        <CssGradient angle={150} colors={['rgba(255,255,255,0.085)', 'rgba(255,255,255,0.03)']} style={StyleSheet.absoluteFill} />
        {activeIdx >= 0 && slot > 0 && (
          <Animated.View
            style={[
              styles.indicatorTrack,
              {
                width: slot,
                transform: [
                  { translateX: slide.interpolate({ inputRange: [0, 3], outputRange: [0, slot * 3] }) },
                ],
              },
            ]}
          >
            <CssGradient angle={150} colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.055)']} style={styles.indicator} />
          </Animated.View>
        )}
        {TABS.map((t, i) => (
          <Pressable
            key={t.id}
            style={styles.tab}
            hitSlop={6}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: i === activeIdx }}
            onPress={() => {
              if (i !== activeIdx) haptics.select();
              onNavigate(t.id);
            }}
          >
            {/* Both tints are painted and crossfaded, since a colour string cannot be animated
                on the native driver the way the design's `transition: color` is. */}
            {/* The active tint is a second copy crossfaded over the dim one, because a colour
                string cannot be animated on the native driver. Both copies must stay out of hit
                testing, or the overlay becomes the tap target instead of the Pressable. */}
            <View pointerEvents="none">
              <Icon name={t.icon} size={21} color="rgba(236,234,246,0.45)" strokeWidth={1.9} />
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: fades[i] }]} pointerEvents="none">
                <Icon name={t.icon} size={21} color="#FFFFFF" strokeWidth={1.9} />
              </Animated.View>
            </View>
            <View pointerEvents="none">
              <Text style={[styles.label, { color: 'rgba(236,234,246,0.45)' }]}>{t.label}</Text>
              <Animated.Text style={[styles.label, styles.labelOverlay, { opacity: fades[i] }]} pointerEvents="none">
                {t.label}
              </Animated.Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  // Geometry copied from the prototype's tab-bar CSS: 74px tall, 37px radius, 7px inner padding,
  // with the active-tab indicator inset 7px top/bottom.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 74,
    borderRadius: 37,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    paddingHorizontal: 7,
  },
  // `left: calc(7px + (100% - 14px) * i / 4); width: calc((100% - 14px) / 4)`
  indicatorTrack: {
    position: 'absolute',
    top: 7,
    bottom: 7,
    left: 7,
  },
  indicator: {
    flex: 1,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontFamily: font.sans600,
    fontSize: 10.5,
  },
  labelOverlay: { position: 'absolute', left: 0, right: 0, top: 0, color: '#FFFFFF' },
});
