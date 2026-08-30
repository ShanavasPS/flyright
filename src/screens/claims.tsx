import { useAuth } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusChip, isOverdue, showOutcomeMenu, statusGuidance } from '@/components/claim-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { NEXT_STATUSES, isClosed, parseSentSnapshot } from '@/services/claim-status';
import { useClaims, type ClaimWithJourney } from '@/services/claims';
import { formatDayLabelWithYear } from '@/services/dates';

export function Claims() {
  const { userId } = useAuth();
  const { data: rows } = useClaims(userId);
  // Frozen at mount — overdue-ness doesn't need to tick while the tab is open.
  const [now] = useState(() => Date.now());

  const open = rows?.filter((row) => !isClosed(row.claims.status)) ?? [];
  const closed = rows?.filter((row) => isClosed(row.claims.status)) ?? [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ThemedText type="title" themeColor="heading">
          Claims
        </ThemedText>
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
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">No claims yet</ThemedText>
            <ThemedText type="small">
              When a delayed journey qualifies for compensation, generate the claim from its
              detail screen — the letter, deadline, and the airline&apos;s response get tracked
              here.
            </ThemedText>
            {/* Demo journey exercises the whole verdict flow without live data. */}
            <Link href="/journey/demo">
              <ThemedText type="link">See a demo verdict →</ThemedText>
            </Link>
          </ThemedView>
        )}
      </SafeAreaView>
    </ThemedView>
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
});
