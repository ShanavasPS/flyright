import { SymbolView } from 'expo-symbols';
import { Platform, StyleSheet, View } from 'react-native';

import { AirlineLogo } from '@/components/airline-logo';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { countdown, formatDayLabel, formatTime } from '@/services/dates';
import { blockMinutes, cityOf } from '@/services/timeline';

/** Past this age a trip reads as a journal entry rather than a countdown:
 * the date on the row and the year in the section header say enough. */
const YEAR_MS = 365 * 86_400_000;

/** The least a row needs to draw a trip. Narrower than the journal's DB row,
 * because a trip somebody else is flying reaches us as a handful of public
 * fields — and that was all that stood between a follower's profile and the
 * row the journal already had. */
export interface RowTrip {
  fromCode: string;
  toCode: string;
  carrier: string;
  number: string;
  scheduledDeparture: string;
  scheduledArrival: string;
  /** The clock the ticket was booked at, struck through in place once the
   * airline has moved the flight. Nobody but the traveller sees this. */
  ticketedDeparture?: string | null;
  distanceKm?: number | null;
  notes?: string | null;
}

/** One trip as a card: airline mark, the date and flight number with the
 * countdown opposite, then the leg the way the trip screen's hero draws it —
 * the two codes big at the edges with the contrail and plane between, city
 * and clock beneath each, block time under the plane — at list size.
 *
 * The card body only — pressing is the caller's, because the journal pushes
 * a route (or selects into its second pane) while a profile opens somebody
 * else's copy of the trip.
 *
 * One row for every list of trips. A follower's profile drew its own for a
 * while: the codes where the cities go, the flight number where the date
 * goes, and the same facts arranged differently for no reason a reader could
 * have named. */
export function TripRow({
  trip,
  now,
  badge,
  selected,
}: {
  trip: RowTrip;
  now: Date;
  /** The meta line's right slot when something outranks the countdown — the
   * journal puts the money moment there. */
  badge?: React.ReactNode;
  /** Two-pane mode: this is the row the detail pane is showing. */
  selected?: boolean;
}) {
  const theme = useTheme();
  const old = now.getTime() - Date.parse(trip.scheduledDeparture) > YEAR_MS;
  const upcoming = Date.parse(trip.scheduledDeparture) >= now.getTime();

  return (
    <SheenCard style={[styles.card, selected && { borderWidth: 1, borderColor: theme.tint }]}>
      <AirlineLogo number={trip.number} carrier={trip.carrier} />
      <View style={styles.body}>
        {/* Countdown sits on the meta line's right (Flighty's date slot) so
            the title and schedule lines get the full card width below.
            Date leads so a long carrier name truncates, never the date;
            the year lives in the section headers. */}
        <View style={styles.metaRow}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            numberOfLines={1}
            style={styles.metaCarrier}>
            {/* The logo already names the airline, so the flight number alone
                follows the date (Flighty's pattern); carrier is the fallback
                for number-less journal entries. */}
            {formatDayLabel(trip.scheduledDeparture, airportZone(trip.fromCode))} ·{' '}
            {trip.number || trip.carrier}
          </ThemedText>
          {badge ??
            (!old && (
              <ThemedText
                type={upcoming ? 'smallBold' : 'small'}
                themeColor={upcoming ? 'heading' : 'textSecondary'}>
                {timerLabel(countdown(trip.scheduledDeparture, now))}
              </ThemedText>
            ))}
        </View>
        <RouteLine trip={trip} />
        {/* The journal peeks through: the note's first line, so the list
            reads as a diary and not just a timetable. */}
        {trip.notes && (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            numberOfLines={1}
            style={styles.noteLine}>
            “{firstLine(trip.notes)}”
          </ThemedText>
        )}
      </View>
    </SheenCard>
  );
}

/** "in 3h" / "26h ago" / "in 5d" / "now" — compact enough to live on the
 * row's right edge without squeezing the flight details, and borrowed by the
 * journal's header so "Next trip in 5d" is worded like the row it points at. */
export function timerLabel(timer: { value: number; unit: string }): string {
  if (timer.unit === 'now') return 'now';
  const short = timer.unit.startsWith('hours') ? 'h' : 'd';
  return timer.unit.endsWith('ago') ? `${timer.value}${short} ago` : `in ${timer.value}${short}`;
}

