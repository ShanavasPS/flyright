import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AirlineLogo, airlineCode } from '@/components/airline-logo';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone, getAirport } from '@/services/airports';
import { dayOffsetMark, dayOffsetSpoken, flightInstant } from '@/services/dates';
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
  /** Calendar days the landing is after the departure (dayOffset): the
   * "⁺¹" on the arrival clock, and the day spelled out under it. */
  arrivalDayOffset?: number | null;
  /** "Sat, Oct 3" — the arrival day, when it isn't the departure's. */
  arrivalDay?: string | null;
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

/** The date chip's relative reading: a countdown before departure, "In the
 * air" while the flight is under way, "Flown" after. Inside two days it
 * counts the way the cards do — "In 2h 23m", not "In 2 hours" — so the trip
 * page and the row that opened it agree. */
function dateChipLabel(departure: string, now: Date, zone: string | null, airborne: boolean): string {
  if (airborne) return 'In the air';
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
 * taught the same reader two ways to find the departure time.
 *
 * With `progress` — the fraction of the flight elapsed, while it is in the
 * air — the contrail becomes a progress line: the plane slides along it,
 * the dots behind it fill in the tint, and the chip reads "In the air". */
export function RouteHero({
  journey,
  now,
  schedule,
  progress = null,
  action,
}: {
  journey: HeroJourney;
  now: number;
  schedule: Schedule | null;
  /** 0–1 while the flight is under way (see travel-day's flightProgress);
   * null before departure and after landing. */
  progress?: number | null;
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  const airborne = progress != null;
  const flown = !airborne && Date.parse(journey.scheduledDeparture) <= now;
  const chip = dateChipLabel(journey.scheduledDeparture, new Date(now), airportZone(journey.from.code), airborne);
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

      <View
        accessible
        accessibilityLabel={
          progress == null
            ? `${journey.from.code} to ${journey.to.code}`
            : `${journey.from.code} to ${journey.to.code}, ${Math.round(progress * 100)} percent of the way`
        }
        style={styles.codesRow}>
        <View style={styles.endpoint}>
          <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
            {journey.from.code}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {cityLabel(journey.from)}
          </ThemedText>
          {schedule && <ThemedText style={styles.time}>{schedule.departure}</ThemedText>}
          {schedule?.departureWas && <MovedFrom clock={schedule.departureWas} />}
          {/* A blank line keeps the two clocks level when the arrival
              column carries its day under its clock. */}
          {!!schedule?.arrivalDay && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {' '}
            </ThemedText>
          )}
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
          {progress == null ? (
            <View style={styles.contrailLine}>
              <ContrailDots />
              <PlaneGlyph />
              <ContrailDots />
            </View>
          ) : (
            <ProgressContrail progress={progress} />
          )}
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
          <ThemedText type="small" themeColor="textSecondary" style={styles.cityRight} numberOfLines={2}>
            {cityLabel(journey.to)}
          </ThemedText>
          {schedule && (
            <ThemedText
              style={styles.time}
              accessibilityLabel={
                schedule.arrival
                  ? [schedule.arrival, dayOffsetSpoken(schedule.arrivalDayOffset ?? null)].filter(Boolean).join(', ')
                  : undefined
              }>
              {schedule.arrival ?? ' '}
              {!!schedule.arrival && !!schedule.arrivalDayOffset && (
                <ThemedText themeColor="textSecondary" style={styles.time}>
                  {dayOffsetMark(schedule.arrivalDayOffset)}
                </ThemedText>
              )}
            </ThemedText>
          )}
          {schedule?.arrivalWas && <MovedFrom clock={schedule.arrivalWas} />}
          {/* The header names the departure day only; a landing on another
              day says which under its clock — the ⁺¹ already says it's later. */}
          {!!schedule?.arrivalDay && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.cityRight} numberOfLines={1}>
              {schedule.arrivalDay}
            </ThemedText>
          )}
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

function PlaneGlyph() {
  const theme = useTheme();
  return (
    <SymbolView
      name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
      size={PLANE_SIZE}
      tintColor={theme.tint}
      style={Platform.OS === 'ios' ? undefined : styles.rotated}
    />
  );
}

const PLANE_SIZE = 18;
/** Dots across the whole contrail when it shows progress — one more than
 * the two resting halves carry, so the spacing stays about the same. */
const PROGRESS_DOTS = 9;

/** The contrail while the flight is in the air: the plane at `progress`
 * of the way across, the dots it has passed in the tint, the ones ahead as
 * they were; a dot the plane would sit on steps aside. */
function ProgressContrail({ progress }: { progress: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const planeX = Math.min(1, Math.max(0, progress)) * (width - PLANE_SIZE);
  const centre = planeX + PLANE_SIZE / 2;
  const dots = [];
  for (let i = 0; i < PROGRESS_DOTS; i += 1) {
    const x = ((i + 0.5) * width) / PROGRESS_DOTS;
    if (Math.abs(x - centre) < PLANE_SIZE / 2 + 3) continue;
    const passed = x < centre;
    dots.push(
      <View
        key={i}
        style={[
          styles.contrailDot,
          styles.progressDot,
          { left: x - 2, backgroundColor: passed ? theme.tint : theme.textSecondary, opacity: passed ? 1 : 0.55 },
        ]}
      />,
    );
  }
  return (
    <View style={styles.contrailLine} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && dots}
      {width > 0 && (
        <View style={[styles.progressPlane, { left: planeX }]}>
          <PlaneGlyph />
        </View>
      )}
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
  // Columns stretch to the tallest and the clocks sit at the bottom of
  // theirs, so a wrapped city on one side never drops its clock below the
  // other's.
  codesRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.two,
  },
  // Split by ratio, not by content (the journal rows' rule, see RouteLeg):
  // the codes are always three letters, so the contrail is the same width
  // and the plane sits in the same place whatever city is written under
  // them — a long one wraps within its column. No minWidth on any column:
  // Yoga uses it as the flex base before sharing out the rest, which bent
  // the ratio wherever the floors differed.
  endpoint: {
    flex: 1,
    gap: Spacing.half,
  },
  endpointRight: {
    alignItems: 'flex-end',
  },
  cityRight: { textAlign: 'right' },
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
    marginTop: 'auto',
    paddingTop: Spacing.one,
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
    flex: 1.4,
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
  progressDot: {
    position: 'absolute',
    top: 7,
  },
  progressPlane: {
    position: 'absolute',
    top: 0,
    width: PLANE_SIZE,
    height: PLANE_SIZE,
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
  },
});
