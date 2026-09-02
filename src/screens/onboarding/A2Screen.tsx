import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, ProgressStep } from '../../components';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { openLegal } from '../../lib/legal';

export function A2Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const consent = useSomnoStore((s) => s.consent);
  const toggleConsent = useSomnoStore((s) => s.toggleConsent);
  const consentContinue = useSomnoStore((s) => s.consentContinue);
  const openSheet = useSomnoStore((s) => s.openSheet);

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ProgressStep step={2} />
        <View style={styles.body}>
          <Text style={styles.headline}>Before we begin</Text>
          <GlassCard variant="strong" radiusSize={24} pad={20}>
            <View style={{ gap: 14 }}>
              <Text style={styles.p}>Somno is a wellness tool, not a medical device. It doesn't diagnose sleep disorders.</Text>
              <Text style={styles.p}>Your face scans are processed on your device and never uploaded as photos. Only a few numeric measurements are saved.</Text>
              <Text style={styles.p}>You're always in control: every permission is optional and can be changed later in Settings.</Text>
              <Pressable
                onPress={() =>
                  openSheet(
                    'Privacy in one page',
                    'Face scans are analysed on-device and discarded. Only a handful of numbers are kept. Reaction times, ratings and sleep entries sync to your account so trends survive a new phone. Nothing is sold or shared with advertisers.'
                  )
                }
               accessibilityRole="button">
                <Text style={styles.link}>Read full policy</Text>
              </Pressable>
            </View>
          </GlassCard>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <Pressable onPress={toggleConsent} style={styles.consentRow} accessibilityRole="button">
            <View style={[styles.checkbox, consent && { backgroundColor: color.text }]}>
              {consent && <Text style={styles.check}>✓</Text>}
            </View>
            {/* The row still toggles the checkbox; only the two document names swallow their own
                tap, so agreeing and reading are separate gestures rather than a gamble. */}
            <Text style={styles.consentText}>
              I understand and agree to the{' '}
              <Text style={styles.consentLink} onPress={() => openLegal('privacy')} accessibilityRole="link">
                Privacy Policy
              </Text>{' '}
              and{' '}
              <Text style={styles.consentLink} onPress={() => openLegal('terms')} accessibilityRole="link">
                Terms
              </Text>
            </Text>
          </Pressable>
          <PrimaryButton label="Continue" onPress={consentContinue} disabled={!consent} />
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 20, gap: 14 },
  headline: { fontFamily: font.serif, fontSize: 34, lineHeight: 38, color: color.text },
  p: { fontFamily: font.sans400, fontSize: 14, lineHeight: 21.5, color: color.textDim70 },
  link: { fontFamily: font.sans700, fontSize: 13.5, color: '#A99BFF' },
  footer: { paddingHorizontal: 24, paddingBottom: 0, gap: 14 },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { fontFamily: font.sans700, fontSize: 13, color: color.ink },
  consentText: { flex: 1, fontFamily: font.sans500, fontSize: 13.5, lineHeight: 18, color: color.text },
  consentLink: { textDecorationLine: 'underline', color: '#C9BCFF' },
});
