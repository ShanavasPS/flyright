import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type View, type ViewProps, type ViewInstance} from 'react-native';

/** The website's motion, kept to two moves: a block that fades and settles
 * into place the first time it scrolls into view (`Reveal`), and a slow
 * float for the phones (`Float`). Both are inert when the visitor asked the
 * OS for reduced motion, and a block that cannot be observed simply shows. */

function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export function Reveal({
  children,
  style,
  from = 'up',
  delay = 0,
  distance = 28,
  duration = 720,
  eager = false,
  ...rest
}: ViewProps & {
  /** Where the block settles in from. */
  from?: 'up' | 'left' | 'right';
  delay?: number;
  distance?: number;
  duration?: number;
  /** Play on mount rather than on scrolling into view — for a block that
   * straddles the fold, whose top sliver must show without being scrolled
   * to (the hero's phones on a small phone). */
  eager?: boolean;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  const ref = useRef<ViewInstance>(null);

  useEffect(() => {
    const node = ref.current as unknown as Element | null;
    if (reducedMotion() || !node || typeof IntersectionObserver === 'undefined') {
      progress.setValue(1);
      return;
    }
    if (eager) {
      const animation = Animated.timing(progress, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
      animation.start();
      return () => animation.stop();
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        Animated.timing(progress, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      },
      // Fire once a slice of the block is on screen, a little before the
      // bottom edge so it is moving as the visitor reaches it.
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount
  }, []);

  const travel = progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
  const transform =
    from === 'up'
      ? [{ translateY: travel }]
      : [{ translateX: from === 'left' ? Animated.multiply(travel, -1) : travel }];

  return (
    <Animated.View ref={ref} style={[style, { opacity: progress, transform }]} {...rest}>
      {children}
    </Animated.View>
  );
}

export function Float({
  children,
  style,
  amplitude = 7,
  period = 5600,
  delay = 0,
  ...rest
}: ViewProps & { amplitude?: number; period?: number; delay?: number }) {
  const [y] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reducedMotion()) return;
    const half = period / 2;
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -amplitude, duration: half, delay, easing: ease, useNativeDriver: false }),
        Animated.timing(y, { toValue: 0, duration: half, easing: ease, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount
  }, []);

  return (
    <Animated.View style={[style, { transform: [{ translateY: y }] }]} {...rest}>
      {children}
    </Animated.View>
  );
}
