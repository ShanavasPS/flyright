import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pathCaption, type RoutePathKind } from '@/services/geo';

/** Which line the inset map is drawing — "Flown path", "Filed route", or
 * "Overview" for the great circle. The great circle is the honest default
 * and looks exactly like a flight path, so the caption is always there;
 * quiet, in the corner the World pill leaves free. Nothing else joins it:
 * the sun and the aircraft speak for themselves on the globe. */
export function PathCaption({ path }: { path: { kind: RoutePathKind; complete: boolean } | null | undefined }) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]} pointerEvents="none">
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {pathCaption(path)}
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
