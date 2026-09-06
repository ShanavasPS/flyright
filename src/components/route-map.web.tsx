import { Pressable, StyleSheet, View } from 'react-native';

import { RouteAtlas } from '@/components/route-atlas';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAirport } from '@/services/airports';
import type { RouteSource } from '@/services/geo';

export const ROUTE_MAP_HEIGHT = 220;

/** Web: the detail screen's inset map is always the SVG atlas the web World
 * tab uses, fitted to this one route. */
/** `onPress` is optional: a followed person's trip shows the same map, but
 * the World tab draws the viewer's OWN journal and has nothing to open it
 * on — so there the card is a picture, not a button, and does not pretend
 * otherwise by staying pressable. */
export function RouteMap({
  journey,
  onPress,
}: {
  journey: RouteSource;
  onPress?: () => void;
}) {
  const theme = useTheme();
  if (!getAirport(journey.fromCode) || !getAirport(journey.toCode)) return null;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={onPress ? 'Open in World' : 'Route map'}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.card, { borderColor: theme.hairline }]}>
      <RouteAtlas journeys={[journey]} height={ROUTE_MAP_HEIGHT} />
      <View style={[styles.expand, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          World
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: ROUTE_MAP_HEIGHT,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  expand: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
});
