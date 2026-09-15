import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PathCaption } from '@/components/path-caption';
import { RouteAtlas } from '@/components/route-atlas';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAirport } from '@/services/airports';
import { pathCaption, type RoutePath, type RouteSource } from '@/services/geo';

export const ROUTE_MAP_HEIGHT = 220;

/** Web: the detail screen's inset map is always the SVG atlas the web World
 * tab uses, fitted to this one route. */
/** `onPress` is optional: a followed person's trip shows the same map, but
 * the World tab draws the viewer's OWN journal and has nothing to open it
 * on — so there the card is a picture, not a button, and does not pretend
 * otherwise by staying pressable. */
export function RouteMap({
  journey,
  path,
  onPress,
}: {
  journey: RouteSource;
  path?: RoutePath | null;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const paths = useMemo(() => (path ? { [journey.id]: path } : undefined), [journey.id, path]);
  if (!getAirport(journey.fromCode) || !getAirport(journey.toCode)) return null;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={[
        path
          ? `${pathCaption(path)} from ${journey.fromCode} to ${journey.toCode}`
          : `Overview route from ${journey.fromCode} to ${journey.toCode}; actual flight path may differ`,
        onPress ? 'Open in World' : null,
      ]
        .filter(Boolean)
        .join('. ')}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.card, { borderColor: theme.hairline }]}>
      <RouteAtlas journeys={[journey]} paths={paths} height={ROUTE_MAP_HEIGHT} />
      <PathCaption path={path} />
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
