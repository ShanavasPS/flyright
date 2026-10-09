/** The digits of a split-flap countdown, and the geometry of its tiles.
 *
 * One clock face for the Flights live card, the Lock Screen Live Activity
 * and the Home Screen widget: dark board, a tile per digit, HOURS / MIN /
 * SEC under the pairs. The app draws its own digits (and flips them); the
 * two WidgetKit surfaces lay the system's ticking timer over tiles drawn to
 * the same measure, so the numbers here are also the numbers in
 * targets/FlyRightWidget/FlyRightLiveActivity.swift and
 * src/widgets/next-flight.tsx — change them together. */

/** The face's palette, from the design (a physical board: the same in both
 * appearances, on the light card and the navy one). */
export const FLAP_BOARD = '#0A0E17';
export const FLAP_TILE = '#121826';
export const FLAP_TILE_TOP = '#161D2D';
export const FLAP_SPLIT = '#05080F';
export const FLAP_DIGIT = '#F5F1E6';
export const FLAP_COLON = '#4E5D7A';
export const FLAP_LABEL = '#A7B4CA';

/** SF Rounded heavy, monospaced digits: a digit's advance and the colon's,
 * as a share of the point size (measured from the system font). */
export const DIGIT_ADVANCE = 0.669;
export const COLON_ADVANCE = 0.29;

export interface FlapMetrics {
  /** Tile height. */
  height: number;
  /** The digit's point size. */
  fontSize: number;
  /** Tile width: the digit's advance plus the pad on both sides. */
  tileWidth: number;
  /** The pad between a digit's advance box and its tile's edge. */
  pad: number;
  /** Between tiles, and between a tile and the colon's cell. */
  gap: number;
  /** The colon's cell: its glyph with the same pad as a digit. */
  colonWidth: number;
  /** Tile corner radius. */
  radius: number;
  /** The board's padding around the tiles (sides) and its radius. */
  boardPad: number;
  boardRadius: number;
}

/** Every measure from the tile height, so each surface picks a height and
 * gets the same proportions as the design (tiles 32×50 around a 34pt digit,
 * 4 apart, on a board padded 12 with a 14 radius). */
export function flapMetrics(height: number): FlapMetrics {
  const fontSize = Math.round(height * 0.68);
  const pad = Math.round(height * 0.08 * 10) / 10;
  const digit = fontSize * DIGIT_ADVANCE;
  return {
    height,
    fontSize,
    pad,
    tileWidth: Math.round((digit + 2 * pad) * 10) / 10,
    gap: Math.max(2, Math.round(height * 0.08 * 10) / 10),
    colonWidth: Math.round((fontSize * COLON_ADVANCE + 2 * pad) * 10) / 10,
    radius: Math.max(3, Math.round(height * 0.12)),
    boardPad: Math.round(height * 0.2),
    boardRadius: Math.round(height * 0.28),
  };
}

export type FlapCell = { kind: 'digit'; value: string; group: 'hours' | 'minutes' | 'seconds' } | { kind: 'colon' };

/** The cells of the face for `leftMs` to go: hours (two digits by default,
 * never fewer than `hourDigits`, more when the wait is that long), minutes
 * and, when asked, seconds, with a colon between the groups. Negative or
 * NaN reads as zero — the caller swaps the face for words at that point. */
export function countdownCells(leftMs: number, options: { seconds?: boolean; hourDigits?: 1 | 2 } = {}): FlapCell[] {
  const seconds = options.seconds ?? true;
  const total = Math.max(0, Math.floor((Number.isFinite(leftMs) ? leftMs : 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hours = String(h).padStart(options.hourDigits ?? 2, '0');
  const cells: FlapCell[] = [];
  for (const d of hours) cells.push({ kind: 'digit', value: d, group: 'hours' });
  cells.push({ kind: 'colon' });
  for (const d of String(m).padStart(2, '0')) cells.push({ kind: 'digit', value: d, group: 'minutes' });
  if (seconds) {
    cells.push({ kind: 'colon' });
    for (const d of String(s).padStart(2, '0')) cells.push({ kind: 'digit', value: d, group: 'seconds' });
  }
  return cells;
}

/** The face's width for these cells: tiles, colon cells and the gaps
 * between every pair of neighbours. */
export function faceWidth(cells: FlapCell[], m: FlapMetrics): number {
  const inner = cells.reduce((w, c) => w + (c.kind === 'digit' ? m.tileWidth : m.colonWidth), 0);
  return inner + (cells.length - 1) * m.gap;
}

/** What a screen reader says for the face. */
export function countdownSpoken(leftMs: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(leftMs) ? leftMs : 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m || h) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  parts.push(`${s} ${s === 1 ? 'second' : 'seconds'}`);
  return parts.join(' ');
}
