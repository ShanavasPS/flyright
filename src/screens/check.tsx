import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/card';
import { ExternalLink } from '@/components/external-link';
import { SiteChrome } from '@/components/site-chrome';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DEMO_DISRUPTION, DEMO_JOURNEY } from '@/constants/demo-journey';
import { STORE_URLS } from '@/constants/store-links';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/rules/engine';
import type { Disruption, Journey } from '@/rules/types';
import { getAirport } from '@/services/airports';
import { formatDayLabel, localDateString } from '@/services/dates';
import {
  FlightLookupError,
  lookupFlight,
  normalizeFlightNumber,
  type FlightStatus,
} from '@/services/flight-lookup';
import { haversineKm } from '@/services/geo';

/** The web funnel's landing: flight number + date in, EU261/UK261 verdict out.
 * Runs entirely on public surfaces (the /api/flight-status proxy and the pure
 * rules engine), so it works signed-out — the Pro CTA is where identity starts. */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A checked flight becomes a rules-engine Journey; airport-dataset fallbacks
 * fill whatever the status provider omitted (country, distance). */
function toJourney(flight: FlightStatus): Journey {
  const from = flight.from.code ? getAirport(flight.from.code) : null;
  const to = flight.to.code ? getAirport(flight.to.code) : null;
  const distanceKm =
    flight.distanceKm ??
    (from && to ? haversineKm(from.lat, from.lon, to.lat, to.lon) : 0);

  return {
    id: `check-${flight.flight}-${flight.date}`,
    mode: 'flight',
    carrier: flight.carrier.name,
    carrierCountry: flight.carrierCountry,
    number: flight.flight,
    from: { code: flight.from.code ?? '', country: flight.from.country ?? from?.country ?? '' },
    to: { code: flight.to.code ?? '', country: flight.to.country ?? to?.country ?? '' },
    distanceKm,
    scheduledDeparture: flight.scheduledDeparture ?? `${flight.date}T00:00:00Z`,
    scheduledArrival: flight.scheduledArrival ?? `${flight.date}T00:00:00Z`,
  };
}