/** The leg at list size: codes, then city, then the clock under each — the
 * same column the trip screen's hero stacks, at 22pt instead of 40. Only the
 * departure side carries the ticket's struck-through old time: two struck
 * clocks on one list row is unreadable, and the trip screen shows both ends.
 * Accessible as one label, since the codes are split views. */
function RouteLine({ trip }: { trip: RowTrip }) {
  const theme = useTheme();
  const { dep, arr } = clocks(trip);
  const was = trip.ticketedDeparture
    ? formatTime(trip.ticketedDeparture, airportZone(trip.fromCode))
    : null;
  // Block time reads as a fact about the segment (the hero's pattern); the
  // distance stands in when the times can't be differenced — or were never
  // typed, which is when the codes alone are the whole line.
  const middle = durationLabel(trip) ?? distanceLabel(trip) ?? ' ';
  const spoken = [trip.fromCode, dep, 'to', trip.toCode, arr].filter(Boolean).join(' ');

  return (
    <View accessible accessibilityLabel={spoken} style={styles.routeRow}>
      <View style={styles.endpoint}>
        <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
          {trip.fromCode}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.city} numberOfLines={1}>
          {cityOf(trip.fromCode)}
        </ThemedText>
        {(dep || arr) && (
          <ThemedText themeColor="heading" style={styles.clock} numberOfLines={1}>
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
      <View style={styles.contrail}>
        <View style={styles.contrailLine}>
          <ContrailDots />
          <SymbolView
            name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
            size={14}
            tintColor={theme.tint}
            style={Platform.OS === 'ios' ? undefined : styles.rotated}
          />
          <ContrailDots />
        </View>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.contrailLabel}
          numberOfLines={1}>
          {middle}
        </ThemedText>
      </View>
      <View style={[styles.endpoint, styles.endpointRight]}>
        <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
          {trip.toCode}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.city} numberOfLines={1}>
          {cityOf(trip.toCode)}
        </ThemedText>
        {/* A blank keeps the two columns level when only one clock exists. */}
        {(dep || arr) && (
          <ThemedText themeColor="heading" style={styles.clock} numberOfLines={1}>
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

/** The clocks under each code, each in its own airport's zone so the row
 * reads the way a boarding pass does no matter where the phone is.
 * Journal entries only carry times the user typed: identical noon timestamps
 * are the "no times" placeholder, identical non-noon ones mean a single
 * entered time — never render a fabricated departure → arrival pair. Judged
 * on the times themselves rather than on the row's source, which a trip
 * shared with a follower doesn't carry: two identical clocks are the same
 * non-fact whoever wrote them down. */
function clocks(trip: RowTrip): { dep: string | null; arr: string | null } {
  const { scheduledDeparture: dep, scheduledArrival: arr } = trip;
  if (dep === arr) {
    if (dep.endsWith('T12:00:00')) return { dep: null, arr: null };
    return { dep: formatTime(dep, airportZone(trip.fromCode)), arr: null };
  }
  return {
    dep: formatTime(dep, airportZone(trip.fromCode)),
    arr: formatTime(arr, airportZone(trip.toCode)),
  };
}

/** "4h 5m" — null for entries whose times can't be differenced even with
 * the airports' zones to pin them (see blockMinutes). */
function durationLabel(trip: RowTrip): string | null {
  const minutes = blockMinutes(
    trip.scheduledDeparture,
    trip.scheduledArrival,
    airportZone(trip.fromCode),
    airportZone(trip.toCode),
  );
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function distanceLabel(trip: RowTrip): string | null {
  return trip.distanceKm ? `${Math.round(trip.distanceKm).toLocaleString()} km` : null;
}

/** The first non-empty line of a note, for the list row's one-line peek. */
function firstLine(notes: string): string {
  return notes.split('\n').find((line) => line.trim())?.trim() ?? '';
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  body: { flex: 1, gap: Spacing.half },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  metaCarrier: { flex: 1 },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginTop: Spacing.half,
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
  city: {
    fontSize: 12,
    lineHeight: 16,
  },
  clock: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 600,
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
  noteLine: { fontStyle: 'italic', marginTop: Spacing.half },
});
