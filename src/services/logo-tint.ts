import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';

/** The colours a small picture is mostly made of — an airline's mark, a
 * country's flag — so a card can wear what it shows rather than the app's
 * colour. Skia decodes the PNG and hands back its pixels; the most-populated
 * saturated hues win, with white, near-white and transparent pixels (a chip's
 * background, anti-aliasing) left out of the vote. Darkened as needed so
 * white type stays readable. */

export interface LogoTint {
  /** The card's main colour: the picture's, dark enough for white type. */
  base: string;
  /** The gradient's far end: the picture's second colour when it has one
   * (a flag's red after its blue), else a lighter turn of the first. */
  light: string;
}

const LOGO_URL = (code: string) => `https://images.kiwi.com/airlines/64x64/${code}.png`;
const FLAG_URL = (country: string) => `https://flagcdn.com/w160/${country.toLowerCase()}.png`;
const cache = new Map<string, Promise<LogoTint | null>>();

/** Resolves once per picture per app run; null when it can't be fetched or
 * is all white and grey (a wordmark in black), so the caller keeps its own
 * colour. */
export function imageTint(url: string): Promise<LogoTint | null> {
  let pending = cache.get(url);
  if (!pending) {
    pending = readTint(url).catch(() => null);
    cache.set(url, pending);
  }
  return pending;
}

/** The airline's colour, from the same 64×64 logo the AirlineLogo chip shows. */
export function logoTint(code: string): Promise<LogoTint | null> {
  return imageTint(LOGO_URL(code));
}

/** The country's colours, from its flag. */
export function flagTint(country: string): Promise<LogoTint | null> {
  return imageTint(FLAG_URL(country));
}

async function readTint(url: string): Promise<LogoTint | null> {
  const data = await Skia.Data.fromURI(url);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) return null;
  const width = image.width();
  const height = image.height();
  const pixels = image.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels) return null;
  return dominantColour(pixels as Uint8Array);
}

/** Vote by hue bucket, weighted by saturation, then average the winners.
 * The runner-up becomes the gradient's far end when it carries at least a
 * quarter of the winner's weight and sits in another hue — a flag's second
 * colour, not a shade of the first. */
export function dominantColour(rgba: ArrayLike<number>): LogoTint | null {
  const buckets = new Map<number, { weight: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    // The chip's white and the mark's greys carry no colour to wear.
    if (min > 225 || sat < 0.25 || max < 40) continue;
    const hue = hueOf(r, g, b, max, min);
    const key = Math.round(hue / 15) % 24;
    const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 };
    bucket.weight += sat;
    bucket.r += r * sat;
    bucket.g += g * sat;
    bucket.b += b * sat;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.entries()].sort((a, b) => b[1].weight - a[1].weight);
  const best = ranked[0]?.[1];
  if (!best || best.weight < 4) return null;
  const r = best.r / best.weight;
  const g = best.g / best.weight;
  const b = best.b / best.weight;
  const second = ranked.find(
    ([key, bucket]) =>
      bucket.weight >= best.weight * 0.25 && Math.min(Math.abs(key - ranked[0][0]), 24 - Math.abs(key - ranked[0][0])) >= 3,
  )?.[1];
  const light = second
    ? forWhiteType(second.r / second.weight, second.g / second.weight, second.b / second.weight)
    : lighten(r, g, b);
  return { base: hex(...forWhiteType(r, g, b)), light: hex(...light) };
}

function hueOf(r: number, g: number, b: number, max: number, min: number): number {
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Dark enough that white type reads on it: mix towards navy until the
 * relative luminance drops under the threshold. */
function forWhiteType(r: number, g: number, b: number): [number, number, number] {
  let [x, y, z] = [r, g, b];
  for (let i = 0; i < 8 && luminance(x, y, z) > 0.2; i++) {
    x = x * 0.82 + 12 * 0.18;
    y = y * 0.82 + 27 * 0.18;
    z = z * 0.82 + 54 * 0.18;
  }
  return [x, y, z];
}

function lighten(r: number, g: number, b: number): [number, number, number] {
  const [x, y, z] = forWhiteType(r, g, b);
  return [x + (255 - x) * 0.28, y + (255 - y) * 0.28, z + (255 - z) * 0.28];
}

function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
}

function useImageTint(url: string | null): LogoTint | null {
  const [tint, setTint] = useState<LogoTint | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    void imageTint(url).then((found) => {
      if (live) setTint(found);
    });
    return () => {
      live = false;
    };
  }, [url]);
  return url ? tint : null;
}

/** The airline's colour for a card, null until read (and when unreadable). */
export function useLogoTint(code: string | null | undefined): LogoTint | null {
  return useImageTint(code ? LOGO_URL(code) : null);
}

/** The country's flag colours for a card, null until read. */
export function useFlagTint(country: string | null | undefined): LogoTint | null {
  return useImageTint(country && /^[A-Za-z]{2}$/.test(country) ? FLAG_URL(country) : null);
}
