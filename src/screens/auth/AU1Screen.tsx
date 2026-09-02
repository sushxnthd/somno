import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassOrb, AmbientBlob } from '../../components';
import { Icon } from '../../components/Icons';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { APPLE_COMING_SOON, isAppleEnabled, signInWithApple, signInWithGoogle } from '../../lib/auth';
import { finishSignIn } from '../../lib/signInFlow';
import { haptics } from '../../theme/haptics';
import { openLegal } from '../../lib/legal';
import { motion } from '../../theme/motion';
import { useReduceMotion } from '../../theme/useReduceMotion';

export function AU1Screen() {
  const go = useSomnoStore((s) => s.go);
  const skipAuth = useSomnoStore((s) => s.skipAuth);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reduceMotion = useReduceMotion();
  const showApple = Platform.OS === 'ios' || isAppleEnabled;
  const noteFade = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A short inline line under the buttons, rather than an alert: it answers the tap without
  // taking over the screen, and it is announced to screen readers as a live region.
  const say = useCallback(
    (message: string) => {
      setNote(message);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (reduceMotion) {
        noteFade.setValue(1);
      } else {
        Animated.timing(noteFade, { toValue: 1, duration: 180, easing: motion.press.easing, useNativeDriver: true }).start();
      }
      hideTimer.current = setTimeout(() => {
        Animated.timing(noteFade, { toValue: 0, duration: 220, easing: motion.press.easing, useNativeDriver: true }).start(
          ({ finished }) => finished && setNote(null)
        );
      }, 3200);
    },
    [noteFade, reduceMotion]
  );

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const onApple = useCallback(async () => {
    const r = await signInWithApple();
    haptics.warn();
    say(r.status === 'coming-soon' ? r.message : APPLE_COMING_SOON);
  }, [say]);

  const onGoogle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const r = await signInWithGoogle();
    switch (r.status) {
      case 'ok':
        haptics.success();
        // Stays busy across the restore: the account's history is pulled before the app routes,
        // so a returning user lands on Home rather than back at the start of onboarding.
        await finishSignIn();
        setBusy(false);
        return;
      case 'cancelled':
        break; // the user backed out; saying anything would be noise
      case 'unconfigured':
        say('Accounts are not set up yet. You can continue without one.');
        break;
      default:
        haptics.warn();
        say('message' in r ? r.message : 'Could not sign in with Google.');
    }
    setBusy(false);
  }, [busy, say]);

  return (
    <ScreenContainer entry={false}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.hero}>
          {/* blob (104px) behind a glass disc inset 8px, per the prototype's AU1 markup */}
          <View style={styles.orbWrap}>
            {/* source: inset:0 of a 104px box, from 200deg, blur(22px) saturate(180%), .62, 18s */}
            <AmbientBlob size={104} fromDeg={200} blurPx={22} saturate={1.8} opacity={0.62} durationMs={18000} />
            <GlassOrb size={88} highlight={0} fill={0.07} borderAlpha={0.18}>
              <Icon name="moon" size={30} color="#FFFFFF" strokeWidth={2.2} />
            </GlassOrb>
          </View>
          <Text style={styles.headline}>Your best day starts the night before.</Text>
          <Text style={styles.body}>
            An account keeps your baseline and your trends when you change phone. Everything else stays on the device.
          </Text>
        </View>
        <View style={styles.actions}>
          <PrimaryButton label="Continue with email" icon="mail" height={56} onPress={() => go('AU2')} />
          {/* Apple is an iOS affordance and cannot ever work on Android, so it is not offered
              there — a button that can only apologise is worse than no button. On iOS it stays
              visually identical to the other options and reports "coming soon" from the auth
              layer, which is also where enabling it for real happens. */}
          {showApple && <SecondaryButton label="Continue with Apple" icon="lock" onPress={onApple} />}
          <SecondaryButton label="Continue with Google" icon="user" onPress={onGoogle} disabled={busy} />
          <Pressable onPress={skipAuth} style={{ paddingVertical: 6 }} accessibilityRole="button">
            <Text style={styles.skip}>Continue without an account</Text>
          </Pressable>
          {note && (
            <Animated.Text style={[styles.note, { opacity: noteFade }]} accessibilityLiveRegion="polite">
              {note}
            </Animated.Text>
          )}
          <Text style={styles.legal}>
            By continuing you agree to the{' '}
            <Text style={styles.legalLink} onPress={() => openLegal('terms')} accessibilityRole="link">
              Terms
            </Text>{' '}
            and the{' '}
            <Text style={styles.legalLink} onPress={() => openLegal('privacy')} accessibilityRole="link">
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 28 },
  hero: { flex: 1, justifyContent: 'center', gap: 20 },
  orbWrap: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  headline: { fontFamily: font.serif, fontSize: 40, lineHeight: 43, color: color.text },
  body: { fontFamily: font.sans500, fontSize: 14.5, lineHeight: 22, color: color.textDim55 },
  actions: { paddingBottom: 38, gap: 10 },
  skip: { textAlign: 'center', fontFamily: font.sans700, fontSize: 14, color: color.textDim50 },
  note: {
    textAlign: 'center',
    fontFamily: font.sans600,
    fontSize: 12.5,
    lineHeight: 17,
    color: '#C9BCFF',
    paddingHorizontal: 8,
  },
  legal: { textAlign: 'center', fontFamily: font.sans500, fontSize: 11.5, lineHeight: 16, color: color.textDim32, marginTop: 4 },
  legalLink: { textDecorationLine: 'underline', color: color.textDim55 },
});
