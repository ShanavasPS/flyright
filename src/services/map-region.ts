import { Platform } from 'react-native';
import type { Region } from 'react-native-maps';

import type { LatLng } from '@/services/geo';

/** Latitude cap for fitting. Polar great-circle apexes reach ~85°, which in
 * Mercator is nearly the top of the world — fitting them forces a zoom that
 * shows almost no longitude. Capping here lets a polar arc leave the top of
 * the screen instead, which reads fine. */
export const MAX_LAT = 75;
/** Longitude padding factor so endpoints sit clear of the screen edges. */
const LON_PAD = 1.3;
const toMercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const fromMercator = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

/** The SDK's zoom-out floor in degrees of longitude. Seeded with the phone
 * values measured on an iPhone (MapKit) and a Pixel (Google) so the very
 * first fit already asks for a window the SDK can grant — asking for 359°
 * and learning from the clamp cost a visible detour (a world view centred on
 * the Atlantic, then a second flight to the routes). Refined either way from
 * every clamped settle (see `learnZoomFloor`), so a tablet that can show more
 * grows into it after its first clamp and kept for the session so every map
 * — the World tab and the journey detail's inset — opens right. */
let zoomFloorLon = Platform.OS === 'android' ? 72 : 89;
export const getZoomFloorLon = () => zoomFloorLon;

/** Record what the SDK granted for a request: a settle clearly narrower than
 * asked is the floor. Returns the floor when it changed, else null. */
export function learnZoomFloor(askedLonDelta: number, grantedLonDelta: number): number | null {
  if (grantedLonDelta >= askedLonDelta * 0.9) return null;
  if (Math.abs(grantedLonDelta - zoomFloorLon) < 0.5) return null;
  zoomFloorLon = grantedLonDelta;
  return zoomFloorLon;
}

/** Region containing every coordinate, wraparound-aware. The camera is set
 * from this instead of `fitToCoordinates` because antimeridian-split routes
 * defeat a naive bounding box (their ±180° endpoints make it span the whole
 * world and the SDKs then pick an arbitrary window). The longitude window is
 * the complement of the largest empty gap between route samples — the
 * standard fix for bounds on a circle.
 *
 * Both SDKs have a zoom-out floor (MapKit's camera-altitude ceiling shows
 * ~89° of longitude on an iPhone; Google's min zoom is similar), so a
 * far-flung set of routes can't all fit. Rather than let the SDK pick an
 * arbitrary window, anything wider than `maxLonSpan` gets the window holding
 * the most route samples — the user's densest region — and the recenter
 * button/panning covers the rest. Latitude is padded in Mercator space and
 * clamped inside MAX_LAT. */
export function regionFor(coords: LatLng[], airportLons: number[], maxLonSpan: number): Region {
  if (!coords.length) return { latitude: 30, longitude: 0, latitudeDelta: 100, longitudeDelta: 120 };
  const lons = coords.map((c) => c.longitude).sort((a, b) => a - b);
  let gapStart = lons[lons.length - 1];
  let gapSize = lons[0] + 360 - gapStart;
  for (let i = 1; i < lons.length; i += 1) {
    const gap = lons[i] - lons[i - 1];
    if (gap > gapSize) {
      gapSize = gap;
      gapStart = lons[i - 1];
    }
  }
  let lonSpan = 360 - gapSize;
  let lonStart = gapStart + gapSize;
  let lonDelta = Math.min(359, Math.max(6, lonSpan * LON_PAD));
  let visible = coords;

  if (lonDelta > maxLonSpan) {
    // At the floor the SDK shows exactly maxLonSpan, so use all of it: slide
    // a window that wide around the circle and keep the start holding the
    // most airports (arc samples would let one long haul outvote a cluster),
    // then centre the airports it caught within it.
    const width = maxLonSpan;
    const anchors = (airportLons.length ? [...airportLons] : lons).sort((a, b) => a - b);
    const doubled = [...anchors, ...anchors.map((l) => l + 360)];
    let best = 0;
    let bestStart = anchors[0];
    let bestEnd = anchors[0];
    let j = 0;
    for (let i = 0; i < anchors.length; i += 1) {
      while (j < doubled.length && doubled[j] <= anchors[i] + width) j += 1;
      if (j - i > best) {
        best = j - i;
        bestStart = anchors[i];
        bestEnd = doubled[j - 1];
      }
    }
    lonStart = bestStart - (width - (bestEnd - bestStart)) / 2;
    lonSpan = width;
    lonDelta = width;
    visible = coords.filter((c) => (((c.longitude - lonStart) % 360) + 360) % 360 <= width);
  }

  let yMin = toMercator(MAX_LAT);
  let yMax = toMercator(-MAX_LAT);
  for (const c of visible) {
    const y = toMercator(Math.min(MAX_LAT, Math.max(-MAX_LAT, c.latitude)));
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  const yPad = Math.max(0.05, (yMax - yMin) * 0.12);
  const yTop = Math.min(toMercator(MAX_LAT), yMax + yPad);
  const yBottom = Math.max(toMercator(-MAX_LAT), yMin - yPad);

  // Both SDKs turn a region back into bounds as latitude ± latitudeDelta/2 in
  // plain degrees, so the centre is the degree midpoint, not the Mercator one.
  const latTop = fromMercator(yTop);
  const latBottom = fromMercator(yBottom);
  const rawCenter = lonStart + lonSpan / 2;
  return {
    latitude: (latTop + latBottom) / 2,
    longitude: ((rawCenter % 360) + 540) % 360 - 180,
    latitudeDelta: Math.max(4, latTop - latBottom),
    longitudeDelta: lonDelta,
  };
}

/** Google's night-mode base palette, plus POI/transit clutter removal (the
 * clutter rules also apply in light mode — this is a travel map, not a city
 * guide). Apple Maps ignores this and follows `userInterfaceStyle` instead. */
export const CLUTTER_OFF = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
export const GOOGLE_NIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] },
  ...CLUTTER_OFF,
];
