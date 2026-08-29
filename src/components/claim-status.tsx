import { ActionSheetIOS, Alert, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  NEXT_STATUSES,
  OUTCOME_LABELS,
  STATUS_LABELS,
  type ClaimStatus,
} from '@/services/claim-status';
import type { ClaimRow } from '@/services/claims';
import { recordOutcome } from '@/services/claims';
import { formatDayLabelWithYear } from '@/services/dates';
import { noteSuccess, noteWarning, tapLight } from '@/services/haptics';

/** Chip + guidance color per status. Sent/acknowledged ride the action tint,
 * money lands green, rejection red, escalation (and an overdue sent claim)
 * amber — the same semantic trio the travel-day surfaces use. */
function statusColor(status: ClaimStatus, theme: ReturnType<typeof useTheme>): string {
  switch (status) {
    case 'paid':
      return theme.success;
    case 'rejected':
      return theme.danger;
    case 'escalated':
      return theme.warning;
    case 'draft':
      return theme.textSecondary;
    default:
      return theme.tint;
  }
}

export function StatusChip({ status, overdue = false }: { status: ClaimStatus; overdue?: boolean }) {
  const theme = useTheme();
  const color = overdue ? theme.warning : statusColor(status, theme);
  const label = overdue ? 'Response overdue' : STATUS_LABELS[status];
  return (
    <View style={[styles.chip, { backgroundColor: `${color}22` }]}>
      <ThemedText type="smallBold" style={{ color, fontSize: 12, lineHeight: 16 }}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Is a sent claim past its six-week response deadline? */
export function isOverdue(claim: ClaimRow, now: number): boolean {
  return (
    claim.status === 'sent' &&
    !!claim.responseDeadline &&
    Date.parse(claim.responseDeadline) < now
  );
}

/** One sentence of guidance under the chip — what this state means and what
 * to do about it. */
export function statusGuidance(claim: ClaimRow, overdue: boolean): string {
  switch (claim.status) {
    case 'draft':
      return "The letter hasn't been sent yet — open the journey to finish it.";
    case 'sent':
      if (overdue) {
        return 'No answer within six weeks — you can escalate to the national enforcement body for free.';
      }
      return `Sent${claim.sentAt ? ` on ${formatDayLabelWithYear(claim.sentAt)}` : ''}${
        claim.responseDeadline
          ? ` · response due by ${formatDayLabelWithYear(claim.responseDeadline)}`
          : ''
      }.`;
    case 'acknowledged':
      return 'The airline confirmed it received your claim — settlements usually follow within the response window.';
    case 'paid':
      return 'Paid out 🎉';
    case 'rejected':
      return "Rejected by the airline. Escalating to the national enforcement body is free — they rule on air passenger rights disputes.";
    case 'escalated':
      return 'With the enforcement body now. Rulings typically take a few months; record the outcome here when it arrives.';
  }
}

/** Native menu for recording what the airline (or enforcement body) did.
 * Options come straight from the outcome graph, so an already-paid claim
 * simply has no menu. */
export function showOutcomeMenu(claim: ClaimRow): void {
  const options = NEXT_STATUSES[claim.status];
  if (!options.length) return;

  const pick = (next: ClaimStatus) => {
    if (next === 'paid') noteSuccess();
    else if (next === 'rejected') noteWarning();
    else tapLight();
    void recordOutcome(claim.id, next);
  };

  if (Platform.OS === 'ios') {
    const labels = options.map((s) => OUTCOME_LABELS[s]);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'What happened with this claim?',
        options: [...labels, 'Cancel'],
        cancelButtonIndex: labels.length,
        destructiveButtonIndex: options.includes('rejected')
          ? options.indexOf('rejected')
          : undefined,
      },
      (index) => {
        if (index < options.length) pick(options[index]);
      },
    );
    return;
  }

  Alert.alert('What happened with this claim?', undefined, [
    ...options.map((s) => ({
      text: OUTCOME_LABELS[s],
      style: s === 'rejected' ? ('destructive' as const) : undefined,
      onPress: () => pick(s),
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: Spacing.two,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
  },
});
