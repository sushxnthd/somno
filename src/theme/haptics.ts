import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Tactile feedback for the interactions where a phone should answer back.
 *
 * The design is a web mockup, so it has no vocabulary for this at all — but the app's core
 * interactions are physical ones: dragging a bedtime around a dial, reacting to a stimulus in a
 * reaction-time test, dismissing an alarm. Feedback on those is what separates the app from a
 * page. Every call is fire-and-forget and swallowed on failure, because haptics are unavailable
 * on web and on some Android hardware, and a missing motor must never break an interaction.
 */
const ok = Platform.OS === 'ios' || Platform.OS === 'android';
const run = (fn: () => Promise<void>) => {
  if (!ok) return;
  fn().catch(() => {});
};

export const haptics = {
  /** A dial or wheel crossing one step. Deliberately the lightest cue — these fire in streams. */
  tick: () => run(() => Haptics.selectionAsync()),
  /** A toggle, chip or segmented control changing state. */
  select: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A primary action: submitting, saving, starting a test. */
  press: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** The tap-test stimulus being hit — the one moment the app measures. */
  stimulus: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** A run finishing: baseline set, scan complete, entry saved. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A false start, a denied permission, a failed scan. */
  warn: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
} as const;
