import { StyleSheet, View } from 'react-native';

import { RouteAtlas } from '@/components/route-atlas';
import type { RouteSource } from '@/services/geo';

/** The web has no Skia canvas without CanvasKit, so the intro's globe is
 * the offline SVG atlas here — the same renderer as the web World tab. */
export function OnboardingWorld({ rows, height }: { rows: RouteSource[]; height: number }) {
  if (!rows.length) return null;
  return (
    <View style={[styles.fill, { height }]}>
      <RouteAtlas journeys={rows} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
});
