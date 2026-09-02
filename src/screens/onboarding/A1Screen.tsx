import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, AmbientBlob, GlassOrb } from '../../components';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { onboardingSlides } from '../../data/content';
import { motion } from '../../theme/motion';

export function A1Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const go = useSomnoStore((s) => s.go);
  const slide = useSomnoStore((s) => s.slide);
  const setSlide = useSomnoStore((s) => s.setSlide);
  const nextSlide = useSomnoStore((s) => s.nextSlide);

  const [trackW, setTrackW] = useState(0);
  const shift = useRef(new Animated.Value(slide)).current;
  const dotW = [useRef(new Animated.Value(slide === 0 ? 1 : 0)).current, useRef(new Animated.Value(slide === 1 ? 1 : 0)).current, useRef(new Animated.Value(slide === 2 ? 1 : 0)).current];

  useEffect(() => {
    Animated.timing(shift, {
      toValue: slide,
      duration: motion.carousel.duration,
      easing: motion.carousel.easing,
      useNativeDriver: true,
    }).start();
    dotW.forEach((d, i) =>
      Animated.timing(d, {
        toValue: i === slide ? 1 : 0,
        duration: motion.barFill.duration,
        easing: motion.barFill.easing,
        // width and backgroundColor are layout/paint props, so this one stays on the JS driver
        useNativeDriver: false,
      }).start()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  const current = onboardingSlides[slide];

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.skipRow}>
          {/*
            Skips the three intro slides, and only those.

            It used to go straight to 'B'. Two things followed from that, both silent. `go` marks
            onboarding complete on arrival at the home screen, so a single tap here permanently
            recorded a user as set up — there is no route back into this flow. And it stepped over
            consent, the profile questions and the reaction-time baseline, which is not a shortcut
            but the removal of everything the scores are computed from: no baseline means no z-score,
            and every reading afterwards is measured against a default that describes nobody.

            The intro is skippable. What comes after it is the product.
          */}
          <Pressable onPress={() => go('A2')} accessibilityRole="button" accessibilityLabel="Skip the introduction">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>
        <View style={styles.hero}>
          {/* source: 300x300, from 180deg, blur(38px) saturate(150%), opacity .55, swirl 20s */}
          <AmbientBlob size={300} fromDeg={180} blurPx={38} saturate={1.5} opacity={0.55} durationMs={20000} />
          <GlassOrb size={264} highlight={0.3} borderAlpha={0.16} breatheMs={6000}>
            <Text style={styles.wordmark}>SOMNO</Text>
          </GlassOrb>
        </View>
        {/* The design lays all three slides on a 300%-wide track and slides it
            (`transition: transform .52s cubic-bezier(.22,1,.36,1)`) rather than swapping the
            text in place, so the copy carries across. */}
        <View style={styles.slideClip} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
          <Animated.View
            style={[
              styles.slideTrack,
              { width: trackW * 3, transform: [{ translateX: shift.interpolate({ inputRange: [0, 2], outputRange: [0, -trackW * 2] }) }] },
            ]}
          >
            {onboardingSlides.map((s2) => (
              <View key={s2.title} style={[styles.slide, { width: trackW }]}>
                <Text style={styles.headline}>{s2.title}</Text>
                <Text style={styles.body}>{s2.body}</Text>
              </View>
            ))}
          </Animated.View>
        </View>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <Pressable key={i} onPress={() => setSlide(i)} hitSlop={8} accessibilityRole="button">
              {/* `transition: width .4s cubic-bezier(.22,1,.36,1), background .3s ease` */}
              <Animated.View
                style={[
                  styles.dot,
                  {
                    width: dotW[i].interpolate({ inputRange: [0, 1], outputRange: [10, 30] }),
                    backgroundColor: dotW[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: ['rgba(236,234,246,0.25)', 'rgba(236,234,246,1)'],
                    }),
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <PrimaryButton label={current.cta} onPress={nextSlide} />
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  skipRow: { alignItems: 'flex-end', paddingHorizontal: 26, paddingTop: 10 },
  skip: { fontFamily: font.sans500, fontSize: 14, color: color.textDim50 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontFamily: font.sans500, fontSize: 15, color: color.textDim70, letterSpacing: 3 },
  slideClip: { overflow: 'hidden' },
  slideTrack: { flexDirection: 'row' },
  slide: { paddingHorizontal: 32, gap: 12 },
  headline: { fontFamily: font.serif, fontSize: 38, lineHeight: 41, color: color.text },
  body: { fontFamily: font.sans400, fontSize: 15, lineHeight: 23, color: color.textDim55 },
  dots: { flexDirection: 'row', gap: 7, justifyContent: 'center', paddingTop: 26 },
  dot: { height: 6, borderRadius: 3 },
  footer: { paddingHorizontal: 26, paddingTop: 22, paddingBottom: 0 },
});
