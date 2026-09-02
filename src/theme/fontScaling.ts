import { Text, TextInput } from 'react-native';

/**
 * A ceiling on how far the system font size can stretch this app's type.
 *
 * Somno's layouts are dense by design — 11.5px labels inside fixed-height rows, a dial with a
 * numeral centred in it, tab bars with four labels across 390px. At Android's largest accessibility
 * font (roughly 2x) those layouts do not merely look cramped, they overlap and clip, and text
 * disappearing is a worse accessibility outcome than text that stopped growing.
 *
 * 1.3 is the compromise: a third larger is a real, useful increase for anyone who needs it, and it
 * is the point past which the tightest rows here start to collide. Users who need more than that
 * are better served by the system's screen-zoom, which scales the layout rather than only the type.
 *
 * Applied by patching the two components' render, which is the only way to set a default in React
 * Native now that `defaultProps` is gone on function components. Every `<Text>` in the app inherits
 * it, including the ones inside third-party components; anything that genuinely wants a different
 * cap can still pass its own prop, because an explicit prop wins.
 */
export const MAX_FONT_SCALE = 1.3;

type Renderable = { render?: (...args: unknown[]) => unknown };

let applied = false;

export function capFontScaling(max = MAX_FONT_SCALE): void {
  if (applied) return;
  applied = true;

  for (const Component of [Text, TextInput] as unknown as Renderable[]) {
    const original = Component.render;
    if (typeof original !== 'function') continue;
    Component.render = function patched(...args: unknown[]) {
      const element = original.apply(this, args) as {
        props?: Record<string, unknown>;
        type?: unknown;
      } | null;
      if (!element || !element.props) return element;
      // An explicit prop on the element wins: a screen that has been laid out to survive more
      // scaling should be able to say so.
      if (element.props.maxFontSizeMultiplier != null) return element;
      return { ...element, props: { ...element.props, maxFontSizeMultiplier: max } };
    };
  }
}
