import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

/** The live card's status border, and the light that runs around it. */
export const BORDER_WIDTH = 1.5;
const SWEEP_MS = 3200;
const SWEEP_SHARE = 0.3;
const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** The web twin of the native (Skia) running border: the same ring as an
 * SVG with its dash offset driven by Reanimated, which is what the site's
 * bundle can draw. Native left this path because a React commit could
 * strand the SVG animation on the new architecture; the web has no such
 * commit and no Skia canvas without CanvasKit. */
export function RunningBorder({ color, radius, running }: { color: string; radius: number; running: boolean }) {
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const offset = useSharedValue(0);

  const inset = BORDER_WIDTH / 2;
  const w = size.w - BORDER_WIDTH;
  const h = size.h - BORDER_WIDTH;
  const r = radius - inset;
  const perimeter = w > 0 && h > 0 ? 2 * (w + h) - 8 * r + 2 * Math.PI * r : 0;
  const animate = running && !reduceMotion && perimeter > 0;

  const frame = useFrameCallback(({ timestamp }) => {
    offset.value = -((timestamp % SWEEP_MS) / SWEEP_MS) * perimeter;
  }, false);

  useEffect(() => {
    frame.setActive(animate);
    return () => frame.setActive(false);
  }, [animate, frame]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {perimeter > 0 && (
        <Svg width={size.w} height={size.h}>
          <AnimatedRect
            x={inset}
            y={inset}
            width={w}
            height={h}
            rx={r}
            ry={r}
            fill="none"
            stroke={color}
            strokeWidth={BORDER_WIDTH}
            strokeLinecap="round"
            strokeDasharray={animate ? [perimeter * SWEEP_SHARE, perimeter * (1 - SWEEP_SHARE)] : undefined}
            animatedProps={animatedProps}
          />
        </Svg>
      )}
    </View>
  );
}
