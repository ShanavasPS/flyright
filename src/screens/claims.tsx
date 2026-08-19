import { useAuth } from '@clerk/expo';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useClaims, type ClaimWithJourney } from '@/services/claims';
import { formatDayLabelWithYear } from '@/services/dates';

export function Claims() {
  const { userId } = useAuth();
  const { data: rows } = useClaims(userId);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" themeColor="heading">
          Claims
        </ThemedText>
        {rows?.length ? (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {rows.map((row) => (
              <ClaimCard key={row.claims.id} row={row} />
            ))}
          </ScrollView>
        ) : (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">No claims yet</ThemedText>
            <ThemedText type="small">
              When a delayed journey qualifies for compensation, generate the claim from its
              detail screen — the letter and response deadline get tracked here.
            </ThemedText>
          </ThemedView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function ClaimCard({ row }: { row: ClaimWithJourney }) {
  const theme = useTheme();
  // Frozen at mount — overdue-ness doesn't need to tick while the tab is open.
  const [now] = useState(() => Date.now());
  const { claims: claim, journeys: journey } = row;

  const overdue =
    claim.status === 'sent' &&
    !!claim.responseDeadline &&
    Date.parse(claim.responseDeadline) < now;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {claim.regulation} · {formatDayLabelWithYear(journey.scheduledDeparture)}
      </ThemedText>
      <ThemedText type="smallBold">
        {journey.carrier}
        {journey.number ? ` ${journey.number}` : ''} · {journey.fromCode} → {journey.toCode}
      </ThemedText>
      <ThemedText type="subtitle" style={{ color: theme.success }}>
        {claim.amount} {claim.currency}
      </ThemedText>
      <StatusLine claim={claim} overdue={overdue} />
    </ThemedView>
  );
}

function StatusLine({ claim, overdue }: { claim: ClaimWithJourney['claims']; overdue: boolean }) {
  const theme = useTheme();

  switch (claim.status) {
    case 'draft':
      return (
        <ThemedText type="small" themeColor="textSecondary">
          Draft — the letter hasn&apos;t been sent yet. Open the journey to finish it.
        </ThemedText>
      );
    case 'sent':
      if (overdue) {
        return (
          <ThemedText type="small" style={{ color: theme.danger }}>
            Response overdue — time to escalate to the enforcement body.
          </ThemedText>
        );
      }
      return (
        <ThemedText type="small" themeColor="textSecondary">
          Sent{claim.sentAt ? ` on ${formatDayLabelWithYear(claim.sentAt)}` : ''}
          {claim.responseDeadline
            ? ` · response due by ${formatDayLabelWithYear(claim.responseDeadline)}`
            : ''}
        </ThemedText>
      );
    case 'paid':
      return (
        <ThemedText type="small" style={{ color: theme.success }}>
          Paid out 🎉
        </ThemedText>
      );
    default:
      // acknowledged / rejected / escalated — statuses later flows will set.
      return (
        <ThemedText type="small" themeColor="textSecondary">
          Status: {claim.status}
        </ThemedText>
      );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  list: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
});
