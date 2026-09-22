import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { explainAmount, recentFlights } from '@/services/claim-explain';
import type { SummaryItem } from '@/services/claim-status';
import type { ClaimWithJourney } from '@/services/claims';
import { useDisruption, useDisruptions } from '@/services/disruptions';
import { toDomainJourney, useJourneys } from '@/services/journeys';

/**
 * What a wide window's Claims tab shows beside or over its claims
 * (docs/wide-layouts-plan.md §6): the figures over the list, how a claim
 * works, and what EU261 pays. Static apart from the figures; the phone
 * layout does not use them.
 */

export function ClaimsSummaryCard({ items }: { items: SummaryItem[] }) {
  const theme = useTheme();
  if (!items.length) return null;
  return (
    <Card style={styles.summary}>
      {items.map((item) => (
        <View key={item.label} style={styles.summaryItem}>
          <ThemedText
            type="subtitle"
            style={[styles.summaryValue, { color: item.money ? theme.success : theme.heading }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}>
            {item.value}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {item.label}
          </ThemedText>
        </View>
      ))}
    </Card>
  );
}

const STEPS: [string, string][] = [
  ['Add your flights', 'By hand, or import a booking PDF.'],
  [
    'FlyRight checks each one',
    'Delayed 3 h+, cancelled late or denied boarding: it works out what EU261 or UK261 owes.',
  ],
  ['You send the claim', 'FlyRight writes it; you send it and log the airline’s reply here.'],
];

export function HowClaimsWork() {
  const theme = useTheme();
  return (
    <View style={styles.block}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
        How a claim works
      </ThemedText>
      {STEPS.map(([title, detail], i) => (
        <View key={title} style={[styles.step, i > 0 && { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={[styles.stepNumber, { borderColor: theme.tint }]}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              {i + 1}
            </ThemedText>
          </View>
          <View style={styles.stepCopy}>
            <ThemedText type="smallBold">{title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {detail}
            </ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Article 7 of Regulation (EC) 261/2004, per passenger. The middle band
 * covers intra-EU flights over 1,500 km too — Art. 7(1)(b) caps those at
 * €400 however far they go. */
const BANDS: [string, string, string][] = [
  ['Up to 1,500 km', 'e.g. Helsinki → Berlin', '€250'],
  ['1,500–3,500 km, and flights within the EU over 1,500 km', 'e.g. Helsinki → London', '€400'],
  ['Over 3,500 km', 'e.g. Helsinki → New York', '€600'],
];

export function Eu261Bands() {
  const theme = useTheme();
  return (
    <Card>
      <View style={styles.bandsHead}>
        <ThemedText type="smallBold" themeColor="heading" style={styles.bandsTitle}>
          What EU261 pays
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          per passenger
        </ThemedText>
      </View>
      {BANDS.map(([distance, example, amount], i) => (
        <View key={amount} style={[styles.band, i > 0 && { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.stepCopy}>
            <ThemedText type="smallBold">{distance}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {example}
            </ThemedText>
          </View>
          <ThemedText type="subtitle" themeColor="heading" style={styles.bandAmount}>
            {amount}
          </ThemedText>
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        For arrivals 3 h+ late, or cancellations with under 14 days’ notice. On flights over
        3,500 km, airlines may pay half when the arrival is 3–4 h late. UK261 pays £220, £350
        and £520.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  summaryItem: {
    flexShrink: 1,
  },
  summaryValue: {
    fontSize: 22,
    lineHeight: 28,
  },
  block: {
    gap: Spacing.two,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  bandsHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  bandsTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  whyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  whyReason: {
    maxWidth: '50%',
    textAlign: 'right',
  },
  statusChip: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  statusText: {
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  bandAmount: {
    fontSize: 22,
    lineHeight: 28,
  },
});

/** "Why €400": the facts behind a claim's amount — distance and its band,
 * the recorded arrival delay (or that none was recorded), and why the
 * regulation covers the route (services/claim-explain). */
export function WhyAmountCard({ row }: { row: ClaimWithJourney }) {
  const theme = useTheme();
  const { claims: claim, journeys: journey } = row;
  const disruption = useDisruption(journey.id);
  const rows = explainAmount({
    regulation: claim.regulation,
    distanceKm: journey.distanceKm,
    fromCountry: journey.fromCountry,
    toCountry: journey.toCountry,
    carrierCountry: journey.carrierCountry,
    delayMinutes: disruption?.delayMinutes ?? null,
  });
  if (!rows.length) return null;
  const symbol = claim.currency === 'GBP' ? '£' : claim.currency === 'EUR' ? '€' : '';
  return (
    <Card>
      <ThemedText type="smallBold" themeColor="heading" style={styles.bandsTitle}>
        Why {symbol ? `${symbol}${claim.amount}` : `${claim.amount} ${claim.currency}`}
      </ThemedText>
      {rows.map((r, i) => (
        <View
          key={r.label}
          style={[styles.whyRow, i > 0 && { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.stepCopy}>
            <ThemedText type="small" themeColor="textSecondary">
              {r.label}
            </ThemedText>
            <ThemedText type="smallBold">{r.value}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.whyReason}>
            {r.why}
          </ThemedText>
        </View>
      ))}
    </Card>
  );
}

/** "Recent flights": the latest flown trips with what the app knows about
 * their arrival — the recorded delay, money owed, or "Not checked" for one it
 * never saw land. Rows open the trip. Nothing when there is no flown trip. */
export function RecentFlightsCard({ claimedJourneyIds }: { claimedJourneyIds: ReadonlySet<string> }) {
  const theme = useTheme();
  const router = useRouter();
  const { userId } = useAuth();
  const { data: journeys } = useJourneys(userId);
  const { data: disruptionRows } = useDisruptions();
  const [now] = useState(() => Date.now());
  const flights = useMemo(() => {
    const delays = new Map<string, number>();
    for (const d of disruptionRows ?? []) if (d.delayMinutes != null) delays.set(d.journeyId, d.delayMinutes);
    return recentFlights(
      (journeys ?? []).map((row) => ({
        id: row.id,
        journey: toDomainJourney(row),
        scheduledArrival: row.scheduledArrival,
        delayMinutes: delays.get(row.id) ?? null,
      })),
      claimedJourneyIds,
      now,
    );
  }, [journeys, disruptionRows, claimedJourneyIds, now]);
  if (!flights.length) return null;
  return (
    <View style={styles.block}>
      <View style={styles.bandsHead}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
          Recent flights
        </ThemedText>
      </View>
      {flights.map((f, i) => (
        <Pressable
          key={f.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/journey/[id]', params: { id: f.id } })}
          style={({ pressed }) => [
            styles.band,
            i > 0 && { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth },
            pressed && styles.pressed,
          ]}>
          <View style={styles.stepCopy}>
            <ThemedText type="smallBold">{f.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {f.route}
              {f.claimed ? ' · claim above' : ''}
            </ThemedText>
          </View>
          <View style={[styles.statusChip, { backgroundColor: `${f.owed ? theme.success : theme.textSecondary}22` }]}>
            <ThemedText type="smallBold" style={[styles.statusText, { color: f.owed ? theme.success : theme.textSecondary }]}>
              {f.owed ?? f.status}
            </ThemedText>
          </View>
        </Pressable>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        Under 3 hours late pays nothing under EU261. Flights the app never saw land read “Not checked”.
      </ThemedText>
    </View>
  );
}
