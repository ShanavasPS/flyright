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
}: {
  path: { kind: RoutePathKind; complete: boolean } | null | undefined;
  daylight?: 'take-off' | 'landing' | 'now' | null;
}) {
  const theme = useTheme();
  const sun = daylight === 'now' ? 'Daylight now' : daylight ? `Daylight at ${daylight}` : null;
  return (
    <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]} pointerEvents="none">
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {sun ? `${pathCaption(path)} · ${sun}` : pathCaption(path)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: Spacing.three,
    bottom: Spacing.three,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + Spacing.half,
    borderRadius: Spacing.five,
    opacity: 0.92,
  },
  text: { fontSize: 11 },
});
