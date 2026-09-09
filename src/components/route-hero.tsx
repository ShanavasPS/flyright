import { SymbolView } from 'expo-symbols';
import { Platform, StyleSheet, View } from 'react-native';

import { AirlineLogo, airlineCode } from '@/components/airline-logo';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone, getAirport } from '@/services/airports';
import { flightInstant } from '@/services/dates';
import { spanLabel } from '@/services/public-session';
import { blockMinutes } from '@/services/timeline';

/** The least a hero needs to draw a leg. Deliberately narrower than the
 * rules engine's `Journey`, so a trip that reaches the screen as somebody
 * else's — a follower's copy carries no id, no mode, no carrier country —
 * can be shown by the same component rather than by a second design. */
export interface HeroJourney {
  from: { code: string };
  to: { code: string };
  carrier: string;
  number: string;
  scheduledDeparture: string;
  scheduledArrival: string;
  /** Great-circle kilometres; omitted when the endpoints aren't airports we
   * know, in which case the hero simply doesn't claim a distance. */
  distanceKm?: number | null;
}

/** The clocks the route hero shows, and — once an airline has moved the
 * flight — the ones the ticket was booked at. */
export interface Schedule {
  departure: string;
  arrival: string | null;
  departureWas: string | null;
  arrivalWas: string | null;
  /** "55 min later", once the airline has moved the flight. A struck-through
   * clock shows THAT something changed; only words say by how much, and in
   * which direction — which is the part a traveller has to act on. */
  moved: string | null;
}

/** City for the hero's endpoint caption — the code itself when the airport
 * isn't in the dataset (manual train/bus entries). */
export function cityLabel(place: { code: string }): string {
  return getAirport(place.code)?.city ?? place.code;
}

/** Block duration, "16h 35m" — null for entries whose times can't be
 * differenced even with the airports' zones to pin them (see blockMinutes). */
