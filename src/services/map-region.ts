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

/** Points across the whole world at the lowest zoom either SDK will grant in
 * a card this short. Measured, not guessed: an iPhone 17 asked for 260° of
 * longitude and got 124°, a Pixel 9a asked for 148° and got 127°, both in the
 * same 361-point-wide inset — 360 × 361 / 124 ≈ 1048, 360 × 361 / 127 ≈ 1023.
 * (The World tab's floor is lower, ~89°, because a full-screen map stops
 * zooming out once the world is about twice its height; a 220-point card
 * never reaches that and hits the absolute floor instead.) */
const WORLD_POINTS_AT_MIN_ZOOM = 1024;

/** The widest longitude a card `widthPt` points across can actually show.
 * Asking for more does not widen the view: the SDK grants this much and then
 * re-centres it wherever it likes, which is how DXB → LAX came out as an
 * empty stretch of the North Atlantic with both airports off screen. */
export const maxLonSpanFor = (widthPt: number) => (360 * widthPt) / WORLD_POINTS_AT_MIN_ZOOM;

/** Clearance an endpoint dot needs from the card's rounded corner, in points.
 * Small because `WORLD_POINTS_AT_MIN_ZOOM` is already the conservative end of
 * what was measured — LHR → LAS needs 115 of the 122° this predicts for an
 * iPhone 17, and lands with 13 points to spare on each side of the 124° the
 * SDK actually grants. */
const EDGE_CLEARANCE = 8;

/** Degrees of latitude either side of `centre` that come to `band` of
 * Mercator. Solved rather than derived: both SDKs read a region back as
 * latitude ± latitudeDelta/2 in plain degrees, and Mercator stretches the
 * northern half of that far more than the southern one, so no single factor
 * converts between the two. */
function latDeltaForBand(centre: number, band: number): number {
  const yOf = (lat: number) => toMercator(Math.min(MAX_LAT, Math.max(-MAX_LAT, lat)));
  let lo = 0;
  let hi = 2 * MAX_LAT;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (yOf(centre + mid / 2) - yOf(centre - mid / 2) <= band) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Frames one route in the journey inset, and says whether a real map can
 * hold it at all.
 *
 * A card this wide and this short is a thin band of the world: the SDK fills
 * it, so the longitude it shows fixes the latitude it shows, and neither can
 * be asked for past `maxLonSpanFor`. That makes two ways a route doesn't fit,
 * and both have to be caught here rather than discovered as a bad-looking
 * map — the SDK reports no failure, it just quietly frames something else.
 *
 * Too wide: LHR → LAS spans 115°, which fits; DXB → LAX spans 174°, which
 * cannot. Too tall: a great circle to the far side of the world climbs to the
 * pole — DXB → LAX peaks at 84.6°N — and Mercator sends the pole to infinity,
 * so that arc leaves the top of any band we can show. Those go to the offline
 * atlas, whose flat projection fits anything. */
export function frameInset(
  fit: Region,
  latitudes: number[],
  widthPt: number,
  heightPt: number,
): { region: Region; fits: boolean } {
  const ceiling = maxLonSpanFor(widthPt);
  const yOf = (lat: number) => toMercator(Math.min(MAX_LAT, Math.max(-MAX_LAT, lat)));
  // The card is one shape, so the two axes are the same measurement twice:
  // this much longitude across it is exactly this much Mercator down it.
  const lonForY = (y: number) => (360 * widthPt * y) / (2 * Math.PI * heightPt);
  const yForLon = (lon: number) => (2 * Math.PI * heightPt * lon) / (360 * widthPt);

  // A little more longitude than the bare fit so the endpoint dots clear the
  // rounded corners; never past the floor, which buys nothing.
  const wanted = Math.min(fit.longitudeDelta * 1.15, ceiling);

  // And room above and below so the dots don't sit on the top and bottom
  // edges. A latitude window the SDK can't grant is worse than none, though:
  // asked for one wider than its floor, Google keeps the floor and re-centres
  // on somewhere else entirely — HEL → JFK came back centred on the equator,
  // 38° south of the flight, with the route off the top of the card. So the
  // latitude ask is capped at what the longitude floor leaves room for, which
  // keeps longitude the axis that frames the card and the centre ours.
  const spanOf = (delta: number) =>
    yOf(fit.latitude + delta / 2) - yOf(fit.latitude - delta / 2);
  const roomy = spanOf(fit.latitudeDelta * 1.6);
  const latitudeDelta = latDeltaForBand(fit.latitude, Math.min(roomy, yForLon(ceiling) * 0.98));

  // Whichever axis the SDK has to zoom out further for is the one on screen:
  // a short hop north-south is framed by its latitude, a long haul by its
  // longitude.
  const shown = Math.min(Math.max(wanted, lonForY(spanOf(latitudeDelta))), ceiling);

  const marginLon = (EDGE_CLEARANCE * ceiling) / widthPt;
  const rawSpan = fit.longitudeDelta / LON_PAD;
  const lonFits = rawSpan + 2 * marginLon <= ceiling;

  // The band of the world the card will show, against the band the arc
  // actually occupies.
  const band = yForLon(shown);
  const ys = latitudes.map(yOf);
  const arcBand = Math.max(...ys) - Math.min(...ys);
  const latFits = arcBand + 2 * ((band * EDGE_CLEARANCE) / heightPt) <= band;

  return {
    region: { ...fit, latitudeDelta, longitudeDelta: wanted },
    fits: lonFits && latFits,
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

/** Whether the window the SDK actually settled on holds the whole route.
 *
 * `frameInset` predicts what will fit, but the last word belongs to the SDK,
 * and near the bottom of its zoom range Google stops taking direction: handed
 * a window centred on 52°N it framed 14°N instead, leaving HEL → JFK off the
 * top of the card — no error, no clamp we can read, just the wrong piece of
 * the world. So the settled region is checked against the route it was meant
 * to show, and a card that ends up framing something else hands over to the
 * atlas. The margin keeps an endpoint from counting as visible while it sits
 * under the card's own rounded corner. */
export function regionHolds(granted: Region, coords: LatLng[]): boolean {
  const latMargin = granted.latitudeDelta * 0.02;
  const lonMargin = granted.longitudeDelta * 0.02;
  const halfLat = granted.latitudeDelta / 2 - latMargin;
  const halfLon = granted.longitudeDelta / 2 - lonMargin;
  return coords.every((c) => {
    if (Math.abs(c.latitude - granted.latitude) > halfLat) return false;
    // Wraparound-aware: a route either side of the antimeridian is still one
    // route, and the shorter way round is the one on screen.
    const dLon = Math.abs(((c.longitude - granted.longitude + 540) % 360) - 180);
    return dLon <= halfLon;
  });
}
