import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AirlineLogo, airlineCode } from '@/components/airline-logo';
import { RecordGlobe } from '@/components/record-globe';
import { RouteLeg } from '@/components/route-leg';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { TripRow } from '@/components/trip-row';
import {
  COBALT,
  MiniContrail,
  NIGHT_SKY,
  WHITE,
  WHITE_DIM,
  WHITE_FAINT,
} from '@/components/travel-stats-header';
import { carrierCodeForName } from '@/constants/carriers';
import { Spacing } from '@/constants/theme';
import { useCountUp } from '@/hooks/use-count-up';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { formatDayLabelWithYear } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';
import { useFlagTint, useLogoTint } from '@/services/logo-tint';
import { airlineOf, formatKm } from '@/services/timeline';
import {
  aroundEarth,
  countryName,
  flagEmoji,
  formatStars,
  localClockAt,
  plural,
  type AircraftRank,
  type AirlineRank,
  type DestinationDetail,
  type MakerRank,
} from '@/services/travel-recap';

/** The Travel stats cards. Each wears the colours of what it shows — the
 * hero the brand's night sky, the record flight the globe it crossed, the
 * destination the sky over that city at its own hour with its flag, the
 * airline its own mark's colour — and each is a door to the list behind it. */

const GLOBE_HEIGHT = 120;
// A big faint plane climbing across the aircraft card. SF's points east,
// Material's north — both end up north-east.
const PLANE_WATERMARK_TILT = Platform.select({
  ios: { transform: [{ rotate: '-30deg' }] },
  default: { transform: [{ rotate: '60deg' }] },
});

