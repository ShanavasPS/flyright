import { Canvas, DashPathEffect, RoundedRect, useClock } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';

/** The live card's status border, and the light that runs around it. */
export const BORDER_WIDTH = 1.5;
/** One lap of the light, and how much of the perimeter it lights. */
const SWEEP_MS = 3200;
const SWEEP_SHARE = 0.3;

/**
 * The light that runs clockwise around the live card: a stroked rounded
 * rectangle the card's exact size, dashed as one bright segment plus one gap
 * the rest of the perimeter, with the dash phase driven round the path. The
 * card's own border stays beneath at low opacity, so the ring is always
 * closed and the segment reads as light moving along it rather than a border
 * appearing and vanishing. Before the live window (the evening before) and
 * under reduce-motion the border is simply solid.
 *
 * Drawn with Skia off a clock, not with an SVG and a repeating Reanimated
 * animation: the phase is a pure function of time, so nothing can leave it
 * stranded — no repeat to restart, no animated props for a React commit to
 * overwrite (Reanimated #5604, an SVG animation freezing when an unrelated
 * prop changes on the new architecture).
 */
export function RunningBorder({ color, radius, running }: { color: string; radius: number; running: boolean }) {
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });

  const inset = BORDER_WIDTH / 2;
  const w = size.w - BORDER_WIDTH;
  const h = size.h - BORDER_WIDTH;
  const r = radius - inset;
  // Four straight runs plus the four quarter-circles the corners add up to.
  const perimeter = w > 0 && h > 0 ? 2 * (w + h) - 8 * r + 2 * Math.PI * r : 0;
  const animate = running && !reduceMotion && perimeter > 0;

  const frame = { x: inset, y: inset, width: w, height: h, r };
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {perimeter > 0 && animate && (
        <Canvas style={{ width: size.w, height: size.h }}>
          <RunningRing frame={frame} perimeter={perimeter} color={color} />
        </Canvas>
      )}
      {perimeter > 0 && !running && (
        <Canvas style={{ width: size.w, height: size.h }}>
          <RoundedRect {...frame} style="stroke" strokeWidth={BORDER_WIDTH} color={color} />
        </Canvas>
      )}
    </View>
  );
}

/** The moving segment. Its own component so the clock only ticks while the
 * light is actually running. */
function RunningRing({
  frame,
  perimeter,
  color,
}: {
  frame: { x: number; y: number; width: number; height: number; r: number };
  perimeter: number;
  color: string;
}) {
  const clock = useClock();
  // A full negative perimeter per lap moves the segment in path direction —
  // clockwise from the top-left, the way the rect is built — and the modulo
  // lands every lap exactly where it began, so the loop is seamless.
  const phase = useDerivedValue(() => -((clock.value % SWEEP_MS) / SWEEP_MS) * perimeter);
  return (
    <RoundedRect {...frame} style="stroke" strokeWidth={BORDER_WIDTH} strokeCap="round" color={color}>
      <DashPathEffect intervals={[perimeter * SWEEP_SHARE, perimeter * (1 - SWEEP_SHARE)]} phase={phase} />
    </RoundedRect>
  );
}
