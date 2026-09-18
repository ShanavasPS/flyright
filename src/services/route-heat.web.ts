/** Web: the share screen has no image capture there (react-native-view-shot
 * renders nothing), and Skia is not set up for the web bundle, so the heat
 * layer is simply absent. Keeps react-native-webgpu and Skia out of the
 * hosting export. */

import type { PosterTheme, ShareMapModel } from '@/services/world-share';

export async function routeHeatSupported(): Promise<boolean> {
  return false;
}

export function routeHeatKey(model: ShareMapModel, theme: PosterTheme): string {
  return `${model.width}x${model.height}-${theme}`;
}

export async function renderRouteHeat(): Promise<string | null> {
  return null;
}