export function CheckFlight() {
  const theme = useTheme();
  const [today] = useState(() => new Date());
  const [flightInput, setFlightInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  // The submitted pair drives the lookup; edits after submit don't refetch
  // until the button is pressed again.
  const [checked, setChecked] = useState<{ flight: string; date: string } | null>(null);
  const [demo, setDemo] = useState(false);

  const flightNumber = normalizeFlightNumber(flightInput);
  const date = DATE_PATTERN.test(dateInput.trim()) ? dateInput.trim() : null;

  const lookup = useQuery({
    queryKey: ['flight-status', checked?.flight, checked?.date],
    queryFn: () => lookupFlight(checked!.flight, checked!.date),
    enabled: !!checked,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const check = () => {
    if (!flightNumber || !date) return;
    setDemo(false);
    setChecked({ flight: flightNumber, date });
  };

  const quickDates = [
    { label: 'Today', day: localDateString(today) },
    { label: 'Yesterday', day: localDateString(today, -1) },
  ];

  return (
    <SiteChrome>
      <ThemedView style={styles.page}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            <View style={styles.hero}>
              <ThemedText type="title" themeColor="heading">
                Flight delayed or cancelled?
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                Airlines owe up to €600 per passenger under EU261 — and most people never
                claim it. Check your flight in ten seconds.
              </ThemedText>
            </View>

            <Card>
              <ThemedText type="smallBold">Your flight</ThemedText>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                value={flightInput}
                onChangeText={setFlightInput}
                placeholder="AY1331 or LH873"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              />
              <ThemedText type="smallBold">Departure date</ThemedText>
              <View style={styles.dateRow}>
                {quickDates.map(({ label, day }) => (
                  <Pressable key={label} onPress={() => setDateInput(day)}>
                    <ThemedView
                      type={dateInput === day ? 'backgroundSelected' : 'background'}
                      style={styles.chip}>
                      <ThemedText type="smallBold" themeColor={dateInput === day ? 'tint' : 'text'}>
                        {label} · {formatDayLabel(day)}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                ))}
              </View>
              <TextInput
                autoCorrect={false}
                value={dateInput}
                onChangeText={setDateInput}
                placeholder={`Or type a date · ${localDateString(today, -3)}`}
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              />
              <PrimaryButton
                label="Check my compensation →"
                disabled={!flightNumber || !date}
                onPress={check}
              />
              <Pressable onPress={() => setDemo(true)} hitSlop={Spacing.two}>
                <ThemedText type="link">No flight handy? See an example verdict →</ThemedText>
              </Pressable>
            </Card>

            {demo && (
              <VerdictBlock
                journey={DEMO_JOURNEY}
                disruption={DEMO_DISRUPTION}
                exampleNote={`Example: ${DEMO_JOURNEY.carrier} ${DEMO_JOURNEY.number} ${DEMO_JOURNEY.from.code} → ${DEMO_JOURNEY.to.code}, landed 3 h 15 m late`}
              />
            )}

            {!demo && checked && <LookupResult lookup={lookup} />}

            <View style={styles.footer}>
              <ThemedText type="small" themeColor="textSecondary">
                Verdicts follow EU Regulation 261/2004 and its UK equivalent: delays of 3+
                hours, cancellations, and denied boarding on covered routes. FlyRight is not
                a law firm — it writes the claim, the airline pays you directly.
              </ThemedText>
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    </SiteChrome>
  );
}

function LookupResult({ lookup }: { lookup: ReturnType<typeof useQuery<FlightStatus>> }) {
  const theme = useTheme();

  if (lookup.isPending) {
    return (
      <Card style={styles.centeredCard}>
        <ActivityIndicator />
        <ThemedText type="small" themeColor="textSecondary">
          Checking your flight…
        </ThemedText>
      </Card>
    );
  }

  if (lookup.isError) {
    return (
      <Card>
        <ThemedText type="smallBold">
          {lookup.error instanceof FlightLookupError
            ? lookup.error.message
            : 'Flight lookup failed — try again.'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Airlines owe compensation for up to 2–6 years back, but flight-status providers
          forget sooner. The FlyRight app can still build your claim from the ticket details.
        </ThemedText>
        <GetTheApp />
      </Card>
    );
  }

  const flight = lookup.data;
  const cancelled = flight.status.toLowerCase().includes('cancel');

  if (cancelled) {
    return (
      <Card>
        <ThemedText type="subtitle" themeColor="heading">
          This flight was cancelled
        </ThemedText>
        <ThemedText type="small">
          Cancelled flights are owed €250–600 unless the airline warned you 14+ days ahead
          or rebooked you promptly. FlyRight asks the three questions that decide it, then
          writes the claim for you.
        </ThemedText>
        <ProCta />
      </Card>
    );
  }

  // A zero delay only means "arrived on time" once the flight has landed;
  // before that it's a prediction for a flight that hasn't flown.
  if (flight.delayMinutes == null || (!flight.landed && flight.delayMinutes <= 0)) {
    return (
      <Card>
        <ThemedText type="subtitle" themeColor="heading">
          No arrival data yet
        </ThemedText>
        <ThemedText type="small">
          {flight.carrier.name} {flight.flight} hasn&apos;t landed (or the provider has no
          delay data for it). Add it in the FlyRight app and we&apos;ll watch it — if a
          delay makes you money, you&apos;ll get a push the moment it does.
        </ThemedText>
        <GetTheApp />
      </Card>
    );
  }

  if (flight.delayMinutes <= 0) {
    return (
      <Card>
        <ThemedText type="subtitle" style={{ color: theme.success }}>
          On time — nothing owed
        </ThemedText>
        <ThemedText type="small">
          {flight.carrier.name} {flight.flight} arrived on schedule. Keep FlyRight watching
          your future flights so the one that pays doesn&apos;t slip past.
        </ThemedText>
        <GetTheApp />
      </Card>
    );
  }

  return (
    <VerdictBlock
      journey={toJourney(flight)}
      disruption={{ type: 'delay', delayMinutes: flight.delayMinutes }}
    />
  );
}

function VerdictBlock({
  journey,
  disruption,
  exampleNote,
}: {
  journey: Journey;
  disruption: Disruption;
  exampleNote?: string;
}) {
  const theme = useTheme();
  const verdict = evaluate(journey, disruption);

  if (!verdict.eligible || !verdict.compensation) {
    return (
      <Card>
        <ThemedText type="subtitle" themeColor="heading">
          No compensation due
        </ThemedText>
        <ThemedText type="small">{verdict.reason}</ThemedText>
        <GetTheApp />
      </Card>
    );
  }

  return (
    <Card>
      {exampleNote && (
        <ThemedText type="small" themeColor="textSecondary">
          {exampleNote}
        </ThemedText>
      )}
      <ThemedText type="display" style={{ color: theme.success }}>
        You&apos;re owed {verdict.compensation.amount} {verdict.compensation.currency}
      </ThemedText>
      <ThemedText type="small">{verdict.reason}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Regulation: {verdict.regulation}
      </ThemedText>
      <ProCta />
    </Card>
  );
}

/** The funnel's money step: Pro checkout first, free app second. */
function ProCta() {
  const router = useRouter();
  return (
    <View style={styles.ctaBlock}>
      <PrimaryButton
        label="Claim it with FlyRight Pro →"
        onPress={() => router.push('/go-pro')}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Pro writes the airline-ready claim letter and tracks the six-week response
        deadline. Or start free in the app:
      </ThemedText>
      <StoreLinks />
    </View>
  );
}

function GetTheApp() {
  return (
    <View style={styles.ctaBlock}>
      <ThemedText type="smallBold">Get the free app</ThemedText>
      <StoreLinks />
    </View>
  );
}

function StoreLinks() {
  return (
    <View style={styles.storeRow}>
      <ExternalLink href={STORE_URLS.ios}>
        <ThemedText type="link">App Store →</ThemedText>
      </ExternalLink>
      <ExternalLink href={STORE_URLS.android}>
        <ThemedText type="link">Google Play →</ThemedText>
      </ExternalLink>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  scroll: {
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
  },
  hero: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  chip: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  centeredCard: {
    alignItems: 'center',
  },
  ctaBlock: {
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  storeRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  footer: {
    paddingBottom: Spacing.five,
  },
});
