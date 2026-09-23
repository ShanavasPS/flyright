import { Pressable, StyleSheet, View } from 'react-native';

import { AirlineLogo } from '@/components/airline-logo';
import { RouteLeg } from '@/components/route-leg';
import { BORDER_WIDTH, RunningBorder } from '@/components/running-border';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
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
 * Pressing is normally the caller's. A highlighted row has two sibling
 * actions: its live-card shortcut and its normal flight-detail target.
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
  eyebrow,
  eyebrowTone = 'tint',
  progress,
  live = false,
  highlight,
}: {
  trip: RowTrip;
  now: Date;
  /** The meta line's right slot when something outranks the countdown — the
   * journal puts the money moment there. */
  badge?: React.ReactNode;
  /** Two-pane mode: this is the row the detail pane is showing. */
  selected?: boolean;
  /** A headline over the row in the live card's own voice — bold, upper-case,
   * with the dot: "DEPARTS IN 2H 35M" on the leg that continues a journey
   * under way. Replaces the meta line's countdown, which would say the same
   * thing smaller. */
  eyebrow?: string;
  /** The headline's colour carries the focus: `tint` when this leg is the one
   * to watch (the previous leg has landed), `heading` while an earlier leg is
   * still the live one. */
  eyebrowTone?: 'tint' | 'heading';
  /** Where the flight is along the route, 0–1 — the plane waits at the
   * origin, then rides the line. Omitted, the plane sits mid-line as the
   * journal has always drawn it. */
  progress?: number;
  /** In the air right now: the row wears the live card's running light and
   * counts down to the landing instead of saying how long ago it left. */
  live?: boolean;
  /** The active flight keeps its full row, with a shortcut to its live card.
   * Separate targets let both actions work with touch and screen readers. */
  highlight?: {
    color: string;
    running: boolean;
    action: React.ReactNode;
    onOpenTrip: () => void;
    departure?: string | null;
    arrival?: string | null;
  };
}) {
  const theme = useTheme();
  const eyebrowColor = eyebrowTone === 'heading' ? theme.heading : theme.tint;
  const departureZone = airportZone(trip.fromCode);
  const departs = flightInstant(trip.scheduledDeparture, departureZone);
  const old = now.getTime() - departs > YEAR_MS;
  const upcoming = departs >= now.getTime();
  const departure = highlight?.departure ?? trip.scheduledDeparture;
  const arrival = highlight?.arrival ?? trip.scheduledArrival;

  const body = (
    <>
      <AirlineLogo number={trip.number} carrier={trip.carrier} />
      <View style={styles.body}>
        {eyebrow && (
          <View style={styles.eyebrowRow}>
            <View style={[styles.eyebrowDot, { backgroundColor: eyebrowColor }]} />
            <ThemedText type="smallBold" style={{ color: eyebrowColor }} numberOfLines={1}>
              {eyebrow.toUpperCase()}
            </ThemedText>
          </View>
        )}
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
            (!highlight && (live ? (
              // "2h ago" is the wrong fact while the flight is still in the
              // air, and "in 3h" is too coarse to look alive: the row runs
              // the live card's own clock, at the meta line's size.
              <LandingClock
                departure={trip.scheduledDeparture}
                fromCode={trip.fromCode}
                arrival={trip.scheduledArrival}
                toCode={trip.toCode}
              />
            ) : (
              !old &&
              !eyebrow && (
                <ThemedText
                  type={upcoming ? 'smallBold' : 'small'}
                  themeColor={upcoming ? 'heading' : 'textSecondary'}>
                  {timerLabel(countdown(trip.scheduledDeparture, now, departureZone))}
                </ThemedText>
              )
            )))}
        </View>
        <RouteLeg
          progress={progress}
          leg={{
            fromCode: trip.fromCode,
            toCode: trip.toCode,
            departure,
            arrival,
            ticketedDeparture: trip.ticketedDeparture ?? (departure !== trip.scheduledDeparture ? trip.scheduledDeparture : undefined),
            ticketedArrival: arrival !== trip.scheduledArrival ? trip.scheduledArrival : undefined,
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
    </>
  );

  return (
    <SheenCard
      style={[
        styles.card,
        live && styles.liveCard,
        live && { borderWidth: BORDER_WIDTH, borderColor: `${theme.tint}59` },
        selected && { borderWidth: 1, borderColor: theme.tint },
        highlight && styles.highlightCard,
        highlight && { borderWidth: BORDER_WIDTH, borderColor: `${highlight.color}59` },
      ]}>
      {(live || highlight) && <RunningBorder color={highlight?.color ?? theme.tint} radius={Spacing.four} running={highlight?.running ?? true} />}
      {highlight ? (
        <>
          {highlight.action}
          <Pressable
            testID="trip-live-row"
            accessibilityRole="button"
            accessibilityLabel={`Open ${trip.number || trip.carrier} trip from ${trip.fromCode} to ${trip.toCode}`}
            onPress={highlight.onOpenTrip}
            style={({ pressed }) => [styles.highlightBody, pressed && { opacity: 0.9 }]}>
            {body}
          </Pressable>
        </>
      ) : body}
    </SheenCard>
  );
}

/** "in 3h" / "26h ago" / "in 5d" / "now" — compact enough to live on the
 * row's right edge without squeezing the flight details, and borrowed by the
 * journal's header so "Next trip in 5d" is worded like the row it points at. */
/** The live card's countdown, at a row's size: hours, minutes and seconds to
 * the landing, ticking on its own so the journal does not have to re-render
 * the whole list every second. Holds at 0:00:00 once the time is up — the
 * flight is down, and the row will move out of Live on the next read. */
function LandingClock({
  departure,
  fromCode,
  arrival,
  toCode,
}: {
  departure: string;
  fromCode: string;
  arrival: string;
  toCode: string;
}) {
  const theme = useTheme();
  const now = useNow(1000);
  // Named the way the live card names it, and for the same reason: a bare
  // number does not say what it is counting to.
  const leaving = flightInstant(departure, airportZone(fromCode)) > now.getTime();
  const target = leaving
    ? flightInstant(departure, airportZone(fromCode))
    : flightInstant(arrival, airportZone(toCode));
  const total = Math.floor(Math.max(0, target - now.getTime()) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <View style={styles.clockBlock}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.clockLabel}>
        {leaving ? 'Departs in' : 'Lands in'}
      </ThemedText>
      <ThemedText type="smallBold" style={[styles.clock, { color: theme.success }]}>
        {hours}:{pad(minutes)}:{pad(seconds)}
      </ThemedText>
    </View>
  );
}

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
  clock: { fontVariant: ['tabular-nums'] },
  clockBlock: { alignItems: 'flex-end', gap: 1 },
  clockLabel: { fontSize: 10, lineHeight: 13, textTransform: 'uppercase', letterSpacing: 1 },
  // A flight in the air earns a little more room than a row in a list.
  liveCard: { paddingVertical: Spacing.three + Spacing.one },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  body: { flex: 1, gap: Spacing.half },
  highlightCard: { flexDirection: 'column', alignItems: 'stretch', padding: 0, gap: 0 },
  highlightBody: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.half,
  },
  eyebrowDot: { width: 8, height: 8, borderRadius: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  metaCarrier: { flex: 1 },
  noteLine: { fontStyle: 'italic', marginTop: Spacing.half },
});
