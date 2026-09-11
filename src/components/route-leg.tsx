import { SymbolView } from 'expo-symbols';
import { Fragment, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { dayOffset, dayOffsetMark, dayOffsetSpoken, formatTime } from '@/services/dates';
import { blockMinutes, cityOf } from '@/services/timeline';

/** The least a leg needs to be drawn: the two codes and the two clocks. */
export interface Leg {
  fromCode: string;
  toCode: string;
  departure: string;
  arrival: string;
  /** The clocks the flight was planned at, struck through in place once the
   * airline has moved it — the ticket's for the traveller, the timetable's
   * for a follower reading the airline's new estimate. */
  ticketedDeparture?: string | null;
  ticketedArrival?: string | null;
  distanceKm?: number | null;
}

/** One leg the way the trip screen's hero draws it — the two codes at the
 * edges with the contrail and plane between, a clock beneath each — at list
 * size (22pt codes, city under each, block time under the plane) or compact
 * (15pt codes and the clocks, nothing else) for a row that also has to fit a
 * name and a status line.
 *
 * `progress` puts the plane where the flight is: at the origin until it
 * departs, riding the line in the air, at the destination once landed — the
 * traveller's hero motif, so a follower reads "how much is left" from the
 * same picture. Without it the plane sits mid-line, as the journal's rows
 * have always drawn it. `yourTime` adds the landing clock in the reader's
 * own zone when that differs from the airport's: the traveller is standing
 * in that zone, the person waiting for them usually isn't.
 *
 * Every surface that shows a flight to somebody draws it with this: the
 * journal's rows, the trips a follower is shown, the live cards. */
export function RouteLeg({
  leg,
  compact = false,
  progress,
  yourTime = false,
  via = [],
}: {
  leg: Leg;
  compact?: boolean;
  progress?: number;
  yourTime?: boolean;
  /** Intermediate airports of a connecting itinerary, each with the layover
   * spent there ("2h 55m"): the compact leg then reads COK ✈ DOH ✈ HEL with
   * the wait under DOH. `leg` spans the whole trip — first origin to final
   * destination, first departure to final arrival. */
  via?: { code: string; layover: string | null }[];
}) {
  const theme = useTheme();
  const { dep, arr, nextDay } = clocks(leg);
  const depWas =
    !compact && leg.ticketedDeparture
      ? formatTime(leg.ticketedDeparture, airportZone(leg.fromCode))
      : null;
  const arrWas =
    !compact && leg.ticketedArrival
      ? formatTime(leg.ticketedArrival, airportZone(leg.toCode))
      : null;
  const arrLocal = !compact && yourTime && arr ? readerClock(leg.arrival, leg.toCode) : null;
  // Block time reads as a fact about the segment (the hero's pattern); the
  // distance stands in when the times can't be differenced — or were never
  // typed, which is when the codes alone are the whole line.
  const middle = compact ? null : (durationLabel(leg) ?? distanceLabel(leg) ?? ' ');
  const stops = compact ? via : [];
  const spoken = [
    leg.fromCode,
    dep,
    ...stops.flatMap((v) => ['via', v.code, v.layover ? `${v.layover} layover` : null]),
    'to',
    leg.toCode,
    arr,
    dayOffsetSpoken(nextDay),
  ]
    .filter(Boolean)
    .join(' ');
  const codeStyle = compact ? styles.codeCompact : styles.code;
  const clockStyle = compact ? styles.clockCompact : styles.clock;

  const row = (
    <View
      accessible
      accessibilityLabel={spoken}
      style={[styles.routeRow, compact && styles.routeRowCompact]}>
      <View style={[styles.endpoint, compact && styles.endpointCompact]}>
        <ThemedText themeColor="heading" style={codeStyle} numberOfLines={1}>
          {leg.fromCode}
        </ThemedText>
        {!compact && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.city} numberOfLines={2}>
            {cityOf(leg.fromCode)}
          </ThemedText>
        )}
        {(dep || arr) && (
          <ThemedText themeColor="heading" style={clockStyle} numberOfLines={1}>
            {dep ?? ' '}
          </ThemedText>
        )}
        {/* What was planned, struck through beneath the clock that now
            counts — its own line, so a wide "5:05 PM 6:00 PM" pair never
            squeezes the contrail or truncates the live time. */}
        {depWas && <Was clock={depWas} />}
      </View>
      {stops.map((stop) => (
        <Fragment key={stop.code}>
          <View style={[styles.contrail, styles.contrailCompact]}>
            <Contrail tint={theme.tint} dotColor={theme.textSecondary} size={12} />
          </View>
          <View style={[styles.endpoint, styles.endpointCompact, styles.stop]}>
            <ThemedText themeColor="heading" style={codeStyle} numberOfLines={1}>
              {stop.code}
            </ThemedText>
            {stop.layover && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.layover} numberOfLines={1}>
                {stop.layover}
              </ThemedText>
            )}
          </View>
        </Fragment>
      ))}
      <View style={[styles.contrail, compact && styles.contrailCompact]}>
        <Contrail
          progress={stops.length ? undefined : progress}
          tint={theme.tint}
          dotColor={theme.textSecondary}
          size={compact ? 12 : 14}
        />
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
      <View style={[styles.endpoint, compact && styles.endpointCompact, styles.endpointRight]}>
        <ThemedText themeColor="heading" style={codeStyle} numberOfLines={1}>
          {leg.toCode}
        </ThemedText>
        {!compact && (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={[styles.city, styles.cityRight]}
            numberOfLines={2}>
            {cityOf(leg.toCode)}
          </ThemedText>
        )}
        {/* A blank keeps the two columns level when only one clock exists. */}
        {(dep || arr) && (
          <ThemedText themeColor="heading" style={clockStyle} numberOfLines={1}>
            {arr ?? ' '}
            {/* "⁺¹" hangs off a clock that reads on the next day's page, as
                the timetables print it — the row names only the departure
                day, so without it a 2:45 AM landing reads as before take-off. */}
            {!!arr && !!nextDay && (
              <ThemedText themeColor="textSecondary" style={clockStyle}>
                {dayOffsetMark(nextDay)}
              </ThemedText>
            )}
          </ThemedText>
        )}
        {arrWas && <Was clock={arrWas} />}
      </View>
    </View>
  );

  if (!arrLocal) return row;
  // Under the leg rather than inside the destination column: a "10:55 AM
  // your time" is wider than any code, and inside the column it pushed the
  // contrail's end away from the code it points at.
  return (
    <View>
      {row}
      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={[styles.city, styles.yourTime]}
        numberOfLines={1}
        accessibilityLabel={`Lands ${arrLocal} your time`}>
        {arrLocal} your time
      </ThemedText>
    </View>
  );
}

