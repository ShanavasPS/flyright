import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

/** Drives a number from 0 to `target` once, easing out — the classic stat
 * reveal. Restarts if `target` changes; shows the final value immediately
 * under reduce-motion. */
export function useCountUp(target: number, duration = 900): number {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(reduceMotion ? target : 0);

  useEffect(() => {
    let raf = 0;
    if (reduceMotion || !target) {
      raf = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(raf);
    }
    const started = performance.now();
    const tick = (nowMs: number) => {
      const t = Math.min(1, (nowMs - started) / duration);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduceMotion]);

  return value;
}
