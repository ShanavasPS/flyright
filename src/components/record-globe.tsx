import { useMemo, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { GlobeView, globePalette } from '@/components/globe-view';
import { useTheme } from '@/hooks/use-theme';
import { buildWorldRoutes, type RouteSource } from '@/services/geo';
import { useGlobeTextures } from '@/services/globe-textures';

/** The strip of globe across the top of a record card: the one route drawn
 * on the Earth, fitted to the strip, still. The same Skia globe as the World
 * tab and the trip page's inset — a record flight shown on the globe it
 * crossed rather than described in a line. Renders the sea colour until the
 * width is measured; nothing when the codes aren't in the airport table. */
export function RecordGlobe({ journey, height }: { journey: RouteSource; height: number }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const textures = useGlobeTextures();
  const palette = globePalette(dark);
  const [now] = useState(() => new Date());
  const data = useMemo(() => buildWorldRoutes([journey], now), [journey, now]);
  const [width, setWidth] = useState(0);
  const route = data.routes[0];
  if (!route) return null;
  return (
    <View
      style={[styles.strip, { height, backgroundColor: palette.sea }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <GlobeView
          key={route.key}
          routes={data.routes}
          airports={data.airports}
          width={width}
          height={height}
          textures={textures}
          colors={{ ...palette, tint: theme.tint, background: palette.sea }}
          interactive={false}
          labels="always"
          animate={false}
          fitPad={1}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: '100%',
    overflow: 'hidden',
  },
});
