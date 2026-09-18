import { toVector } from '@/services/globe';

/**
 * Where the sun is overhead at an instant — the subsolar point — so the
 * globe can light the day side and darken the night side for that moment.
 *
 * The low-precision solar position from the Astronomical Almanac (the same
 * series NOAA's calculator uses): mean longitude and anomaly as linear
 * functions of days since J2000.0, the equation of centre to two terms, the
 * obliquity, then declination and right ascension. Greenwich sidereal time
 * turns right ascension into a longitude. Good to a few hundredths of a
 * degree for the next century, which on a phone-sized globe is well under
 * a pixel.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
/** J2000.0 — 2000-01-01T12:00Z — in days since the Unix epoch. */
const J2000_DAYS = 10957.5;

export interface SubsolarPoint {
  latitude: number;
  longitude: number;
}

/** The point on the earth directly under the sun at `at` (ms since epoch). */
export function subsolarPoint(at: number): SubsolarPoint {
  const n = at / DAY_MS - J2000_DAYS;
  const meanLongitude = wrap360(280.46 + 0.9856474 * n);
  const meanAnomaly = (357.528 + 0.9856003 * n) * RAD;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension =
    Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude)) / RAD;
  const siderealTime = wrap360(280.46061837 + 360.98564736629 * n);
  return {
    latitude: declination / RAD,
    longitude: wrap180(rightAscension - siderealTime),
  };
}

/** The sun's direction as a unit vector in the globe's frame (see
 * services/globe) — what the shader dots with each pixel's surface normal. */
export function sunVector(at: number): [number, number, number] {
  const { latitude, longitude } = subsolarPoint(at);
  return toVector(latitude, longitude);
}

function wrap360(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function wrap180(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}
