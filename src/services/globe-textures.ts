import { AlphaType, ColorType, Skia, useImage, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';

/**
 * The globe's textures (see scripts/generate-globe-texture.mjs): every one
 * an RGBA PNG whose alpha is the mask.
 *
 * The base land mask (2048×1024) is decoded by Skia as-is and is always
 * there. The detail set — eight 2048×2048 land tiles at four times the
 * resolution, and two tiles of country borders — is decoded and then read
 * back as 8-bit alpha images, a quarter of the memory (32 MB for the land,
 * 8 MB for the borders, instead of 160 MB), one tile at a time with a
 * breather between so the JS thread stays responsive. It loads once per
 * app session and is shared by every globe. Where the read-back is not
 * supported the globe simply keeps the base mask.
 */

export const BASE_TEXTURE = require('../../assets/images/globe-land.png');
export const TILE = 2048;
export const BASE_SIZE = { width: 2048, height: 1024 };
/** Detail tiles: four across, two down. */
export const DETAIL_ACROSS = 4;
export const DETAIL_DOWN = 2;
/** Border tiles: two across, one down. */
export const BORDER_ACROSS = 2;

const DETAIL_TILES = [
  require('../../assets/images/globe-detail-0.png'),
  require('../../assets/images/globe-detail-1.png'),
  require('../../assets/images/globe-detail-2.png'),
  require('../../assets/images/globe-detail-3.png'),
  require('../../assets/images/globe-detail-4.png'),
  require('../../assets/images/globe-detail-5.png'),
  require('../../assets/images/globe-detail-6.png'),
  require('../../assets/images/globe-detail-7.png'),
];
const BORDER_TILES = [
  require('../../assets/images/globe-borders-0.png'),
  require('../../assets/images/globe-borders-1.png'),
];

export interface GlobeTextures {
  base: SkImage | null;
  /** Eight land tiles, or null until loaded / when unavailable. */
  detail: SkImage[] | null;
  /** Two border tiles, likewise. */
  borders: SkImage[] | null;
}

const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Decode a bundled PNG and keep only its alpha, as an 8-bit image. */
async function loadAlphaTile(module: number): Promise<SkImage | null> {
  const { uri } = Image.resolveAssetSource(module);
  const data = await Skia.Data.fromURI(uri);
  const decoded = Skia.Image.MakeImageFromEncoded(data);
  data.dispose();
  if (!decoded) return null;
  const info = {
    width: decoded.width(),
    height: decoded.height(),
    colorType: ColorType.Alpha_8,
    alphaType: AlphaType.Unpremul,
  };
  const pixels = decoded.readPixels(0, 0, info);
  decoded.dispose();
  if (!(pixels instanceof Uint8Array)) return null;
  const bytes = Skia.Data.fromBytes(pixels);
  const image = Skia.Image.MakeImage(info, bytes, info.width);
  bytes.dispose();
  return image;
}

let detailLoad: Promise<Pick<GlobeTextures, 'detail' | 'borders'>> | null = null;

function loadDetail(): Promise<Pick<GlobeTextures, 'detail' | 'borders'>> {
  if (!detailLoad) {
    detailLoad = (async () => {
      try {
        const detail: SkImage[] = [];
        for (const tile of DETAIL_TILES) {
          const image = await loadAlphaTile(tile);
          if (!image) return { detail: null, borders: null };
          detail.push(image);
          await breathe();
        }
        const borders: SkImage[] = [];
        for (const tile of BORDER_TILES) {
          const image = await loadAlphaTile(tile);
          if (!image) return { detail, borders: null };
          borders.push(image);
          await breathe();
        }
        return { detail, borders };
      } catch (error) {
        if (__DEV__) console.warn('[globe] detail textures unavailable', error);
        return { detail: null, borders: null };
      }
    })();
  }
  return detailLoad;
}

/** The globe's textures, the base at once and the detail set when it has
 * loaded. The detail decode is a second or so of work on the JS thread, so
 * it starts only once `wanted` is true — the World tab on screen, a trip
 * page open — and after the screen's own transitions have settled, never
 * during app start-up (the tab screens mount before the traveller ever
 * looks at World). Once loaded it stays loaded for every globe. */
export function useGlobeTextures(wanted = true): GlobeTextures {
  const base = useImage(BASE_TEXTURE);
  const [detail, setDetail] = useState<Pick<GlobeTextures, 'detail' | 'borders'>>({ detail: null, borders: null });
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    // Once the JS thread is idle — after the tab switch or push that
    // mounted the globe has settled. (InteractionManager did this before;
    // React Native deprecated it for requestIdleCallback and warned on every
    // globe mount.)
    const task = requestIdleCallback(() => {
      void loadDetail().then((loaded) => {
        if (live) setDetail(loaded);
      });
    });
    return () => {
      live = false;
      cancelIdleCallback(task);
    };
  }, [wanted]);
  return { base, detail: detail.detail, borders: detail.borders };
}
