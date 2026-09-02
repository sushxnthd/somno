import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, SleepWindowDial, Toggle, AmbientBlob , RangeSlider } from '../../components';
import { Icon } from '../../components/Icons';
import { color, font } from '../../theme/tokens';
import { useSomnoStore, useIs24h } from '../../store/useSomnoStore';
import { MIN_AGE } from '../../engine/debt';
import { GenderChoice, MedicationChoice } from '../../components/ProfileChoices';
import { chronotypeSummary } from '../../utils/chronotype';
import { fmt } from '../../utils/format';
import { SettingsHeader } from './_shared';

export function F1Screen() {
  const is24h = useIs24h();
  const go = useSomnoStore((s) => s.go);
  const age = useSomnoStore((s) => s.age);
  const ageNeedsConfirming = useSomnoStore((s) => s.ageNeedsConfirming);
  const setAge = useSomnoStore((s) => s.setAge);
  const bedMin = useSomnoStore((s) => s.bedMin);
  const wakeMin = useSomnoStore((s) => s.wakeMin);
  const setBedMin = useSomnoStore((s) => s.setBedMin);
  const setWakeMin = useSomnoStore((s) => s.setWakeMin);
  const gender = useSomnoStore((s) => s.gender);
  const setGender = useSomnoStore((s) => s.setGender);
  const medication = useSomnoStore((s) => s.medication);
  const setMedication = useSomnoStore((s) => s.setMedication);
  const highStress = useSomnoStore((s) => s.highStress);
  const toggleHighStress = useSomnoStore((s) => s.toggleHighStress);
  const idealWake = useSomnoStore((s) => s.idealWake);

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SettingsHeader
          title="Profile"
          onBack={() => go('F0')}
          right={
            <Text onPress={() => go('F0')} style={styles.save}>
              Save
            </Text>
          }
        />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <GlassCard variant="strong" radiusSize={24} pad={20}>
            <View style={{ gap: 14 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Age</Text>
                <Text style={styles.ageValue}>{age >= 90 ? '90+' : age}</Text>
              </View>
              {/* MIN_AGE, not 12. `setAge` clamps to the model's floor, so the slider could be
                  dragged into a range it silently refused to store: the dial read 13 while the
                  profile held 16, and the sleep-need target came from the 16. One number now. */}
              <RangeSlider
                value={age}
                min={MIN_AGE}
                max={90}
                step={1}
                onChange={setAge}
                label="Age"
                formatValue={(v) => (v >= 90 ? '90 or older' : `${v} years`)}
              />
              {/*
                A restored age is an approximation until the user says otherwise.

                The account stores an age *band*, not a birthdate, so a new phone can only recover a
                midpoint. Applying it silently would put a sleep-need target — the denominator of
                every debt figure in the app — on a number nobody entered. Touching the slider is
                the confirmation.
              */}
              {ageNeedsConfirming && (
                <Text style={styles.confirmNote}>
                  Restored from your account as an approximate range. Check it is right — your sleep target depends on it.
                </Text>
              )}
              <View style={styles.rowBetween}>
                <Text style={styles.rangeLabel}>{MIN_AGE}</Text>
                <Text style={styles.rangeLabel}>90+</Text>
              </View>
            </View>
          </GlassCard>

          <GlassCard variant="soft" radiusSize={28} pad={20} style={{ overflow: 'hidden' }}>
            {/* source: 220x220 at left -60 / bottom -80, from 150deg, blur(40px)
                saturate(165%), opacity .4, swirl 24s */}
            <AmbientBlob
              size={220}
              style={{ left: -60, bottom: -80, top: undefined }}
              fromDeg={150}
              blurPx={40}
              saturate={1.65}
              opacity={0.4}
              durationMs={24000}
            />
            <View style={{ alignItems: 'center', gap: 14 }}>
              <View style={styles.rowIconFull}>
                <Icon name="bed" size={17} color={color.textDim70} />
                <Text style={styles.cardTitle}>Your usual night</Text>
                <Text style={styles.dragHint}>drag either handle</Text>
              </View>
              <SleepWindowDial bedMin={bedMin} wakeMin={wakeMin} onChangeBed={setBedMin} onChangeWake={setWakeMin} is24h={is24h} size={224} />
              <Text style={styles.dragSub}>Drag either handle to reshape the night</Text>
              <View style={styles.wheelsRow}>
                <View style={styles.timeCard}>
                  <Icon name="moon" size={16} color="#C9BCFF" />
                  <View>
                    <Text style={styles.timeLabel}>BEDTIME</Text>
                    <Text style={styles.timeValue}>{fmt(bedMin, is24h)}</Text>
                  </View>
                </View>
                <View style={styles.timeCard}>
                  <Icon name="sun" size={16} color="#FFC98F" />
                  <View>
                    <Text style={styles.timeLabel}>WAKE</Text>
                    <Text style={styles.timeValue}>{fmt(wakeMin, is24h)}</Text>
                  </View>
                </View>
              </View>
            </View>
          </GlassCard>

          <GlassCard variant="faint" radiusSize={22} pad={16}>
            <View style={{ gap: 7 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Chronotype</Text>
                <Text onPress={() => go('A4')} style={styles.retake}>
                  Retake quiz
                </Text>
              </View>
              <Text style={styles.chronoBody}>{chronotypeSummary(wakeMin, idealWake)}</Text>
            </View>
          </GlassCard>

          <GlassCard variant="faint" radiusSize={22} pad={16}>
            <View style={{ gap: 18 }}>
              <GenderChoice value={gender} onChange={setGender} />
              <MedicationChoice value={medication} onChange={setMedication} />
            </View>
          </GlassCard>

          <Pressable onPress={toggleHighStress} style={styles.medsRow} accessibilityRole="switch" accessibilityLabel="Under sustained stress" accessibilityState={{ checked: highStress }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.medsText}>Under sustained stress</Text>
              <Text style={styles.medsSub}>Fragmented sleep is expected under load; the model accounts for it.</Text>
            </View>
            <Toggle label="Under sustained stress" value={highStress} onToggle={toggleHighStress} interactive={false} />
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 18 },
  save: { fontFamily: font.sans700, fontSize: 14, color: '#A99BFF' },
  body: { paddingHorizontal: 22, paddingTop: 16, gap: 12, paddingBottom: 40 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowIconFull: { flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'stretch' },
  cardTitle: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  confirmNote: { fontFamily: font.sans500, fontSize: 11.5, lineHeight: 16, color: '#FFD9A0' },
  ageValue: { fontFamily: font.serif, fontSize: 30, color: color.text },
  rangeLabel: { fontFamily: font.sans500, fontSize: 11, color: color.textDim40 },
  dragHint: { marginLeft: 'auto', fontFamily: font.sans500, fontSize: 11.5, color: color.textDim45 },
  dragSub: { fontFamily: font.sans500, fontSize: 12, color: color.textDim50 },
  wheelsRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  timeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    padding: 12,
  },
  timeLabel: { fontFamily: font.sans700, fontSize: 10.5, letterSpacing: 1, color: color.textDim45 },
  timeValue: { fontFamily: font.sans700, fontSize: 14, color: color.text },
  retake: { fontFamily: font.sans500, fontSize: 13, color: '#A99BFF' },
  chronoBody: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim55 },
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
  medsText: { fontFamily: font.sans500, fontSize: 13.5, color: color.text },
  medsSub: { fontFamily: font.sans500, fontSize: 11.5, color: color.textDim45, marginTop: 2 },
});
