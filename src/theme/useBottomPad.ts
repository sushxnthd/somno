import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom padding for a screen's footer.
 *
 * The design's phone frame has no home indicator, so its footers sit at a flat 40-44px from the
 * bottom edge. Two things go wrong if that number is used literally on a real device. Wrapping the
 * screen in a SafeAreaView that also claims the bottom edge stacks the inset ON TOP of the design's
 * padding, so on a notched iPhone the CTA floats ~74pt up and the screen reads as under-filled.
 * Dropping the inset entirely instead risks the button sitting under the home indicator on
 * hardware whose inset is larger than the design's padding.
 *
 * So: take the design's value, and only grow it when the hardware needs more room.
 */
export function useBottomPad(designPadding: number): number {
  const insets = useSafeAreaInsets();
  return Math.max(designPadding, insets.bottom + 8);
}
