import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { WorldMap, mapColors } from '@/components/world-map';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { buildWorldMap, fitViewBox, type RouteSource } from '@/services/geo';

/** The offline SVG atlas fitted to one route — the web World tab's renderer,
 * and the native inset's fallback for routes too wide for a map SDK's
 * zoom-out floor (a polar long haul spans 170° of longitude; MapKit shows
 * ~89° at most). Fills its parent. */
export function RouteAtlas({
  journeys,
  height,
}: {
  /** One leg, or somebody's whole travel — the atlas fits whatever it is
   * given, which is why it and not the map SDK draws a person's world: a
   * lifetime of routes spans more longitude than the SDK will zoom out to. */
  journeys: RouteSource[];
  height: number;
}) {
  const { sea } = mapColors(useColorScheme() === 'dark');
  const [now] = useState(() => new Date());
  const data = useMemo(() => buildWorldMap(journeys, now), [journeys, now]);
  const [width, setWidth] = useState(0);
  // Extra padding: the arc's polar apex must clear the top edge with room to
  // spare, and the endpoint labels need space to the right of their dots.
  const box = useMemo(
    () => fitViewBox(data.fitPoints, width ? width / height : 0, 0.35),
    [data, width, height],
  );
  return (
    <View style={[styles.fill, { backgroundColor: sea }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <WorldMap box={box} pxWidth={width} routes={data.routes} airports={data.airports} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
