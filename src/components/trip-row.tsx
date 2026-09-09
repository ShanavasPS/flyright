import { StyleSheet, View } from 'react-native';

import { AirlineLogo } from '@/components/airline-logo';
import { RouteLeg } from '@/components/route-leg';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { countdown, flightInstant, formatDayLabel } from '@/services/dates';

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
  const departureZone = airportZone(trip.fromCode);
  const departs = flightInstant(trip.scheduledDeparture, departureZone);
  const old = now.getTime() - departs > YEAR_MS;
  const upcoming = departs >= now.getTime();

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
                {timerLabel(countdown(trip.scheduledDeparture, now, departureZone))}
              </ThemedText>
            ))}
        </View>
        <RouteLeg
          leg={{
            fromCode: trip.fromCode,
            toCode: trip.toCode,
            departure: trip.scheduledDeparture,
            arrival: trip.scheduledArrival,
            ticketedDeparture: trip.ticketedDeparture,
            distanceKm: trip.distanceKm,
          }}
        />
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
  noteLine: { fontStyle: 'italic', marginTop: Spacing.half },
});
