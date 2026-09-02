import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, AmbientBlob, Toggle, TimeWheel , RangeSlider } from '../../components';
import { BackChevron } from '../../components/TopBar';
import { Icon } from '../../components/Icons';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { GenderChoice, MedicationChoice } from '../../components/ProfileChoices';
import { chronotypeSummary } from '../../utils/chronotype';
import { dur } from '../../utils/format';
import { MIN_AGE } from '../../engine/debt';

export function A4Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const go = useSomnoStore((s) => s.go);
  const age = useSomnoStore((s) => s.age);
  const setAge = useSomnoStore((s) => s.setAge);
  const bedMin = useSomnoStore((s) => s.bedMin);
  const wakeMin = useSomnoStore((s) => s.wakeMin);
  const idealWake = useSomnoStore((s) => s.idealWake);
  const setBedMin = useSomnoStore((s) => s.setBedMin);
  const setWakeMin = useSomnoStore((s) => s.setWakeMin);
  const setIdealWake = useSomnoStore((s) => s.setIdealWake);
  const gender = useSomnoStore((s) => s.gender);
  const setGender = useSomnoStore((s) => s.setGender);
  const medication = useSomnoStore((s) => s.medication);
  const setMedication = useSomnoStore((s) => s.setMedication);
  const highStress = useSomnoStore((s) => s.highStress);
  const toggleHighStress = useSomnoStore((s) => s.toggleHighStress);

  const chronoDelta = chronotypeSummary(wakeMin, idealWake);

  /**
   * This screen is reached from two very different places.
   *
   * During onboarding it is step four of a chain that ends in baseline calibration. From Settings →
   * Profile it is "Retake quiz", and the user is only there to change an answer — but every exit
   * led onward: Continue and Skip both went to A5, whose button is "Start calibration", so tapping
   * Retake quiz put an established user back at the start of a reaction-time baseline they already
   * had, and Back dropped them into A3. Entered from settings, every exit returns to settings.
   */
  const cameFrom = useSomnoStore((s) => s.history[s.history.length - 1]);
  const fromSettings = cameFrom === 'F1';
  const leave = () => go(fromSettings ? 'F1' : 'A5');

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.top}>
          <BackChevron onPress={() => go(fromSettings ? 'F1' : 'A3')} />
          {/* There is nothing to skip when the user came here on purpose to change one answer. */}
          {!fromSettings && (
            <Pressable onPress={() => go('A5')} accessibilityRole="button">
              <Text style={styles.skip}>Skip this step</Text>
            </Pressable>
          )}
        </View>
        <ScrollView style={styles.body} contentContainerStyle={{ gap: 14, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>A little about you</Text>

          <GlassCard variant="strong" radiusSize={24} pad={20}>
            <View style={{ gap: 14 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Age</Text>
                <Text style={styles.ageValue}>{age >= 90 ? '90+' : age}</Text>
              </View>
              <RangeSlider
                value={age}
                min={MIN_AGE}
                max={90}
                step={1}
                onChange={setAge}
                label="Age"
                formatValue={(v) => (v >= 90 ? '90 or older' : `${v} years`)}
              />
              <View style={styles.rowBetween}>
                <Text style={styles.rangeLabel}>{MIN_AGE}</Text>
                <Text style={styles.rangeLabel}>90+</Text>
              </View>
              <Text style={styles.helper}>{`Sleep need shifts with age, and helps personalize recovery. Somno is for ages ${MIN_AGE} and up.`}</Text>
            </View>
          </GlassCard>

          <GlassCard variant="soft" radiusSize={26} pad={18} style={{ overflow: 'hidden' }}>
            {/* source: 200x200 at right/top -70, from 160deg, blur(40px) saturate(180%), .42, 22s */}
            <AmbientBlob size={200} style={{ right: -70, top: -70, left: undefined }} fromDeg={160} blurPx={40} saturate={1.8} opacity={0.42} durationMs={22000} />
            <View style={{ gap: 12 }}>
              <View style={styles.rowIcon}>
                <Icon name="bed" size={17} color={color.textDim70} />
                <Text style={styles.cardTitle}>Your usual night</Text>
              </View>
              <View style={styles.wheelsRow}>
                <TimeWheel label="BEDTIME" minutes={bedMin} onChange={setBedMin} />
                <View style={styles.divider} />
                <TimeWheel label="WAKE" minutes={wakeMin} onChange={setWakeMin} />
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.helper}>Scroll or tap a time</Text>
                <Text style={styles.windowLabel}>{dur(bedMin, wakeMin)} in bed</Text>
              </View>
            </View>
          </GlassCard>

          <GlassCard variant="faint" radiusSize={24} pad={18}>
            <View style={{ gap: 10 }}>
              <View style={styles.rowIcon}>
                <Icon name="sun" size={17} color={color.textDim70} />
                <Text style={styles.cardTitle}>If your schedule were your own, you'd wake at…</Text>
              </View>
              <TimeWheel label="IDEAL WAKE" minutes={idealWake} onChange={setIdealWake} />
              <Text style={[styles.helper, { textAlign: 'center' }]}>{chronoDelta}</Text>
            </View>
          </GlassCard>

          <GlassCard variant="faint" radiusSize={24} pad={18}>
            <View style={{ gap: 18 }}>
              <GenderChoice value={gender} onChange={setGender} />
              <MedicationChoice value={medication} onChange={setMedication} />
            </View>
          </GlassCard>

          <Pressable onPress={toggleHighStress} style={styles.medsRow} accessibilityRole="switch" accessibilityLabel="Under sustained stress" accessibilityState={{ checked: highStress }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.medsText}>I'm under sustained stress or heavy load</Text>
              <Text style={styles.medsSub}>Fragmented sleep is expected under load; the model accounts for it.</Text>
            </View>
            <Toggle label="Under sustained stress" value={highStress} onToggle={toggleHighStress} interactive={false} />
          </Pressable>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <PrimaryButton label={fromSettings ? 'Done' : 'Continue'} onPress={leave} />
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 26, paddingTop: 16 },
  skip: { fontFamily: font.sans500, fontSize: 13.5, color: color.textDim50 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 14 },
  headline: { fontFamily: font.serif, fontSize: 32, lineHeight: 35.84, color: color.text }, // 32px/1.12
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowIcon: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardTitle: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  ageValue: { fontFamily: font.serif, fontSize: 30, color: color.text },
  rangeLabel: { fontFamily: font.sans500, fontSize: 11, color: color.textDim40 },
  helper: { fontFamily: font.sans500, fontSize: 11.5, lineHeight: 16, color: color.textDim45 },
  wheelsRow: { flexDirection: 'row', gap: 14 },
  divider: { width: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
  windowLabel: { fontFamily: font.sans700, fontSize: 12.5, color: '#C9BCFF' },
  medsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: 15,
  },
  medsText: { flex: 1, fontFamily: font.sans500, fontSize: 13.5, lineHeight: 18, color: color.text },
  medsSub: { fontFamily: font.sans500, fontSize: 11.5, lineHeight: 16, color: color.textDim45, marginTop: 3 },
  footer: { paddingHorizontal: 24, paddingBottom: 0, paddingTop: 14 },
});
