import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AirlineLogo } from '@/components/airline-logo';
import { Card } from '@/components/card';
import { StatusChip, isOverdue, showOutcomeMenu, statusGuidance } from '@/components/claim-status';
import { PadTabBarClearance } from '@/components/split-panes';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { NEXT_STATUSES, letterExcerpt, parseSentSnapshot } from '@/services/claim-status';
import type { ClaimWithJourney } from '@/services/claims';
import { formatDayLabelWithYear } from '@/services/dates';

type Step = { label: string; when: string | null; state: 'done' | 'due' | 'late' | 'bad' };

/** What happened to a claim, in order, from what the row records. Only
 * sending and the reply deadline carry dates (the claim row stores no date
 * for an acknowledgement, a payment or a rejection), so later steps are
 * named without one. */
function claimSteps(row: ClaimWithJourney, now: number): Step[] {
  const { claims: claim, journeys: journey } = row;
  const day = (iso: string) => formatDayLabelWithYear(iso, null);
  const steps: Step[] = [];
  if (claim.sentAt) steps.push({ label: `Sent to ${journey.carrier}`, when: day(claim.sentAt), state: 'done' });
  switch (claim.status) {
    case 'sent':
      if (claim.responseDeadline) {
        const late = isOverdue(claim, now);
        steps.push({
          label: late ? 'Airline reply was due' : 'Airline reply due',
          when: day(claim.responseDeadline),
          state: late ? 'late' : 'due',
        });
      }
      break;
    case 'acknowledged':
      steps.push({ label: 'The airline acknowledged it', when: null, state: 'done' });
      break;
    case 'escalated':
      steps.push({ label: 'Escalated to the enforcement body', when: null, state: 'done' });
      break;
    case 'paid':
      steps.push({ label: 'Compensation paid', when: null, state: 'done' });
      break;
    case 'rejected':
      steps.push({ label: 'The airline rejected it', when: null, state: 'bad' });
      break;
    case 'draft':
      break;
  }
  return steps;
}

/**
 * One claim as the second pane of a wide Claims tab (docs/wide-layouts-plan.md
 * §6.1). Built from the local claim and trip rows only — it never opens the
 * trip page, which would start a live flight lookup just because the tab was
 * opened. Its actions are the ones the claim card already has.
 */
export function ClaimPane({ row, now }: { row: ClaimWithJourney; now: number }) {
  const router = useRouter();
  const theme = useTheme();
  const { claims: claim, journeys: journey } = row;
  const overdue = isOverdue(claim, now);
  const snapshot = parseSentSnapshot(claim.sentSnapshot);
  const recordable = NEXT_STATUSES[claim.status].length > 0;
  const steps = claimSteps(row, now);
  const dot = (state: Step['state']) =>
    state === 'late' ? theme.warning : state === 'bad' ? theme.danger : state === 'done' ? theme.tint : theme.hairline;

  return (
    <SafeAreaView edges={['top', 'right']} style={styles.fill}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <AirlineLogo number={journey.number} carrier={journey.carrier} size={48} />
          <View style={styles.headCopy}>
            <ThemedText type="subtitle" themeColor="heading" style={styles.title} numberOfLines={2}>
              {journey.carrier}
              {journey.number ? ` ${journey.number}` : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {journey.fromCode} → {journey.toCode} ·{' '}
              {formatDayLabelWithYear(journey.scheduledDeparture, airportZone(journey.fromCode))}
            </ThemedText>
          </View>
        </View>

        <Card style={styles.claimCard}>
          <View style={styles.amountRow}>
            <ThemedText type="subtitle" style={[styles.amount, { color: claim.status === 'rejected' ? theme.textSecondary : theme.success }]}>
              {claim.amount} {claim.currency}
            </ThemedText>
            <StatusChip status={claim.status} overdue={overdue} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {claim.regulation} · {statusGuidance(claim, overdue)}
          </ThemedText>

          {steps.length > 0 && (
            <View style={styles.steps}>
              {steps.map((step, i) => (
                <View key={step.label} style={styles.step}>
                  <View style={styles.rail}>
                    <View
                      style={[
                        styles.dot,
                        step.state === 'due'
                          ? { borderColor: theme.textSecondary, borderWidth: 2 }
                          : { backgroundColor: dot(step.state) },
                      ]}
                    />
                    {i < steps.length - 1 && <View style={[styles.line, { backgroundColor: theme.hairline }]} />}
                  </View>
                  <View style={styles.stepCopy}>
                    <ThemedText type="smallBold">{step.label}</ThemedText>
                    {step.when && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {step.when}
                      </ThemedText>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {recordable && (
            <Pressable
              accessibilityRole="button"
              onPress={() => showOutcomeMenu(claim)}
              style={({ pressed }) => [styles.primary, { backgroundColor: theme.tint }, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.primaryLabel}>
                Record the airline’s response
              </ThemedText>
            </Pressable>
          )}
        </Card>

        {snapshot && (
          <Card>
            <ThemedText type="smallBold" themeColor="heading" style={styles.cardTitle}>
              What we sent
            </ThemedText>
            <View style={[styles.quote, { backgroundColor: theme.field }]}>
              <ThemedText type="small">{letterExcerpt(snapshot.letterHtml)}</ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              hitSlop={Spacing.two}
              onPress={() => router.push({ pathname: '/claim-letter', params: { journeyId: journey.id } })}>
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                Read it all →
              </ThemedText>
            </Pressable>
          </Card>
        )}

        <Pressable
          accessibilityRole="button"
          hitSlop={Spacing.two}
          onPress={() =>
            router.push({
              pathname: '/journey/[id]',
              params: { id: journey.id, from: journey.fromCode, to: journey.toCode },
            })
          }>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            Open the trip →
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + PadTabBarClearance,
    paddingBottom: Spacing.five,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
  },
  claimCard: {
    gap: Spacing.three,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  amount: {
    fontSize: 36,
    lineHeight: 42,
    fontVariant: ['tabular-nums'],
  },
  steps: {
    gap: 0,
  },
  step: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  rail: {
    width: 14,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 24,
  },
  stepCopy: {
    flex: 1,
    paddingBottom: Spacing.three,
  },
  primary: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  primaryLabel: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.85,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  quote: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
});
