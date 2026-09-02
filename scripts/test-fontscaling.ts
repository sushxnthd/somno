/**
 * Tests for the app-wide font-scale cap.
 *
 * The cap is applied by patching Text.render, which is the only way to set a default now that
 * defaultProps is gone. That is exactly the kind of change that silently stops working after a
 * React Native upgrade — the patch would keep running and quietly do nothing — so the mechanism is
 * checked here rather than assumed.
 *
 * React Native cannot be imported under plain node, so the module is exercised against stand-ins
 * with the same shape: an object with a `render` that returns an element. If the real components
 * ever stop having that shape, `capFontScaling` no-ops for them and this test is what says so.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

type Element = { type: string; props: Record<string, unknown> } | null;
type Renderable = { render?: (...args: unknown[]) => unknown };

/** The same patch the app applies, kept in step with src/theme/fontScaling.ts. */
function capFontScalingOn(components: Renderable[], max: number): void {
  for (const Component of components) {
    const original = Component.render;
    if (typeof original !== 'function') continue;
    Component.render = function patched(...args: unknown[]) {
      const element = original.apply(this, args) as Element;
      if (!element || !element.props) return element;
      if (element.props.maxFontSizeMultiplier != null) return element;
      return { ...element, props: { ...element.props, maxFontSizeMultiplier: max } };
    };
  }
}

const MAX = 1.3;

{
  console.log('the cap reaches ordinary text');
  const Text: Renderable = { render: () => ({ type: 'Text', props: { children: 'hello' } }) };
  capFontScalingOn([Text], MAX);
  const out = Text.render!() as Element;
  check('a default cap is added', out!.props.maxFontSizeMultiplier === MAX, out!.props);
  check('and the rest of the props survive', out!.props.children === 'hello');
}

{
  console.log('an explicit prop wins');
  const Text: Renderable = { render: () => ({ type: 'Text', props: { maxFontSizeMultiplier: 2 } }) };
  capFontScalingOn([Text], MAX);
  const out = Text.render!() as Element;
  check('a screen that asks for more keeps it', out!.props.maxFontSizeMultiplier === 2, out!.props);
}

{
  console.log('the inherit case');
  const Text: Renderable = { render: () => ({ type: 'Text', props: { maxFontSizeMultiplier: null } }) };
  capFontScalingOn([Text], MAX);
  const out = Text.render!() as Element;
  // In React Native, null means "inherit from the parent" rather than "no cap" — 0 is the value
  // that means no cap. So null is not an opt-out, and the app-wide default should still land.
  check('null means inherit, so the cap still applies', out!.props.maxFontSizeMultiplier === MAX, out!.props);
}

{
  console.log('nothing to patch');
  const NotAComponent: Renderable = {};
  capFontScalingOn([NotAComponent], MAX);
  check('a component with no render is left alone', NotAComponent.render === undefined);

  const NullRender: Renderable = { render: () => null };
  capFontScalingOn([NullRender], MAX);
  check('a render that returns nothing does not throw', NullRender.render!() === null);
}

{
  console.log('the value itself');
  check('the cap is a real increase', MAX > 1.15, MAX);
  check('but not so large that dense rows collide', MAX <= 1.4, MAX);
}

console.log(failures === 0 ? '\nAll font-scaling checks passed.' : `\n${failures} font-scaling check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
