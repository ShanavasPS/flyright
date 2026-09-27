/** A destination: every trip to a city, all time, under its photo; a home
 * city also shows the move into it and the trips from it
 * (docs/trip-covers.md). Opened by tapping a trip's header on Flights. */
import { useAuth } from '@clerk/expo';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CollapsingHero, useCollapsingHero } from '@/components/home-base';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePlacePhoto } from '@/components/trip-cover';
import { TripGroupFrame, TripGroupHeading, TripStayMark } from '@/components/trip-group-mark';
import { TripRow } from '@/components/trip-row';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useHomeContext } from '@/hooks/use-home-base';
import { countryName } from '@/services/airports';
import { localDateString } from '@/services/dates';
import { destinationOf, groupFlights, tripDestination } from '@/services/destination';
import { samePlace } from '@/services/home-base';
import { useJourneys } from '@/services/journeys';
import { buildTripGroups, tripGroupDates, type TripGroup } from '@/services/trip-groups';

const monthYear = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "1 yr 2 mo" / "8 months" since a day. */
function livingFor(since: string, today: string): string {
  const [y1, m1] = since.split('-').map(Number) as [number, number];
  const [y2, m2] = today.split('-').map(Number) as [number, number];
  const months = Math.max(0, (y2 - y1) * 12 + (m2 - m1));
  if (months < 12) return plural(Math.max(1, months), 'month');
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} yr ${rest} mo` : plural(years, 'year');
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="subtitle" themeColor="heading" numberOfLines={1} adjustsFontSizeToFit>{value}</ThemedText>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

/** One trip drawn the way Flights draws it: the frame and its header band,
 * the flight cards, the stay between them. `title` and `detail` fill the
 * band; `flag` is the country it carries. */
function TripGroupBlock({ group, title, detail, flag, now }: { group: TripGroup; title: string; detail: string; flag: string; now: Date }) {
  const entries = group.entries;
  return (
    <View testID={`destination-trip-${group.id}`}>
      <TripGroupFrame header country={flag}>
        <TripGroupHeading group={{ ...group, title }} dates={detail} />
      </TripGroupFrame>
      {entries.map((entry, i) => {
        const first = i === 0;
        const last = i === entries.length - 1;
        if (entry.kind === 'stay') {
          return (
            <TripGroupFrame key={entry.key} first={first} last={last}>
              <TripStayMark stay={entry.stay} />
            </TripGroupFrame>
          );
        }
        const row = entry.journey;
        return (
          <TripGroupFrame key={entry.key} first={first} last={last}>
            <Link href={{ pathname: '/journey/[id]', params: { id: row.id, from: row.fromCode, to: row.toCode } }} asChild>
              <Pressable style={({ pressed }) => pressed && styles.pressed}>
                <TripRow trip={row} now={now} />
              </Pressable>
            </Link>
          </TripGroupFrame>
        );
      })}
    </View>
  );
}

export function Destination() {
  const { userId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ city?: string; country?: string; group?: string }>();
  const place = useMemo(() => ({ city: params.city ?? '', country: params.country ?? '' }), [params.city, params.country]);
  const { data: journeys } = useJourneys(userId);
  const rows = useMemo(() => journeys ?? [], [journeys]);
  const home = useHomeContext(userId, rows);
  const trips = useMemo(() => buildTripGroups(rows, home.homeAt), [rows, home.homeAt]);
  const dest = useMemo(() => destinationOf(trips, place), [trips, place]);
  const photo = usePlacePhoto(place);
  const today = localDateString(new Date());
  const [now] = useState(() => new Date());
  const hero = useCollapsingHero(280);
  const year = now.getFullYear();

  // A home city: today's home, or a home the traveller had.
  const periods = home.state.periods.filter((p) => samePlace(p, place));
  const current = home.current && samePlace(home.current, place) ? home.current : null;
  const isHome = !!current || periods.length > 0;
  const nowPeriod = periods.find((p) => (p.from ?? '') <= today && (p.until ?? '9999') >= today);
  const since = nowPeriod?.from ?? dest.moves[0]?.start.iso.slice(0, 10) ?? null;
  const livedUntil = !current && periods.length ? periods[periods.length - 1]!.until : null;

  const cityJourneys = dest.trips.flatMap((g) => groupFlights(g).map((f) => f.id));
  const fromGroup = params.group ? trips.flatMap((t) => t.groups).find((g) => g.id === params.group) : undefined;
  const changePhoto = () => router.push({
    pathname: '/trip-photo',
    params: {
      city: place.city,
      country: place.country,
      title: place.city,
      cityJourneys: cityJourneys.join(','),
      ...(fromGroup ? {
        group: fromGroup.id,
        groupLabel: tripGroupDates(fromGroup, year),
        journeys: groupFlights(fromGroup).map((f) => f.id).join(','),
      } : {}),
    },
  });

  const country = place.country ? countryName(place.country) : '';
  const subtitle = isHome
    ? [country, current ? (since ? `home since ${monthYear(since)}` : 'your home base') : livedUntil ? `your home until ${monthYear(livedUntil)}` : 'a former home'].filter(Boolean).join(' · ')
    : [country, dest.totals.trips ? `${plural(dest.totals.trips, 'trip')}${dest.totals.first ? ` since ${monthYear(dest.totals.first)}` : ''}` : ''].filter(Boolean).join(' · ');
  const countriesFromHere = new Set(dest.from.map((g) => tripDestination(g).place.country).filter(Boolean)).size;

  // Visits lead unless this is where the traveller lives now; a count of
  // nothing is left out rather than shown as 0.
  const visitStats = [
    { value: String(dest.totals.trips), label: dest.totals.trips === 1 ? 'VISIT' : 'VISITS', n: dest.totals.trips },
    { value: String(dest.totals.days), label: 'DAYS THERE', n: dest.totals.days },
    { value: String(dest.totals.flights), label: dest.totals.flights === 1 ? 'FLIGHT' : 'FLIGHTS', n: dest.totals.flights },
    { value: dest.totals.first ? dest.totals.first.slice(0, 4) : '', label: 'FIRST VISIT', n: dest.totals.first ? 1 : 0 },
  ];
  const homeStats = [
    { value: String(dest.from.length), label: dest.from.length === 1 ? 'TRIP FROM HERE' : 'TRIPS FROM HERE', n: dest.from.length },
    { value: String(countriesFromHere), label: countriesFromHere === 1 ? 'COUNTRY' : 'COUNTRIES', n: countriesFromHere },
  ];
  const stats = (isHome
    ? current
      ? [...homeStats, ...(since ? [{ value: livingFor(since, today), label: 'LIVING HERE', n: 1 }] : []), ...visitStats.slice(0, 1)]
      : [...visitStats, ...homeStats]
    : [
      { value: String(dest.totals.trips), label: dest.totals.trips === 1 ? 'TRIP' : 'TRIPS', n: 1 },
      { value: String(dest.totals.days), label: 'DAYS THERE', n: 1 },
      { value: String(dest.totals.flights), label: 'FLIGHTS', n: 1 },
      { value: dest.totals.first ? dest.totals.first.slice(0, 4) : '—', label: 'FIRST VISIT', n: 1 },
    ]).filter((st) => st.n > 0).slice(0, 4);

  const stayDays = (g: TripGroup) => g.entries.reduce((n, e) => n + (e.kind === 'stay' ? e.stay.days : 0), 0);
  const fromSection = isHome && dest.from.length > 0 && (
    <>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>Trips from {place.city}</ThemedText>
      {dest.from.map((g) => (
        <TripGroupBlock
          key={g.id}
          group={g}
          title={g.title}
          detail={tripGroupDates(g, year)}
          flag={tripDestination(g).place.country}
          now={now}
        />
      ))}
    </>
  );
  const toSection = dest.trips.length > 0 && (
    <>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
        Trips to {place.city}
      </ThemedText>
      {dest.trips.map((g) => {
        const from = tripDestination(g).from;
        const days = stayDays(g);
        return (
          <TripGroupBlock
            key={g.id}
            group={g}
            title={tripGroupDates(g, year)}
            detail={[from?.city ? `from ${from.city}` : '', days ? plural(days, 'day') : ''].filter(Boolean).join(' · ')}
            flag={from?.country ?? place.country}
            now={now}
          />
        );
      })}
    </>
  );

  return (
    <ThemedView style={styles.container}>
      <Animated.ScrollView
        onScroll={hero.onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.scroll, { paddingTop: hero.full }]} testID="destination-screen">
        {/* Nothing below the photo until the journal has loaded: an empty
            page would flash zeros and "No trips here yet". */}
        {journeys !== undefined && <View style={styles.content}>
          <View style={styles.stats}>
            {stats.map((st) => <Stat key={st.label} value={st.value} label={st.label} />)}
          </View>

          {dest.moves.map((g) => {
            const { from } = tripDestination(g);
            return (
              <TripGroupBlock
                key={g.id}
                group={g}
                title={`Moved from ${from?.city ?? 'your old home'}`}
                detail={tripGroupDates(g, year)}
                flag={from?.country ?? place.country}
                now={now}
              />
            );
          })}

          {/* Where the traveller lives now: trips from it first. A former home
              reads as a place visited, then the trips it once started. */}
          {current ? <>{fromSection}{toSection}</> : <>{toSection}{fromSection}</>}

          {!dest.trips.length && !dest.from.length && !dest.moves.length && (
            <ThemedText type="small" themeColor="textSecondary">No trips here yet.</ThemedText>
          )}
        </View>}
      </Animated.ScrollView>
      <CollapsingHero
        hero={hero}
        place={place}
        photo={photo}
        eyebrow={current ? 'Home' : isHome ? 'Former home' : 'Your trips to'}
        title={place.city}
        subtitle={subtitle}
        onChangePhoto={changePhoto}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: Spacing.six + BottomTabInset },
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, minWidth: 0 },
  statLabel: { fontSize: 11, lineHeight: 14, letterSpacing: 1 },
  // The same as Flights' section headers ("2026", "Upcoming").
  caps: { fontSize: 13, lineHeight: 18, textTransform: 'uppercase', letterSpacing: 1 },
  pressed: { opacity: 0.7 },
});
