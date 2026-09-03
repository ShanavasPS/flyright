import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusChip, isOverdue, showOutcomeMenu, statusGuidance } from '@/components/claim-status';
import { HowRow } from '@/components/how-row';
import { MicroLabel, PassAction, PassCard, PassDivider } from '@/components/pass-card';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MiniContrail, WHITE, WHITE_DIM } from '@/components/travel-stats-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { NEXT_STATUSES, isClosed, parseSentSnapshot } from '@/services/claim-status';
import { useClaims, type ClaimWithJourney } from '@/services/claims';
import { formatDayLabelWithYear } from '@/services/dates';

// Payout green on the night sky — the same value the dark theme's `success`
// and the People tab's live ring use, so money reads as money on navy.
const PAYOUT_GREEN = '#2FD68C';

/** "400 EUR in progress · 1 closed" — the header eyebrow, My travels-style.
 * Open claims total up when they share a currency; otherwise just count. */
function claimsEyebrow(open: ClaimWithJourney[], closed: ClaimWithJourney[]): string {
  const parts: string[] = [];
  if (open.length) {
    const currency = open[0].claims.currency;
    const same = open.every((row) => row.claims.currency === currency);
    parts.push(
      same
        ? `${open.reduce((sum, row) => sum + row.claims.amount, 0)} ${currency} in progress`
        : `${open.length} in progress`,
    );
  }
  if (closed.length) parts.push(`${closed.length} closed`);
  return parts.join(' · ') || "What you're owed";
}

