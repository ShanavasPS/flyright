import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PLANE_CLIMBING } from '@/components/sheen-card';
import { useTheme } from '@/hooks/use-theme';

/** "LH873" → "LH": the two-character IATA airline designator (letters or a
 * letter/digit mix, e.g. W6, U2) that prefixes a flight number. Null for
 * manual journal entries that were logged without one. */
export function airlineCode(flightNumber: string): string | null {
  const match = flightNumber.trim().toUpperCase().match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d/);
  return match ? match[1] : null;
}

/** The airline's logo on a white chip (logos are drawn for light backgrounds,
 * so the chip stays white in dark mode too — the airline-app convention).
 * Journeys without a flight number — and logos that can't load (e.g. first
 * render while offline; expo-image's disk cache serves repeat renders without
 * a network) — get the same chip with the brand plane climbing in the app
 * tint, so it matches the aesthetic while clearly not being an airline mark.
 * The logo renders at 80% of the chip so full-bleed square marks (e.g.
 * Emirates' red tile) read as the logo rather than a stamp in the chip. */
export function AirlineLogo({
  number,
  carrier,
  size = 40,
}: {
  number: string;
  carrier: string;
  size?: number;
}) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const code = airlineCode(number);
  const chip = { width: size, height: size, borderRadius: size * 0.35 };

  if (!code || failed) {
    return (
      <View style={[styles.chip, chip, { borderColor: `${theme.tint}55` }]}>
        <SymbolView
          name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
          size={size / 2}
          weight="semibold"
          tintColor={theme.tint}
          style={PLANE_CLIMBING}
        />
      </View>
    );
  }
  return (
    <View style={[styles.chip, chip]}>
      <Image
        source={{ uri: `https://images.kiwi.com/airlines/64x64/${code}.png` }}
        style={{ width: size * 0.8, height: size * 0.8, borderRadius: size * 0.2 }}
        contentFit="contain"
        cachePolicy="disk"
        onError={() => setFailed(true)}
        accessibilityLabel={carrier}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(19,41,75,0.10)',
  },
});
