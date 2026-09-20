import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import type { ViewStyleProp } from '@/types/styles';
import Svg, { Path } from 'react-native-svg';

import { renderBarcode } from '../../modules/flyright-document-import';

import { matrixToPath, type PassFormat, type SymbolMatrix } from '@/services/boarding-pass';

/**
 * A boarding-pass barcode, redrawn from its stored payload in the symbology
 * the airline printed. The native side turns the payload back into a module
 * matrix (Core Image on iOS, ZXing on Android); this draws it as one SVG
 * path scaled to the width it's given, crisp at any size — the gate scanner
 * reads it as it read the original.
 *
 * Symbols are cached per payload for the app's life: the same code is drawn
 * on the trip card, then full screen at the gate, and rendering twice would
 * only flash.
 */
const cache = new Map<string, Promise<SymbolMatrix>>();

function symbolFor(code: string, format: PassFormat): Promise<SymbolMatrix> {
  const key = `${format}:${code}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = renderBarcode(code, format).catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
  }
  return pending;
}

/** The matrix turned a quarter turn clockwise: a PDF417 stripe stood on end
 * fills a phone's height instead of its width, and reads from further away. */
export function rotateMatrix(matrix: SymbolMatrix): SymbolMatrix {
  const rows: string[] = [];
  for (let x = 0; x < matrix.width; x++) {
    let row = '';
    for (let y = matrix.height - 1; y >= 0; y--) row += matrix.rows[y][x] ?? '0';
    rows.push(row);
  }
  return { width: matrix.height, height: matrix.width, rows };
}

export function useBarcodeSymbol(code: string, format: PassFormat) {
  // Keyed by what was asked for, so a code change reads as "not yet drawn"
  // in the same render instead of showing the previous symbol for a frame.
  const key = `${format}:${code}`;
  const [state, setState] = useState<{ key: string; matrix: SymbolMatrix | null; failed: boolean }>({
    key,
    matrix: null,
    failed: false,
  });
  useEffect(() => {
    let live = true;
    symbolFor(code, format).then(
      (matrix) => live && setState({ key, matrix, failed: false }),
      () => live && setState({ key, matrix: null, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [code, format, key]);
  return state.key === key ? state : { key, matrix: null, failed: false };
}

export function Barcode({
  code,
  format,
  width,
  maxHeight,
  rotated = false,
  color = '#0B1424',
  style,
  testID,
  onFailed,
}: {
  code: string;
  format: PassFormat;
  /** The box the symbol fills edge to edge; its height follows the symbol's
   * own proportions, capped at `maxHeight` (the symbol then narrows). */
  width: number;
  maxHeight?: number;
  /** Stand the symbol on end (see rotateMatrix). */
  rotated?: boolean;
  color?: string;
  style?: ViewStyleProp;
  testID?: string;
  /** Told once when the symbol can't be drawn on this platform. */
  onFailed?: () => void;
}) {
  const { matrix: drawn, failed } = useBarcodeSymbol(code, format);
  useEffect(() => {
    if (failed) onFailed?.();
  }, [failed, onFailed]);

  const matrix = useMemo(() => (drawn ? (rotated ? rotateMatrix(drawn) : drawn) : null), [drawn, rotated]);
  const path = useMemo(() => (matrix ? matrixToPath(matrix) : ''), [matrix]);

  // Until the symbol arrives the box keeps the proportions it will have:
  // a stripe for PDF417, a square for the rest — no layout jump on arrival.
  const guessAspect = format === 'pdf417' ? (rotated ? 3 : 1 / 3) : 1;
  const aspect = matrix ? matrix.height / matrix.width : guessAspect;
  // Keep the quiet zone with the symbol at every size, including square
  // codes and rotated stripes. The native encoders return cropped ink.
  const margin = format === 'qr' ? 4 : 2;
  let boxWidth = width;
  let boxHeight = Math.round(width * aspect);
  if (maxHeight && boxHeight > maxHeight) {
    boxHeight = maxHeight;
    boxWidth = Math.round(maxHeight / aspect);
  }

  if (failed) return null;

  return (
    <View testID={testID} style={[{ width: boxWidth, height: boxHeight }, style]} pointerEvents="none" accessible accessibilityLabel="Boarding pass barcode">
      {matrix && (
        <Svg width={boxWidth} height={boxHeight} viewBox={`${-margin} ${-margin} ${matrix.width + margin * 2} ${matrix.height + margin * 2}`} preserveAspectRatio="xMidYMid meet" style={{ backgroundColor: '#FFFFFF' }}>
          <Path d={path} fill={color} />
        </Svg>
      )}
      {!matrix && <View style={[StyleSheet.absoluteFill, styles.placeholder]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    borderRadius: 4,
    backgroundColor: 'rgba(11,20,36,0.06)',
  },
});
