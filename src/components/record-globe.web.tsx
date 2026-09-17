import { StyleSheet, View } from 'react-native';

import { RouteAtlas } from '@/components/route-atlas';
import { getAirport } from '@/services/airports';
import type { RouteSource } from '@/services/geo';

/** Web: the SVG atlas the web World tab draws, fitted to the one route. */
export function RecordGlobe({ journey, height }: { journey: RouteSource; height: number }) {
  if (!getAirport(journey.fromCode) || !getAirport(journey.toCode)) return null;
  return (
    <View style={[styles.strip, { height }]}>
      <RouteAtlas journeys={[journey]} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: '100%',
    overflow: 'hidden',
  },
});
