import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  countdownCells,
  countdownSpoken,
  FLAP_BOARD,
  FLAP_COLON,
  FLAP_DIGIT,
  FLAP_LABEL,
  FLAP_SPLIT,
  FLAP_TILE,
  FLAP_TILE_TOP,
  flapMetrics,
  type FlapCell,
  type FlapMetrics,
} from '@/services/countdown-digits';

/** How long one digit takes to flip. */
const FLIP_MS = 320;

/** The split-flap countdown of the Flights live card: a dark board of digit
 * tiles — hours, minutes, seconds — each flipping down like an airport
 * departures board when it changes, HOURS / MIN / SEC marked under them.
 * The Lock Screen Live Activity and the Home Screen widget draw the same
 * face around the system's timer (services/countdown-digits has the shared
 * measure). `end` is the instant it counts to; the caller shows words
 * instead once that has passed. */
export function SplitFlapClock({
  end,
  now,
  height = 44,
  seconds = true,
  digitColor = FLAP_DIGIT,
}: {
  end: number;
  now: number;
  height?: number;
  seconds?: boolean;
  /** Amber once the airline has posted a delay, like the clock it replaces. */
  digitColor?: string;
}) {
  const m = flapMetrics(height);
  const left = end - now;
  const cells = countdownCells(left, { seconds });
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={countdownSpoken(left)}
      style={[styles.board, { padding: m.boardPad, paddingBottom: m.boardPad * 0.8, borderRadius: m.boardRadius }]}>
      <View style={[styles.row, { gap: m.gap }]}>
        {cells.map((cell, i) =>
          cell.kind === 'digit' ? (
            <FlapDigit key={i} value={cell.value} m={m} color={digitColor} />
          ) : (
            <Text key={i} style={[styles.colon, { width: m.colonWidth, fontSize: m.fontSize * 0.76, lineHeight: m.height }]}>
              :
            </Text>
          ),
        )}
      </View>
      <Labels cells={cells} m={m} />
    </View>
  );
}