export function Claims() {
  const router = useRouter();
  const { userId } = useAuth();
  const { data: rows } = useClaims(userId);
  // Frozen at mount — overdue-ness doesn't need to tick while the tab is open.
  const [now] = useState(() => Date.now());

  const open = rows?.filter((row) => !isClosed(row.claims.status)) ?? [];
  const closed = rows?.filter((row) => isClosed(row.claims.status)) ?? [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.titleBlock}>
          <ThemedText
            type="smallBold"
            themeColor="textSecondary"
            style={styles.eyebrow}
            numberOfLines={1}>
            {claimsEyebrow(open, closed)}
          </ThemedText>
          <ThemedText type="title" themeColor="heading">
            Claims
          </ThemedText>
        </View>
        {rows?.length ? (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}>
            {open.length > 0 && <SectionLabel>In progress</SectionLabel>}
            {open.map((row, index) => (
              <ClaimCard key={row.claims.id} row={row} now={now} index={index} />
            ))}
            {closed.length > 0 && <SectionLabel>Closed</SectionLabel>}
            {closed.map((row, index) => (
              <ClaimCard key={row.claims.id} row={row} now={now} index={open.length + index} />
            ))}
          </ScrollView>
        ) : (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}>
            <ClaimsHero onDemo={() => router.push('/journey/demo')} />
            <HowItWorks />
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

/** The empty tab's hero, in the boarding-pass language of the other tabs, led
 * by the number that makes the pitch: up to €600 per passenger. The demo
 * journey exercises the whole verdict → claim flow without live data. */
function ClaimsHero({ onDemo }: { onDemo: () => void }) {
  return (
    <PassCard>
      <View style={styles.spacedRow}>
        <MicroLabel>Compensation</MicroLabel>
        <MiniContrail />
      </View>
      <View style={styles.amountRow}>
        <Text style={styles.amountLead}>up to</Text>
        <Text style={styles.amount}>€600</Text>
        <Text style={styles.amountLead}>per passenger</Text>
      </View>
      <View style={styles.heroCopy}>
        <Text style={styles.heroHeadline}>No claims yet</Text>
        <Text style={styles.heroPitch}>
          Three hours late, or cancelled? EU261 pays €250–600 per passenger (UK261 in pounds).
          When a flight in your journal qualifies, the claim starts here.
        </Text>
      </View>
      <PassDivider />
      <PassAction
        label="See a demo verdict"
        onPress={onDemo}
        icon={{ ios: 'doc.text.magnifyingglass', android: 'receipt_long', web: 'receipt_long' }}
      />
    </PassCard>
  );
}

/** Three beats of the pitch as icon rows instead of a paragraph. */
function HowItWorks() {
  return (
    <SheenCard style={styles.howCard}>
      <HowRow
        symbol={{
          ios: 'clock.badge.exclamationmark',
          android: 'schedule',
          web: 'schedule',
        }}
        title="We spot the delay"
        detail="Every flight in your journal is checked against the rules the moment it's disrupted."
      />
      <HowRow
        symbol={{ ios: 'doc.text', android: 'description', web: 'description' }}
        title="The letter writes itself"
        detail="Airline, flight, distance and the article that applies — ready to send in a tap."
      />
      <HowRow
        symbol={{ ios: 'calendar.badge.clock', android: 'event', web: 'event' }}
        title="We keep the airline honest"
        detail="Response deadlines, reminders and every outcome, tracked right here."
      />
    </SheenCard>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Animated.View layout={LinearTransition.springify().damping(18)}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
        {children}
      </ThemedText>
    </Animated.View>
  );
}

function ClaimCard({ row, now, index }: { row: ClaimWithJourney; now: number; index: number }) {
  const router = useRouter();
  const theme = useTheme();
  const { claims: claim, journeys: journey } = row;

  const overdue = isOverdue(claim, now);
  const recordable = NEXT_STATUSES[claim.status].length > 0;
  const hasSnapshot = !!parseSentSnapshot(claim.sentSnapshot);

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}
      layout={LinearTransition.springify().damping(18)}>
      <ThemedView type="backgroundElement" style={styles.card}>
        {/* Navigation and the record link stay SIBLINGS — an iOS Pressable
         * flattens its children into one a11y element and would swallow a
         * nested button (same trap as the timeline's Undo). */}
        {/* No explicit label: iOS flattens the children into one readable
         * a11y string ("Sent, EU261 · …, 400 EUR, …"), matching the journey
         * rows' convention — VoiceOver and Maestro both get the content. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/journey/[id]', params: { id: journey.id } })}
          style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}>
          <View style={styles.chipRow}>
            <StatusChip status={claim.status} overdue={overdue} />
            <ThemedText type="small" themeColor="textSecondary">
              {claim.regulation} · {formatDayLabelWithYear(journey.scheduledDeparture)}
            </ThemedText>
          </View>
          <ThemedText type="smallBold">
            {journey.carrier}
            {journey.number ? ` ${journey.number}` : ''} · {journey.fromCode} → {journey.toCode}
          </ThemedText>
          <ThemedText type="subtitle" style={{ color: theme.success }}>
            {claim.amount} {claim.currency}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {statusGuidance(claim, overdue)}
          </ThemedText>
        </Pressable>
        {hasSnapshot && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See what we sent"
            hitSlop={Spacing.two}
            onPress={() =>
              router.push({ pathname: '/claim-letter', params: { journeyId: journey.id } })
            }>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              See what we sent →
            </ThemedText>
          </Pressable>
        )}
        {recordable && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Record the airline's response"
            hitSlop={Spacing.two}
            onPress={() => showOutcomeMenu(claim)}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Record the airline&apos;s response →
            </ThemedText>
          </Pressable>
        )}
      </ThemedView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  titleBlock: {
    gap: Spacing.half,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  list: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
  },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  cardBody: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.9,
  },
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  amountLead: {
    color: WHITE_DIM,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 500,
  },
  amount: {
    color: PAYOUT_GREEN,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: 700,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  heroCopy: {
    gap: Spacing.two,
  },
  heroHeadline: {
    color: WHITE,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 700,
    letterSpacing: -0.3,
  },
  heroPitch: {
    color: WHITE_DIM,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 500,
  },
  howCard: {
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
});
