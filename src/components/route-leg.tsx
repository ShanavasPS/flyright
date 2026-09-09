import { SymbolView } from 'expo-symbols';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { formatTime } from '@/services/dates';
import { blockMinutes, cityOf } from '@/services/timeline';

/** The least a leg needs to be drawn: the two codes and the two clocks. */
export interface Leg {
  fromCode: string;
  toCode: string;
  departure: string;
  arrival: string;
  /** The clock the ticket was booked at, struck through in place once the
   * airline has moved the flight. Nobody but the traveller sees this. */
  ticketedDeparture?: string | null;
  distanceKm?: number | null;
}

/** One leg the way the trip screen's hero draws it — the two codes at the
 * edges with the contrail and plane between, a clock beneath each — at list
 * size (22pt codes, city under each, block time under the plane) or compact
 * (15pt codes and the clocks, nothing else) for a row that also has to fit a
 * name and a status line.
 *
 * Every surface that shows a flight to somebody draws it with this: the
 * journal's rows, the trips a follower is shown, the live cards. A follower's
 * rows used to spell the leg as "HEL → LHR" with no clock at all, which told
 * them where without when — the one thing a follower is waiting to know. */
export function RouteLeg({ leg, compact = false }: { leg: Leg; compact?: boolean }) {
  const theme = useTheme();
  const { dep, arr } = clocks(leg);
  const was =
    !compact && leg.ticketedDeparture
      ? formatTime(leg.ticketedDeparture, airportZone(leg.fromCode))
      : null;
  // Block time reads as a fact about the segment (the hero's pattern); the
  // distance stands in when the times can't be differenced — or were never
  // typed, which is when the codes alone are the whole line.
  const middle = compact ? null : (durationLabel(leg) ?? distanceLabel(leg) ?? ' ');
  const spoken = [leg.fromCode, dep, 'to', leg.toCode, arr].filter(Boolean).join(' ');
  const codeStyle = compact ? styles.codeCompact : styles.code;
  const clockStyle = compact ? styles.clockCompact : styles.clock;

  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={[styles.routeRow, compact && styles.routeRowCompact]}>
      <View style={styles.endpoint}>
        <ThemedText themeColor="heading" style={codeStyle} numberOfLines={1}>
          {leg.fromCode}
        </ThemedText>
        {!compact && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.city} numberOfLines={1}>
            {cityOf(leg.fromCode)}
          </ThemedText>
        )}
        {(dep || arr) && (
          <ThemedText themeColor="heading" style={clockStyle} numberOfLines={1}>
            {dep ?? ' '}
          </ThemedText>
        )}
        {/* What the ticket said, struck through beneath the clock that now
            counts — its own line, so a wide "5:05 PM 6:00 PM" pair never
            squeezes the contrail or truncates the live time. */}
        {was && (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={[styles.city, styles.movedFrom]}
            numberOfLines={1}
            accessibilityLabel={`Moved from ${was}`}>
            {was}
          </ThemedText>
        )}
      </View>
      <View style={[styles.contrail, compact && styles.contrailCompact]}>
        <View style={styles.contrailLine}>
          <ContrailDots />
          <SymbolView
            name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
            size={compact ? 12 : 14}
            tintColor={theme.tint}
            style={Platform.OS === 'ios' ? undefined : styles.rotated}
          />
          <ContrailDots />
        </View>
        {middle !== null && (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.contrailLabel}
            numberOfLines={1}>
            {middle}
          </ThemedText>
        )}
      </View>
      <View style={[styles.endpoint, styles.endpointRight]}>
        <ThemedText themeColor="heading" style={codeStyle} numberOfLines={1}>
          {leg.toCode}
        </ThemedText>
        {!compact && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.city} numberOfLines={1}>
            {cityOf(leg.toCode)}
          </ThemedText>
        )}
        {/* A blank keeps the two columns level when only one clock exists. */}
        {(dep || arr) && (
          <ThemedText themeColor="heading" style={clockStyle} numberOfLines={1}>
            {arr ?? ' '}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

/** Half of the dotted contrail between the codes — the hero's motif, three
 * dots a side at card size. */
function ContrailDots() {
  const theme = useTheme();
  return (
    <View style={styles.contrailDots}>
      {Array.from({ length: 3 }, (_, i) => (
        <View key={i} style={[styles.contrailDot, { backgroundColor: theme.textSecondary }]} />
      ))}
    </View>
  );
}

/** The clocks under each code, each in its own airport's zone so the leg
 * reads the way a boarding pass does no matter where the phone is.
 * Journal entries only carry times the user typed: identical noon timestamps
 * are the "no times" placeholder, identical non-noon ones mean a single
 * entered time — never render a fabricated departure → arrival pair. Judged
 * on the times themselves rather than on the leg's source, which a trip
 * shared with a follower doesn't carry: two identical clocks are the same
 * non-fact whoever wrote them down. */
export function clocks(leg: Leg): { dep: string | null; arr: string | null } {
  const { departure: dep, arrival: arr } = leg;
  if (dep === arr) {
    if (dep.endsWith('T12:00:00')) return { dep: null, arr: null };
    return { dep: formatTime(dep, airportZone(leg.fromCode)), arr: null };
  }
  return {
    dep: formatTime(dep, airportZone(leg.fromCode)),
    arr: formatTime(arr, airportZone(leg.toCode)),
  };
}

/** "4h 5m" — null for entries whose times can't be differenced even with
 * the airports' zones to pin them (see blockMinutes). */
function durationLabel(leg: Leg): string | null {
  const minutes = blockMinutes(
    leg.departure,
    leg.arrival,
    airportZone(leg.fromCode),
    airportZone(leg.toCode),
  );
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function distanceLabel(leg: Leg): string | null {
  return leg.distanceKm ? `${Math.round(leg.distanceKm).toLocaleString()} km` : null;
}

const styles = StyleSheet.create({
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  // Hugs its codes instead of pushing them to the card's edges — a compact
  // leg sits under a name, not across a whole row.
  routeRowCompact: {
    alignSelf: 'flex-start',
    marginTop: 0,
  },
  endpoint: {
    flexShrink: 1,
  },
  endpointRight: {
    alignItems: 'flex-end',
  },
  code: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: 700,
    letterSpacing: -0.3,
  },
  codeCompact: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: 700,
    letterSpacing: -0.2,
  },
  city: {
    fontSize: 12,
    lineHeight: 16,
  },
  clock: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 600,
  },
  clockCompact: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
  movedFrom: { textDecorationLine: 'line-through' },
  // The line is 14pt tall; the 6pt offset centres the plane on the 26pt code
  // line, and the label beneath then sits level with the cities.
  contrail: {
    flex: 1,
    minWidth: 56,
    alignItems: 'center',
    marginTop: 6,
    gap: Spacing.half,
  },
  // Compact codes are 18pt tall, so a 2pt offset centres the 14pt line; the
  // contrail stays short so the leg fits between a name and a status line.
  contrailCompact: {
    flex: 0,
    width: 72,
    minWidth: 72,
    marginTop: 2,
  },
  contrailLine: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 14,
  },
  contrailDots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  contrailDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.55,
  },
  contrailLabel: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
  },
});
