import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GlobeView, globePalette } from '@/components/globe-view';
import { ON_STAGE } from '@/components/onboarding-art';
import { buildWorldRoutes, type RouteSource } from '@/services/geo';
import { useGlobeTextures } from '@/services/globe-textures';

/**
 * The intro's globe: the World tab's Skia earth over a sample year, lit by
 * the real sun with the sun itself in the sky — the globe rests at the sky
 * view (GlobeView's `rest`), so the sun is up past the limb from the first
 * frame. Still, like the trip inset; the sky is transparent so the globe
 * sits on the intro's navy. The web twin (onboarding-world.web.tsx) draws
 * the SVG atlas instead.
 */
export function OnboardingWorld({ rows, height }: { rows: RouteSource[]; height: number }) {
  const textures = useGlobeTextures();
  // Frozen per mount: the flown/upcoming cutoff has no need to tick.
  const [now] = useState(() => new Date());
  const data = useMemo(() => buildWorldRoutes(rows, now), [rows, now]);
  const [width, setWidth] = useState(0);
  const colors = useMemo(() => ({ ...globePalette(true), tint: ON_STAGE.tint, background: 'transparent' }), []);

  if (!data.routes.length) return null;
  return (
    <View style={[styles.fill, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <GlobeView
          routes={data.routes}
          airports={data.airports}
          width={width}
          height={height}
          textures={textures}
          colors={colors}
          interactive={false}
          animate={false}
          fitPad={0.2}
          daylight
          sun
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
  },
});
