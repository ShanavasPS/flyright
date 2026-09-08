import { useEffect, useRef } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { YearWheelProps } from './year-wheel';

const ROW = 44;
/** Rows visible at once — odd, so one sits in the middle under the band. */
const VISIBLE = 5;

/** Android: a wheel built from a snapping list — one row per year, a
 * highlighted band across the middle, the selection whatever stops under
 * it. @expo/ui's Picker has no wheel appearance on Android, and a menu of
 * sixty years is no way to pick one. */
export function YearWheel({ value, years, onChange }: YearWheelProps) {
  const theme = useTheme();
  const list = useRef<ScrollView>(null);
  const pad = Math.floor(VISIBLE / 2);
  const index = Math.max(0, years.indexOf(value));
  // Start on the current year. A plain ScrollView (not a FlatList) so the
  // gesture is the platform's own — the virtualised list inside a modal
  // card swallowed drags on Android.
  useEffect(() => {
    list.current?.scrollTo({ y: index * ROW, animated: false });
    // Only on mount: afterwards the wheel is where the finger left it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ROW);
    const year = years[Math.min(years.length - 1, Math.max(0, i))];
    if (year !== undefined && year !== value) onChange(year);
  };

  return (
    <View style={styles.wheel} accessibilityRole="adjustable" accessibilityLabel={`Year ${value}`}>
      <View
        pointerEvents="none"
        style={[styles.band, { top: pad * ROW, backgroundColor: theme.field }]}
      />
      <ScrollView
        ref={list}
        nestedScrollEnabled
        snapToInterval={ROW}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        contentContainerStyle={{ paddingVertical: pad * ROW }}>
        {years.map((item) => (
          <View key={item} style={styles.row}>
            <ThemedText
              type={item === value ? 'subtitle' : 'default'}
              themeColor={item === value ? 'heading' : 'textSecondary'}>
              {item}
            </ThemedText>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    height: ROW * VISIBLE,
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW,
    borderRadius: Spacing.two,
  },
  row: {
    height: ROW,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
