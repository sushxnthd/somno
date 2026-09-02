import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip } from './Chip';
import { color, font } from '../theme/tokens';
import type { Gender, Medication } from '../store/types';

/**
 * The two coarse profile choices the recovery engine actually uses, as chip rows.
 *
 * Both are optional and both keep a "prefer not to say" that is a real, selectable answer rather
 * than the absence of one — the spec is explicit about that, and it matters here because these
 * feed transition-matrix multipliers, so an unanswered question has to mean "apply nothing"
 * rather than "assume the default".
 *
 * Medication is a category, never a drug name. The engine treats a sedative and an antidepressant
 * differently (NREM→Wake ×0.8 versus NREM→REM ×0.7), which is the whole reason this is not the
 * yes/no toggle it used to be — that toggle silently applied sedative maths to everyone who took
 * anything at all.
 */

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

const MEDICATIONS: { value: Medication; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'sedative', label: 'Sleep aid' },
  { value: 'stimulant', label: 'Stimulant' },
  { value: 'antidepressant', label: 'Antidepressant' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

export function GenderChoice({ value, onChange }: { value: Gender; onChange: (g: Gender) => void }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.title}>Gender</Text>
      <View style={styles.row}>
        {GENDERS.map((g) => (
          <Chip key={g.value} label={g.label} active={value === g.value} onPress={() => onChange(g.value)} />
        ))}
      </View>
      <Text style={styles.helper}>Optional. Used only to adjust how the recovery model moves between sleep stages.</Text>
    </View>
  );
}

export function MedicationChoice({ value, onChange }: { value: Medication; onChange: (m: Medication) => void }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.title}>Medication that affects sleep</Text>
      <View style={styles.row}>
        {MEDICATIONS.map((m) => (
          <Chip key={m.value} label={m.label} active={value === m.value} onPress={() => onChange(m.value)} />
        ))}
      </View>
      <Text style={styles.helper}>A category only — never a drug name. Different categories change your sleep in different directions.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.sans700, fontSize: 14.5, color: color.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  helper: { fontFamily: font.sans500, fontSize: 11.5, lineHeight: 16, color: color.textDim45 },
});
