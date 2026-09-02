import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the OS "Reduce Motion" setting is on.
 *
 * This app leans hard on continuous motion — every screen has a blob swirling behind it, the
 * ambient wash drifts, orbs breathe, the scan ripples. That is the design's character, but for
 * someone with vestibular sensitivity it is exactly the kind of persistent background movement
 * that causes trouble, and it is also a constant GPU cost. When the setting is on we hold every
 * looping animation at its resting frame and let entry transitions resolve instantly, keeping the
 * layout and colour identical.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