/** HOURS / MIN / SEC, each centred under its pair of tiles. */
function Labels({ cells, m }: { cells: FlapCell[]; m: FlapMetrics }) {
  const groups: { label: string; width: number }[] = [];
  let i = 0;
  while (i < cells.length) {
    const cell = cells[i];
    if (cell.kind === 'colon') {
      groups.push({ label: '', width: m.colonWidth });
      i++;
      continue;
    }
    let n = 0;
    while (i + n < cells.length && cells[i + n].kind === 'digit') n++;
    const label = cell.group === 'hours' ? (n > 1 ? 'HOURS' : 'HRS') : cell.group === 'minutes' ? 'MIN' : 'SEC';
    groups.push({ label, width: n * m.tileWidth + (n - 1) * m.gap });
    i += n;
  }
  return (
    <View style={[styles.row, { gap: m.gap, marginTop: Math.max(4, m.height * 0.12) }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {groups.map((g, k) => (
        <Text key={k} numberOfLines={1} style={[styles.label, { width: g.width }]}>
          {g.label}
        </Text>
      ))}
    </View>
  );
}

/** One tile. The digit is drawn in halves: the top and bottom of the new
 * digit lie flat beneath; when the value changes the old digit's top half
 * folds down over the split and the new digit's bottom half falls into
 * place behind it, as a departures board does. Under Reduce Motion the tile
 * simply shows the new digit. */
const FlapDigit = memo(function FlapDigit({ value, m, color }: { value: string; m: FlapMetrics; color: string }) {
  // What the tile shows and what it showed before — derived during render
  // (React's pattern for state that follows a prop), so the old digit is
  // known in the same pass that brings the new one.
  const [shown, setShown] = useState({ current: value, previous: value });
  if (shown.current !== value) setShown({ current: value, previous: shown.current });
  // A fresh flip per change: mounted at the fold's start, so the first
  // frame already shows the old digit — resetting a shared value after
  // the render flashed the new digit for a frame first.
  return <Flip key={shown.current} current={shown.current} previous={shown.previous} m={m} color={color} />;
});

function Flip({ current, previous, m, color }: { current: string; previous: string; m: FlapMetrics; color: string }) {
  const reduceMotion = useReducedMotion();
  const still = current === previous || reduceMotion;
  const progress = useSharedValue(still ? 1 : 0);

  useEffect(() => {
    if (!still) progress.value = withTiming(1, { duration: FLIP_MS, easing: Easing.inOut(Easing.quad) });
  }, [still, progress]);

  const half = m.height / 2;
  // Rotating about the split, not the half's centre: shift the pivot down
  // to the fold, turn, shift back.
  const topFlap = useAnimatedStyle(() => ({
    opacity: progress.value < 0.5 ? 1 : 0,
    transform: [
      { perspective: m.height * 6 },
      { translateY: half / 2 },
      { rotateX: `${interpolate(progress.value, [0, 0.5], [0, -90], 'clamp')}deg` },
      { translateY: -half / 2 },
    ],
  }));
  const bottomFlap = useAnimatedStyle(() => ({
    opacity: progress.value >= 0.5 ? 1 : 0,
    transform: [
      { perspective: m.height * 6 },
      { translateY: -half / 2 },
      { rotateX: `${interpolate(progress.value, [0.5, 1], [90, 0], 'clamp')}deg` },
      { translateY: half / 2 },
    ],
  }));

  const digit = (d: string, part: 'top' | 'bottom') => (
    <Text
      style={[
        styles.digit,
        { fontSize: m.fontSize, lineHeight: m.height, height: m.height, width: m.tileWidth, color },
        part === 'bottom' && { marginTop: -half },
      ]}>
      {d}
    </Text>
  );
  const halfStyle = (part: 'top' | 'bottom') => [
    styles.half,
    { height: half, width: m.tileWidth },
    part === 'top'
      ? { top: 0, borderTopLeftRadius: m.radius, borderTopRightRadius: m.radius, backgroundColor: FLAP_TILE_TOP }
      : { bottom: 0, borderBottomLeftRadius: m.radius, borderBottomRightRadius: m.radius, backgroundColor: FLAP_TILE },
  ];

  return (
    <View style={[styles.tile, { width: m.tileWidth, height: m.height, borderRadius: m.radius }]}>
      {/* Beneath: the new digit's top, the old digit's bottom. */}
      <View style={halfStyle('top')}>{digit(current, 'top')}</View>
      <View style={halfStyle('bottom')}>{digit(previous, 'bottom')}</View>
      {/* The flaps: the old top folding down, the new bottom falling in. */}
      <Animated.View style={[halfStyle('top'), topFlap]}>{digit(previous, 'top')}</Animated.View>
      <Animated.View style={[halfStyle('bottom'), bottomFlap]}>{digit(current, 'bottom')}</Animated.View>
      {/* The split and its hinges. */}
      <View pointerEvents="none" style={[styles.split, { top: half - 0.5 }]} />
      <View pointerEvents="none" style={[styles.hinge, { left: -1, top: half - 3 }]} />
      <View pointerEvents="none" style={[styles.hinge, { right: -1, top: half - 3 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'flex-start',
    backgroundColor: FLAP_BOARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tile: {
    overflow: 'hidden',
    backgroundColor: FLAP_TILE,
  },
  half: {
    position: 'absolute',
    left: 0,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  digit: {
    textAlign: 'center',
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  colon: {
    textAlign: 'center',
    fontWeight: '700',
    color: FLAP_COLON,
    includeFontPadding: false,
  },
  split: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: FLAP_SPLIT,
  },
  hinge: {
    position: 'absolute',
    width: 3,
    height: 6,
    borderRadius: 1,
    backgroundColor: FLAP_SPLIT,
  },
  label: {
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: FLAP_LABEL,
  },
});