function durationLabel(journey: HeroJourney): string | null {
  const minutes = blockMinutes(
    journey.scheduledDeparture,
    journey.scheduledArrival,
    airportZone(journey.from.code),
    airportZone(journey.to.code),
  );
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** "EK215 · Emirates"; just the number when the carrier is only its IATA
 * code (lookup rows store the code); just the carrier for entries without a
 * flight number. */
function flightLabel(journey: HeroJourney): string {
  const carrier = journey.carrier.trim();
  if (!journey.number) return carrier;
  if (!carrier || carrier.toUpperCase() === airlineCode(journey.number)) return journey.number;
  return `${journey.number} · ${carrier}`;
}

/** The date chip's relative reading: a countdown before departure, "Flown"
 * after. Inside two days it counts the way the cards do — "In 2h 23m", not
 * "In 2 hours" — so the trip page and the row that opened it agree. */
function dateChipLabel(departure: string, now: Date, zone: string | null): string {
  const ms = flightInstant(departure, zone) - now.getTime();
  if (Number.isNaN(ms)) return '';
  if (ms < 0) return 'Flown';
  if (ms < 60_000) return 'Departing now';
  if (ms < 48 * 3_600_000) return `In ${spanLabel(ms)}`;
  const days = Math.round(ms / 86_400_000);
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}

/** The trip at a glance, the boarding-pass row the journeys list uses but on
 * the page: airline and flight number as an eyebrow with a relative date
 * chip, the two codes big at the edges with the contrail and plane between,
 * cities and times beneath. The block time sits over the contrail and the
 * distance under it, so both read as facts about the segment rather than as
 * a footnote — the pattern Polarsteps, Qantas and Flighty all use.
 *
 * One design for every trip, whoever is flying it. A follower reading
 * somebody else's trip is reading the same kind of thing — a flight, on a
 * day, between two airports — and a second layout for it would only have
 * taught the same reader two ways to find the departure time. */
export function RouteHero({
  journey,
  now,
  schedule,
  action,
}: {
  journey: HeroJourney;
  now: number;
  schedule: Schedule | null;
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  const flown = Date.parse(journey.scheduledDeparture) <= now;
  const chip = dateChipLabel(journey.scheduledDeparture, new Date(now), airportZone(journey.from.code));
  const duration = durationLabel(journey);
  // The date lives in the screen header (tripDateTitle) and how far off it
  // is in the chip above; the contrail column carries only what belongs to
  // the segment itself.
  const distance = journey.distanceKm
    ? `${Math.round(journey.distanceKm).toLocaleString()} km`
    : ' ';

  return (
    <View style={styles.hero}>
      <View style={styles.eyebrowRow}>
        <AirlineLogo number={journey.number} carrier={journey.carrier} size={28} />
        <ThemedText type="smallBold" themeColor="heading" style={styles.eyebrowText} numberOfLines={1}>
          {flightLabel(journey)}
        </ThemedText>
        <View
          style={[
            styles.chip,
            { backgroundColor: flown ? theme.field : `${theme.tint}1A` },
          ]}>
          <ThemedText
            type="smallBold"
            style={[styles.chipText, { color: flown ? theme.textSecondary : theme.tint }]}>
            {chip}
          </ThemedText>
        </View>
        {action}
      </View>

      {schedule?.moved && schedule.departureWas && (
        <View style={[styles.movedNotice, { backgroundColor: `${theme.tint}14` }]}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            {journey.carrier} moved this flight
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            It now departs {schedule.departure} — {schedule.moved} than the {schedule.departureWas}{' '}
            on your ticket.
          </ThemedText>
        </View>
      )}

      <View accessible accessibilityLabel={`${journey.from.code} to ${journey.to.code}`} style={styles.codesRow}>
        <View style={styles.endpoint}>
          <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
            {journey.from.code}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {cityLabel(journey.from)}
          </ThemedText>
          {schedule && <ThemedText style={styles.time}>{schedule.departure}</ThemedText>}
          {schedule?.departureWas && <MovedFrom clock={schedule.departureWas} />}
        </View>
        <View style={styles.contrail}>
          {/* A blank keeps the line centred on the codes when the lookup
              carried no UTC offsets and there is no block time to show. */}
          <ThemedText
            type="smallBold"
            themeColor="heading"
            style={styles.contrailLabel}
            numberOfLines={1}>
            {duration ?? ' '}
          </ThemedText>
          <View style={styles.contrailLine}>
            <ContrailDots />
            <SymbolView
              name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
              size={18}
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
            {distance}
          </ThemedText>
        </View>
        <View style={[styles.endpoint, styles.endpointRight]}>
          <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
            {journey.to.code}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {cityLabel(journey.to)}
          </ThemedText>
          {schedule && (
            <ThemedText style={styles.time}>{schedule.arrival ?? ' '}</ThemedText>
          )}
          {schedule?.arrivalWas && <MovedFrom clock={schedule.arrivalWas} />}
        </View>
      </View>
    </View>
  );
}

/** What the ticket said before the airline moved the flight. Struck through
 * and quiet: the new time is the one that matters now, but a traveler who
 * wrote 11:30 in their calendar needs to see that we know it said 11:30. */
function MovedFrom({ clock }: { clock: string }) {
  return (
    <ThemedText
      type="small"
      themeColor="textSecondary"
      style={styles.timeWas}
      numberOfLines={1}
      accessibilityLabel={`Moved from ${clock}`}>
      {clock}
    </ThemedText>
  );
}

/** Half of the dotted contrail between the codes — the journeys list's
 * boarding-pass motif in the page's own palette. */
function ContrailDots() {
  const theme = useTheme();
  return (
    <View style={styles.contrailDots}>
      {Array.from({ length: 4 }, (_, i) => (
        <View key={i} style={[styles.contrailDot, { backgroundColor: theme.textSecondary }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.one,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  eyebrowText: {
    flex: 1,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + Spacing.half,
    borderRadius: Spacing.four,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
  },
  codesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  endpoint: {
    flexShrink: 1,
    gap: Spacing.half,
  },
  endpointRight: {
    alignItems: 'flex-end',
  },
  code: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  time: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
    marginTop: Spacing.one,
  },
  timeWas: {
    textDecorationLine: 'line-through',
  },
  movedNotice: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.three,
  },
  // Label + line + label total 54pt; the -4 margin centres the plane on the
  // 46pt code line rather than on the whole endpoint column.
  contrail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    height: 54,
    marginTop: -4,
    paddingHorizontal: Spacing.one,
  },
  contrailLabel: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  contrailLine: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 18,
  },
  contrailDots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  contrailDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.55,
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
  },
});