/** The passport hero: the total and how far round the Earth that is. */
export function StatsHero({
  totalKm,
  trips,
  hoursAloft,
  hoursEstimated,
  countries,
  airports,
  since,
}: {
  totalKm: number;
  trips: number;
  hoursAloft: number;
  hoursEstimated: boolean;
  countries: number;
  airports: number;
  since: string | null;
}) {
  // The headline number counts up on entry — a logbook total should feel
  // accumulated, not printed.
  const shownKm = useCountUp(totalKm, 1100);
  const orbit = aroundEarth(totalKm);
  const days = hoursAloft / 24;
  const aloft =
    hoursAloft <= 0
      ? '—'
      : days >= 1
        ? `${days.toFixed(days >= 10 ? 0 : 1)} d`
        : `${Math.round(hoursAloft)} h`;
  return (
    <View
      accessible
      accessibilityLabel={`${formatKm(totalKm)} kilometres flown, ${orbit.laps.toFixed(1)} times around the Earth. ${plural(trips, 'trip')}, ${aloft} in the air, ${plural(countries, 'country', 'countries')}, ${plural(airports, 'airport')}.`}
      style={[styles.hero, { experimental_backgroundImage: NIGHT_SKY }]}>
      <View style={styles.spaced}>
        <Text style={styles.heroMicro}>{since ? `All-time · since ${since}` : 'All-time'}</Text>
        <MiniContrail />
      </View>
      <Text style={styles.heroBig}>
        {formatKm(shownKm)}
        <Text style={styles.heroUnit}> km</Text>
      </Text>
      <View style={styles.orbit}>
        <Text style={styles.orbitText}>
          {orbit.laps >= 0.1 ? `${orbit.laps.toFixed(1)}× around the Earth` : 'Around the Earth'}
        </Text>
        <View style={styles.orbitBar}>
          <View style={[styles.orbitFill, { width: `${Math.round(orbit.progress * 100)}%` }]} />
        </View>
        <Text style={styles.orbitText}>→ {orbit.next}×</Text>
      </View>
      <View style={styles.heroGrid}>
        <HeroStat value={trips.toLocaleString()} label={trips === 1 ? 'Trip' : 'Trips'} />
        <HeroStat value={`${hoursEstimated ? '≈' : ''}${aloft}`} label="In the air" />
        <HeroStat value={countries.toLocaleString()} label={countries === 1 ? 'Country' : 'Countries'} />
        <HeroStat value={airports.toLocaleString()} label={airports === 1 ? 'Airport' : 'Airports'} />
      </View>
    </View>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

/** "LONGEST FLIGHT" on the left, "All flights ›" on the right — the label
 * names the card, the link says where it opens. */
export function SectionLink({ label, link, onPress }: { label: string; link: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionRow}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
        {label}
      </ThemedText>
      <Pressable accessibilityRole="link" hitSlop={Spacing.two} onPress={onPress} style={styles.sectionLink}>
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          {link}
        </ThemedText>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={11}
          weight="semibold"
          tintColor={theme.tint}
        />
      </Pressable>
    </View>
  );
}

/** A record flight on the globe it crossed, its leg beneath, the airline
 * and day in the footer. */
export function RecordCard({
  row,
  tag,
  rank,
  onPress,
}: {
  row: JourneyRow;
  /** "Longest" on the stats page… */
  tag?: string;
  /** …or its place in the ranked list. */
  rank?: number;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const airline = airlineOf(row);
  const when = formatDayLabelWithYear(row.scheduledDeparture, airportZone(row.fromCode));
  const km = `${Math.round(row.distanceKm).toLocaleString()} km`;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${tag ?? `Number ${rank}`}: ${row.fromCode} to ${row.toCode}, ${km}${airline ? `, ${airline}` : ''}, ${when}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <SheenCard style={styles.record}>
        <View>
          <RecordGlobe journey={row} height={GLOBE_HEIGHT} />
          <View style={styles.recordTags} pointerEvents="none">
            <View style={[styles.tag, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold" themeColor="heading" style={styles.tagText}>
                {tag ?? `#${rank}`}
              </ThemedText>
            </View>
            <View style={[styles.tag, { backgroundColor: theme.heading }]}>
              <ThemedText type="smallBold" style={[styles.tagText, { color: theme.background }]}>
                {km}
              </ThemedText>
            </View>
          </View>
        </View>
        <View style={styles.recordBody}>
          <RouteLeg
            leg={{
              fromCode: row.fromCode,
              toCode: row.toCode,
              departure: row.scheduledDeparture,
              arrival: row.scheduledArrival,
              distanceKm: row.distanceKm,
            }}
          />
        </View>
        <View style={[styles.recordFooter, { borderTopColor: theme.hairline }]}>
          <AirlineLogo number={row.number} carrier={row.carrier} size={28} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.grow} numberOfLines={1}>
            {airline ? `${airline} · ${when}` : when}
          </ThemedText>
          {onPress && (
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={13}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
          )}
        </View>
      </SheenCard>
    </Pressable>
  );
}

/** The top destination in its country's colours, read off the flag the way
 * the airline card reads its logo — the flag itself as a watermark, the
 * local time there now, the chips the airports landed at. Until the flag is
 * read (or on web, where it can't be), the brand navy with the tint. */
export function DestinationCard({
  destination,
  label = 'Top destination',
  now,
  compact = false,
  onPress,
}: {
  destination: DestinationDetail;
  label?: string;
  now: Date;
  compact?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const primary = destination.codes[0];
  const clock = localClockAt(primary, now);
  const country = countryName(destination.country);
  const flag = flagEmoji(destination.country);
  const tint = useFlagTint(destination.country);
  const gradient = tint
    ? `linear-gradient(160deg, ${tint.base} 0%, ${tint.base} 40%, ${tint.light} 100%)`
    : `linear-gradient(160deg, #0C1B36 0%, #1C3459 55%, ${theme.tint} 100%)`;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${destination.city}, ${country}, ${plural(destination.landings, 'landing')}${clock ? `, ${clock} there now` : ''}.`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.themed,
        compact && styles.themedCompact,
        { experimental_backgroundImage: gradient, opacity: pressed ? 0.92 : 1 },
      ]}>
      {!!flag && (
        <Text style={[styles.flagWatermark, compact && styles.flagWatermarkCompact]} accessible={false}>
          {flag}
        </Text>
      )}
      <Text style={styles.themedMicro}>
        {label}
        {clock ? ` · ${clock} there now` : ''}
      </Text>
      <Text style={[styles.themedName, compact && styles.themedNameCompact]} numberOfLines={1} adjustsFontSizeToFit>
        {destination.city}
      </Text>
      {!compact && (
        <Text style={styles.themedSub}>
          {country} · {plural(destination.landings, 'landing')}
        </Text>
      )}
      <View style={styles.themedBottom}>
        <View style={styles.chips}>
          {destination.codes.map((code) => (
            <View key={code} style={styles.chip}>
              <Text style={styles.chipText}>{code}</Text>
            </View>
          ))}
        </View>
        <View style={styles.themedStat}>
          <Text style={styles.themedStatValue}>{destination.landings}</Text>
          <Text style={styles.themedStatLabel}>{destination.landings === 1 ? 'landing' : 'landings'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** The most-flown airline in its own colour, read off its mark. Until the
 * colour is read (or when it can't be), the brand navy with the tint. */
export function AirlineCard({
  airline,
  totalFlights,
  otherAirlines,
  label = 'Most flown airline',
  compact = false,
  onPress,
}: {
  airline: AirlineRank;
  totalFlights: number;
  otherAirlines: number;
  label?: string;
  compact?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  // The name first, as the logo chip does: a hand-entered trip may carry
  // the airline without a flight number.
  const code = carrierCodeForName(airline.carrier) ?? airlineCode(airline.number);
  const tint = useLogoTint(code);
  const gradient = tint
    ? `linear-gradient(135deg, ${tint.base} 0%, ${tint.base} 45%, ${tint.light} 100%)`
    : `linear-gradient(135deg, #0C1B36 0%, #1C3459 55%, ${theme.tint} 100%)`;
  const share = totalFlights ? airline.flights / totalFlights : 0;
  const sub = [
    plural(airline.flights, 'flight'),
    compact ? `${Math.round(airline.km).toLocaleString()} km` : null,
    airline.rating != null ? `${formatStars(airline.rating)}${compact ? '' : ' from you'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${airline.carrier}, ${sub}. ${Math.round(share * 100)} percent of your flights.`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.themed,
        compact && styles.themedCompact,
        { experimental_backgroundImage: gradient, opacity: pressed ? 0.92 : 1 },
      ]}>
      <Text style={styles.themedMicro}>{label}</Text>
      <View style={styles.airlineTop}>
        <AirlineLogo number={airline.number} carrier={airline.carrier} size={52} />
        <View style={styles.grow}>
          <Text style={[styles.themedName, styles.airlineName, compact && styles.themedNameCompact]} numberOfLines={1} adjustsFontSizeToFit>
            {airline.carrier}
          </Text>
          <Text style={styles.themedSub}>{sub}</Text>
        </View>
      </View>
      {!compact && (
        <View style={styles.share}>
          <View style={styles.shareBar}>
            <View style={[styles.shareFill, { width: `${Math.max(3, Math.round(share * 100))}%` }]} />
          </View>
          <Text style={styles.shareText}>
            {Math.round(share * 100)}% of your flights
            {otherAirlines > 0 ? ` · ${plural(otherAirlines, 'other airline')}` : ''}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** The colours the makers paint themselves: Boeing's and Airbus's blues,
 * Embraer's, ATR's red. Anyone else wears the brand navy. */
export const MAKER_COLOURS: Record<string, { base: string; light: string }> = {
  Boeing: { base: '#0A2E7A', light: '#1D5AD6' },
  Airbus: { base: '#00205B', light: '#0A7CA5' },
  Embraer: { base: '#0B3D6E', light: '#1C7CB8' },
  ATR: { base: '#7A1024', light: '#D9203B' },
  Bombardier: { base: '#0F2F5C', light: '#2C6BB8' },
  'De Havilland': { base: '#1A3A2A', light: '#2F8A5C' },
};

export function makerColours(maker: string, fallbackTint: string): { base: string; light: string } {
  return MAKER_COLOURS[maker] ?? { base: '#0C1B36', light: fallbackTint };
}

/** The most-flown aircraft type in its maker's colours, with the makers'
 * shares as chips: what the traveller has actually sat in. */
export function AircraftCard({
  type,
  makers,
  totalFlights,
  label = 'Most flown aircraft',
  compact = false,
  onPress,
}: {
  type: AircraftRank;
  makers: MakerRank[];
  /** Flights with a known aircraft — the share's denominator. */
  totalFlights: number;
  label?: string;
  compact?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const colours = makerColours(type.maker, theme.tint);
  const gradient = `linear-gradient(135deg, ${colours.base} 0%, ${colours.base} 45%, ${colours.light} 100%)`;
  const share = totalFlights ? type.flights / totalFlights : 0;
  const sub = [
    plural(type.flights, 'flight'),
    type.airframes > 1 ? `${type.airframes} different aircraft` : null,
    compact ? `${Math.round(type.km).toLocaleString()} km` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${type.model}, ${sub}. ${Math.round(share * 100)} percent of your flights with a known aircraft.`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.themed,
        compact && styles.themedCompact,
        { experimental_backgroundImage: gradient, opacity: pressed ? 0.92 : 1 },
      ]}>
      <View style={styles.planeWatermark} accessible={false}>
        <SymbolView
          name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
          size={compact ? 92 : 124}
          tintColor="rgba(255,255,255,0.14)"
          style={PLANE_WATERMARK_TILT}
        />
      </View>
      <Text style={styles.themedMicro}>{label}</Text>
      <Text style={[styles.themedName, compact && styles.themedNameCompact]} numberOfLines={1} adjustsFontSizeToFit>
        {type.model}
      </Text>
      <Text style={styles.themedSub}>{sub}</Text>
      {!compact && (
        <View style={styles.themedBottom}>
          <View style={styles.chips}>
            {makers.map((maker) => (
              <View key={maker.maker} style={styles.chip}>
                <Text style={styles.chipText}>
                  {maker.maker} {maker.flights}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.themedStat}>
            <Text style={styles.themedStatValue}>{Math.round(share * 100)}%</Text>
            <Text style={styles.themedStatLabel}>of flights</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** A flight in one of the stats lists: the same card My travels draws
 * (components/trip-row), so a trip looks the same wherever it is listed.
 * The meta line's right slot, where the journal keeps its countdown, takes
 * what the list ranks by — "#2 · 9,275 km", a registration. */
export function FlightRow({
  row,
  now,
  badge,
  onPress,
}: {
  row: JourneyRow;
  now: Date;
  badge?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <TripRow
        trip={row}
        now={now}
        badge={
          badge ? (
            <ThemedText type="smallBold" themeColor="heading">
              {badge}
            </ThemedText>
          ) : undefined
        }
      />
    </Pressable>
  );
}

/** One small fact: label, value, caption. */
export function MiniTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <SheenCard style={styles.mini}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
        {label}
      </ThemedText>
      <ThemedText type="subtitle" themeColor="heading" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
      {caption && (
        <ThemedText type="small" themeColor="textSecondary">
          {caption}
        </ThemedText>
      )}
    </SheenCard>
  );
}

/** A list screen's opening line: the count large, the rest small. */
export function ListHeadline({ headline, detail }: { headline: string; detail?: string }) {
  return (
    <View style={styles.headline}>
      <ThemedText type="title" themeColor="heading">
        {headline}
      </ThemedText>
      {detail && (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      )}
    </View>
  );
}

/** A ranked row: number, a leading mark, the body, a right-aligned value. */
export function RankRow({
  rank,
  lead,
  children,
  value,
  caption,
  last,
}: {
  rank?: number;
  lead: ReactNode;
  children: ReactNode;
  value: string;
  caption?: string;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, !last && { borderBottomColor: theme.hairline, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      {rank != null && (
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.rank}>
          {rank}
        </ThemedText>
      )}
      {lead}
      <View style={styles.rowBody}>{children}</View>
      <View style={styles.rowValue}>
        <ThemedText type="smallBold" themeColor="heading">
          {value}
        </ThemedText>
        {caption && (
          <ThemedText type="small" themeColor="textSecondary">
            {caption}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

/** Airport codes as small chips; `strong` marks one (the home base). */
export function CodeChips({ codes, strong }: { codes: string[]; strong?: string | null }) {
  const theme = useTheme();
  return (
    <View style={styles.codeChips}>
      {codes.map((code) => {
        const on = code === strong;
        return (
          <View
            key={code}
            style={[
              styles.codeChip,
              { backgroundColor: on ? theme.heading : theme.backgroundSelected, borderColor: on ? theme.heading : theme.hairline },
            ]}>
            <Text style={[styles.codeChipText, { color: on ? theme.background : theme.heading }]}>{code}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  spaced: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  grow: {
    flex: 1,
    minWidth: 0,
  },
  caps: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  hero: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
    shadowColor: '#0B1520',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  heroMicro: {
    color: WHITE_DIM,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  heroBig: {
    color: WHITE,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: 800,
    letterSpacing: -1,
  },
  heroUnit: {
    color: WHITE_DIM,
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: 0,
  },
  orbit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  orbitText: {
    color: 'rgba(242,246,251,0.8)',
    fontSize: 13,
  },
  orbitBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: WHITE_FAINT,
    overflow: 'hidden',
  },
  orbitFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: COBALT,
  },
  heroGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: WHITE_FAINT,
    paddingTop: Spacing.three,
    marginTop: Spacing.one,
  },
  heroStat: {
    flex: 1,
    gap: 2,
  },
  heroStatValue: {
    color: WHITE,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: 700,
  },
  heroStatLabel: {
    color: WHITE_DIM,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  sectionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  record: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  recordTags: {
    position: 'absolute',
    top: Spacing.three,
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tag: {
    borderRadius: Spacing.two,
    paddingVertical: 4,
    paddingHorizontal: Spacing.two,
  },
  tagText: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  recordBody: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  recordFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  themed: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    minHeight: 150,
    overflow: 'hidden',
    gap: Spacing.one,
    shadowColor: '#0B1520',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  themedCompact: {
    minHeight: 0,
    paddingVertical: Spacing.three,
  },
  themedMicro: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  themedName: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: 800,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  themedNameCompact: {
    fontSize: 26,
    lineHeight: 30,
  },
  themedSub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    lineHeight: 18,
  },
  themedBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: 4,
    paddingHorizontal: Spacing.two,
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: 700,
  },
  themedStat: {
    alignItems: 'flex-end',
  },
  themedStatValue: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: 800,
  },
  themedStatLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  planeWatermark: {
    position: 'absolute',
    right: -10,
    top: -6,
  },
  flagWatermark: {
    position: 'absolute',
    right: -6,
    top: -14,
    fontSize: 116,
    lineHeight: 130,
    opacity: 0.3,
  },
  flagWatermarkCompact: {
    fontSize: 88,
    lineHeight: 100,
    top: -10,
  },
  airlineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  airlineName: {
    fontSize: 26,
    lineHeight: 30,
    marginTop: 0,
  },
  share: {
    marginTop: Spacing.two,
    gap: 6,
  },
  shareBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  shareFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  shareText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    lineHeight: 16,
  },
  mini: {
    flex: 1,
    gap: Spacing.half,
  },
  headline: {
    gap: 2,
    paddingHorizontal: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  rank: {
    width: 18,
    textAlign: 'right',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowValue: {
    alignItems: 'flex-end',
    gap: 1,
  },
  codeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4,
  },
  codeChip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  codeChipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
  },
});