function Was({ clock }: { clock: string }) {
  return (
    <ThemedText
      type="small"
      themeColor="textSecondary"
      style={[styles.city, styles.movedFrom]}
      numberOfLines={1}
      accessibilityLabel={`Moved from ${clock}`}>
      {clock}
    </ThemedText>
  );
}

/** The dotted contrail between the codes, with the plane on it. Given a
 * `progress` the plane rides the line and the flown part turns solid behind
 * it (the traveller's hero and Live Activity motif); without one it sits
 * mid-line, the journal's static drawing. Colours are the caller's, so the
 * night-sky pass and the light cards draw the same line. */
export function Contrail({
  progress,
  tint,
  dotColor,
  size = 14,
  style,
}: {
  progress?: number;
  tint: string;
  dotColor: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const travel = Math.max(0, width - size);
  const at = progress === undefined ? 0.5 : Math.min(1, Math.max(0, progress));
  const x = at * travel;
  const dots = size >= 14 ? 9 : 7;
  return (
    <View
      style={[styles.contrailLine, { height: size }, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.contrailDots}>
        {Array.from({ length: dots }, (_, i) => (
          <View
            key={i}
            style={[
              styles.contrailDot,
              { backgroundColor: dotColor },
              (i === 0 || i === dots - 1) && styles.contrailEndDot,
            ]}
          />
        ))}
      </View>
      {progress !== undefined && width > 0 && (
        <View style={[styles.contrailFlown, { backgroundColor: tint, width: x + size / 2 }]} />
      )}
      {width > 0 && (
        <View style={[styles.plane, { transform: [{ translateX: x }] }]}>
          <SymbolView
            name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
            size={size}
            tintColor={tint}
            style={Platform.OS === 'ios' ? undefined : styles.rotated}
          />
        </View>
      )}
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
export function clocks(leg: Leg): { dep: string | null; arr: string | null; nextDay: number | null } {
  const { departure: dep, arrival: arr } = leg;
  if (dep === arr) {
    if (dep.endsWith('T12:00:00')) return { dep: null, arr: null, nextDay: null };
    return { dep: formatTime(dep, airportZone(leg.fromCode)), arr: null, nextDay: null };
  }
  return {
    dep: formatTime(dep, airportZone(leg.fromCode)),
    arr: formatTime(arr, airportZone(leg.toCode)),
    nextDay: dayOffset(dep, airportZone(leg.fromCode), arr, airportZone(leg.toCode)),
  };
}

/** The same instant on the reader's own clock — null when it reads the
 * same as the airport's, or when the timestamp carries no zone to convert
 * from (a typed journal time is a wall clock, not an instant). */
export function readerClock(iso: string, airportCode: string): string | null {
  if (!/(?:Z|[+-]\d\d:?\d\d)$/.test(iso)) return null;
  const local = formatTime(iso);
  return local === formatTime(iso, airportZone(airportCode)) ? null : local;
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
  // Columns stretch to the tallest, and each clock sits at the bottom of
  // its column (marginTop auto), so when one city wraps to two lines the
  // two clocks still read on one level, the way a boarding pass prints them.
  routeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  routeRowCompact: {
    marginTop: 0,
  },
  // The three columns split the row by ratio, never by content: a code is
  // always three letters and the contrail between them must be the same
  // width and the plane in the same place whether the city under the code
  // is "Kochi" or "Dallas-Fort Worth" — a long city wraps inside its
  // column instead of pushing the line aside. No minWidth on the list
  // columns: Yoga takes it as the flex base before sharing out the rest,
  // so unequal floors bend the ratio (the hero learned this the hard way).
  endpoint: {
    flex: 1,
  },
  // No city under a compact code, so the column is just wide enough for the
  // widest clock ("12:55 PM") and the contrail takes everything else.
  endpointCompact: {
    flex: 0,
    width: 56,
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
    // A code never truncates to its first letter; the contrails give first.
    flexShrink: 0,
  },
  city: {
    fontSize: 12,
    lineHeight: 16,
  },
  cityRight: { textAlign: 'right' },
  clock: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 600,
    marginTop: 'auto',
  },
  clockCompact: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
  // An intermediate stop: the code centred over its layover.
  stop: { alignItems: 'center' },
  layover: {
    fontSize: 11,
    lineHeight: 16,
  },
  movedFrom: { textDecorationLine: 'line-through' },
  yourTime: { textAlign: 'right', marginTop: Spacing.half },
  // The line is 14pt tall; the 6pt offset centres the plane on the 26pt code
  // line, and the label beneath then sits level with the cities.
  contrail: {
    flex: 1.4,
    alignItems: 'center',
    marginTop: 6,
    gap: Spacing.half,
  },
  // Compact codes are 18pt tall, so a 3pt offset centres the 12pt line. The
  // contrail takes the width between the codes, so a compact leg spans its
  // row edge to edge the way the journal's rows do beneath it.
  contrailCompact: {
    flex: 1,
    minWidth: 28,
    marginTop: 3,
  },
  contrailLine: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  contrailDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contrailDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.55,
  },
  contrailEndDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.9,
  },
  contrailFlown: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -1,
    height: 2,
    borderRadius: 1,
    opacity: 0.7,
  },
  plane: {
    position: 'absolute',
    left: 0,
    top: 0,
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
