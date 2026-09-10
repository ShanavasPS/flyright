import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The joint between two legs of one itinerary in a list of trip rows: a
 * short dotted stem and "2h 55m in Doha", indented to the rows' text column.
 * Rows stay separate cards — each leg is its own flight to open — but the
 * stem says the two are one journey and how long the traveller waits between
 * them, which two identical-looking cards never did. */
export function LayoverMark({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.mark} accessibilityLabel={`Connection: ${label}`}>
      <View style={styles.stem}>
        {Array.from({ length: 3 }, (_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: theme.tint }]} />
        ))}
      </View>
      <SymbolView
        name={{
          ios: 'arrow.triangle.swap',
          android: 'connecting_airports',
          web: 'connecting_airports',
        }}
        size={13}
        tintColor={theme.tint}
      />
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

/** One leg's slot in a list where legs of the same itinerary sit together:
 * a hairline rail in the gutter beside the cards runs from the first leg to
 * the last, through the layover marks, so the eye reads the run of cards as
 * one journey before it reads any of them. It starts and ends a little way
 * inside the end cards (a bracket, not a border) and bridges the list gap
 * between joined legs. Legs that connect to nothing render bare. */
export function ItineraryLeg({
  joinsPrev,
  joinsNext,
  children,
}: {
  joinsPrev: boolean;
  joinsNext: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  if (!joinsPrev && !joinsNext) return <>{children}</>;
  return (
    <View>
      {children}
      <View
        pointerEvents="none"
        style={[
          styles.rail,
          {
            backgroundColor: theme.tint,
            top: joinsPrev ? 0 : RAIL_INSET,
            // Only the upper leg bridges the seam: two translucent rails
            // overlapping there would read as a darker knot.
            bottom: joinsNext ? -LIST_GAP : RAIL_INSET,
          },
        ]}
      />
    </View>
  );
}

/** The trip list's gap between cells (journeys/index `list.gap`) — the rail
 * of the upper leg overshoots by this much so it is continuous across it. */
const LIST_GAP = Spacing.two;
/** How far inside the first and last card the rail starts and ends. */
const RAIL_INSET = Spacing.four;

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    // Just inside the 24pt page gutter, clear of the card's shadow.
    left: -(Spacing.two + 2),
    width: 2,
    borderRadius: 1,
    opacity: 0.45,
  },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    // The logo column is 48pt wide plus the card's 16pt padding and gap:
    // the mark lines up with the rows' text, not their edge.
    paddingLeft: Spacing.three + 48 + Spacing.three,
    paddingVertical: Spacing.one,
  },
  stem: {
    width: 3,
    gap: 3,
    alignItems: 'center',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.6,
  },
});
