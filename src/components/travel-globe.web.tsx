import { StyleSheet, View } from 'react-native';

import { RouteAtlas } from '@/components/route-atlas';
import { mapColors } from '@/components/world-map';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { RouteSource } from '@/services/geo';

import type { TravelGlobeLive } from './travel-globe';

export type { TravelGlobeLive };

/** The web has no Skia canvas without CanvasKit, so a person's travel is
 * the offline SVG atlas here — the same renderer as the web World tab. */
export function TravelGlobe({
  journeys,
  height,
}: {
  journeys: RouteSource[];
  height: number;
  live?: TravelGlobeLive | null;
}) {
  const { sea } = mapColors(useColorScheme() === 'dark');
  if (!journeys.length) return null;
  return (
    <View style={[styles.fill, { height, backgroundColor: sea }]}>
      <RouteAtlas journeys={journeys} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
  },
});
