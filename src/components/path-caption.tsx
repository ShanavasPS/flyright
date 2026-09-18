import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pathCaption, type RoutePathKind } from '@/services/geo';

/** Which line the inset map is drawing — "Flown path", "Filed route", or
 * "Overview" for the great circle. The great circle is the honest default
 * and looks exactly like a flight path, so the caption is always there;
 * quiet, in the corner the World pill leaves free. With the globe lit by
 * the sun, it also says which moment the light is for. */
export function PathCaption({
  path,
  daylight = null,
  plane = null,
}: {
  path: { kind: RoutePathKind; complete: boolean } | null | undefined;
  daylight?: 'take-off' | 'landing' | 'now' | null;
  /** How the aircraft was placed, for a flight in the air: a reported
   * position, or the timetable's estimate. Said plainly either way. */
  plane?: 'reported' | 'estimated' | null;
}) {
  const theme = useTheme();
  const parts = [pathCaption(path)];
  if (plane) parts.push(plane === 'reported' ? 'Plane as reported' : 'Plane estimated');
  if (daylight) parts.push(daylight === 'now' ? 'Daylight now' : `Daylight at ${daylight}`);
  return (
    <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]} pointerEvents="none">
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {parts.join(' · ')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: Spacing.three,
    bottom: Spacing.three,
    // Three facts at most ("Overview · Plane estimated · Daylight now"):
    // wrap before running under the World pill on the right.
    maxWidth: '62%',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + Spacing.half,
    borderRadius: Spacing.five,
    opacity: 0.92,
  },
  text: { fontSize: 11 },
});
