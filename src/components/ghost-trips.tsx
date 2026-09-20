import { SymbolView } from 'expo-symbols';
import { Platform, StyleSheet, View } from 'react-native';

import { COBALT, WHITE_FAINT } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';

/** The real row's height (40pt logo + card padding) and how far each card
 * behind it peeks out. */
const GHOST_CARD_HEIGHT = 40 + 2 * Spacing.three;
const GHOST_PEEK = 10;

/** A deck of trip rows drawn as shapes, for the navy passes that have no
 * trips to put on themselves yet — the journal's empty hero and Home's.
 * It says what will be here without pretending to be a real flight, which
 * a made-up route would. Hidden from screen readers: it carries no
 * information the copy beside it does not. */
export function GhostTrips() {
  return (
    <View
      style={styles.deck}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[styles.card, styles.back2]} />
      <View style={[styles.card, styles.back1]} />
      <View style={[styles.card, styles.front]}>
        <View style={styles.logo}>
          <SymbolView
            name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
            size={16}
            tintColor={COBALT}
            style={Platform.OS === 'ios' ? undefined : styles.rotated}
          />
        </View>
        <View style={styles.body}>
          <View style={styles.spacedRow}>
            <View style={[styles.bar, styles.barMeta]} />
            <View style={styles.chip} />
          </View>
          <View style={[styles.bar, styles.barRoute]} />
        </View>
      </View>
    </View>
  );
}

/** What Home has when it is full, drawn as shapes: the faces of whoever you
 * follow who is flying, over the live card of your own travel day. It is
 * deliberately NOT the journal's deck of rows — that belongs to Flights, and
 * the two tabs sit next to each other, so their empty screens must not look
 * like the same screen twice. Hidden from screen readers. */
export function GhostTravelDay() {
  return (
    <View
      style={styles.day}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={styles.faces}>
        <View style={styles.face} />
        <View style={[styles.face, styles.faceDim]} />
        <View style={[styles.face, styles.faceDimmer]} />
      </View>
      <View style={styles.live}>
        <View style={styles.spacedRow}>
          <View style={styles.logo} />
          <View style={styles.chip} />
        </View>
        <View style={[styles.bar, styles.clock]} />
        <View style={styles.route}>
          <View style={styles.dot} />
          <View style={styles.rail} />
          <SymbolView
            name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
            size={14}
            tintColor={COBALT}
            style={Platform.OS === 'ios' ? undefined : styles.rotated}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  day: { gap: Spacing.two },
  faces: { flexDirection: 'row', gap: Spacing.two },
  face: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: 'rgba(127,177,242,0.55)',
    backgroundColor: 'rgba(242,246,251,0.10)',
  },
  faceDim: { opacity: 0.6 },
  faceDimmer: { opacity: 0.35 },
  live: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(242,246,251,0.18)',
    backgroundColor: '#22395F',
  },
  clock: { width: '52%', height: 18, borderRadius: 6, backgroundColor: 'rgba(242,246,251,0.30)' },
  route: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rail: { flex: 1, height: 2, borderRadius: 1, backgroundColor: 'rgba(242,246,251,0.22)' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(127,177,242,0.8)' },
  deck: { height: GHOST_CARD_HEIGHT + 2 * GHOST_PEEK, marginTop: Spacing.one },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: GHOST_CARD_HEIGHT,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(242,246,251,0.12)',
    backgroundColor: 'rgba(242,246,251,0.06)',
  },
  back2: { top: 0, left: Spacing.four + Spacing.two, right: Spacing.four + Spacing.two, opacity: 0.4 },
  back1: { top: GHOST_PEEK, left: Spacing.three, right: Spacing.three, opacity: 0.7 },
  front: {
    top: 2 * GHOST_PEEK,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    // Opaque (the sky lifted ~10% toward white) so the cards behind read as
    // peeking out, not as showing through.
    backgroundColor: '#22395F',
    borderColor: 'rgba(242,246,251,0.18)',
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(242,246,251,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: Spacing.one + Spacing.half },
  bar: { height: 8, borderRadius: 4, backgroundColor: WHITE_FAINT },
  barMeta: { width: '44%' },
  chip: { width: 40, height: 8, borderRadius: 4, backgroundColor: 'rgba(127,177,242,0.45)' },
  barRoute: { width: '78%', height: 10, borderRadius: 5, backgroundColor: 'rgba(242,246,251,0.28)' },
  rotated: { transform: [{ rotate: '90deg' }] },
  spacedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
