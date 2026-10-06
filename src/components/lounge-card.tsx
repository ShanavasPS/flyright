import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { passNamer, useLoungeOptions } from '@/hooks/use-lounge-options';
import { type LoungeOption } from '@/services/lounge-access';
import { useLoungesHidden } from '@/services/lounge-dismissals';
import { isOngoing, leaveLoungeVisit, undoLoungeVisit, type LoungeVisitRow } from '@/services/lounge-passes';
import { leaveBy, leaveByLabel, verdictLabel, wayLine, type LoungeFacts, type LoungeTrip } from '@/services/lounge-trip';

/** At most this many lounges on the card; the rest wait in the directory. */
const MAX_ROWS = 3;

/** The travel-day lounge card on the trip page (docs/lounges.md, design
 * A3): the lounges this traveller can use or pay for at the departure
 * airport, each opening the lounge sheet, and when to leave. Gone once
 * that time passes, after "Not today", and where the directory has none. */
export function LoungeCard({ trip, facts, now }: { trip: LoungeTrip & { id: string }; facts: LoungeFacts; now: number }) {
  const theme = useTheme();
  const router = useRouter();
  const hidden = useLoungesHidden(trip.id);
  const result = useLoungeOptions(trip, facts);
  if (!result) return null;
  const visit = result.visits.find((v) => v.journeyId === trip.id && isOngoing(v, now));
  if (visit) return <InLoungeCard visit={visit} zone={result.zone} />;
  if (hidden) return null;
  const until = leaveBy(trip, result.zone, facts);
  if (until != null && now > until) return null;
  const rows = result.options
    .filter((o) => o.verdict === 'included' || o.verdict === 'likely' || o.verdict === 'visit' || o.verdict === 'pay')
    .slice(0, MAX_ROWS);
  if (rows.length === 0) return null;

  return (
    <Card testID="trip-lounge-card">
      <View style={styles.head}>
        <ThemedText type="smallBold" themeColor="heading">
          Lounges at {trip.fromCode}
        </ThemedText>
      </View>
      {rows.map((option, i) => {
        const way = wayLine(option, result.memberships, trip.number, passNamer(result.passes));
        return (
          <Pressable
            key={option.lounge.loungeId}
            testID={`lounge-row-${option.lounge.loungeId}`}
            accessibilityRole="button"
            accessibilityLabel={[option.lounge.name, way, verdictLabel(option).text].filter(Boolean).join('. ')}
            accessibilityHint="Opens what to have ready at the desk"
            onPress={() => router.push({ pathname: '/lounge', params: { journeyId: trip.id, lounge: option.lounge.loungeId } })}
            style={({ pressed }) => [
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
              pressed && { opacity: 0.6 },
            ]}>
            <View style={styles.rowText}>
              <ThemedText type="default" style={styles.name} numberOfLines={2}>
                {option.lounge.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {way}
              </ThemedText>
            </View>
            <VerdictChip option={option} />
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={12}
              tintColor={theme.textSecondary}
            />
          </Pressable>
        );
      })}
      {until != null && (
        <View style={[styles.footer, { borderTopColor: theme.hairline }]}>
          <SymbolView name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} size={14} tintColor={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Leave a lounge by{' '}
            <ThemedText type="smallBold" themeColor="heading">
              {leaveByLabel(until, result.zone)}
            </ThemedText>
          </ThemedText>
        </View>
      )}
    </Card>
  );
}

/** The card while a logged visit lasts (design A3): where, when to leave,
 * "I've left", and Undo for a visit logged by mistake. */
function InLoungeCard({ visit, zone }: { visit: LoungeVisitRow; zone: string | null }) {
  const theme = useTheme();
  const until = visit.leaveBy ? Date.parse(visit.leaveBy) : NaN;
  return (
    <Card testID="trip-lounge-visit">
      <ThemedText type="small" themeColor="textSecondary">
        In the lounge
      </ThemedText>
      <ThemedText type="subtitle" themeColor="heading">
        {visit.loungeName}
      </ThemedText>
      {!Number.isNaN(until) && (
        <View style={styles.leaveRow}>
          <SymbolView name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} size={14} tintColor={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Leave by{' '}
            <ThemedText type="smallBold" themeColor="heading">
              {leaveByLabel(until, zone)}
            </ThemedText>
            {' '}for your gate
          </ThemedText>
        </View>
      )}
      <View style={styles.visitActions}>
        <Pressable
          testID="lounge-left"
          accessibilityRole="button"
          onPress={() => void leaveLoungeVisit(visit.id)}
          style={({ pressed }) => [styles.leftButton, { backgroundColor: theme.tint }, pressed && { opacity: 0.85 }]}>
          <ThemedText type="smallBold" style={styles.leftText}>
            I’ve left the lounge
          </ThemedText>
        </Pressable>
        <Pressable testID="lounge-undo" accessibilityRole="button" hitSlop={8} onPress={() => void undoLoungeVisit(visit.id)}>
          <ThemedText type="link">Undo</ThemedText>
        </Pressable>
      </View>
    </Card>
  );
}

/** "Included", "Likely", "€45": the verdict as a chip. Green only for
 * what costs nothing and is certain (the money-and-good-outcomes colour). */
export function VerdictChip({ option }: { option: LoungeOption }) {
  const theme = useTheme();
  const { text, tone } = verdictLabel(option);
  const color = tone === 'success' ? theme.success : tone === 'warning' ? theme.warning : theme.textSecondary;
  const background = tone === 'neutral' ? theme.backgroundSelected : `${color}22`;
  return (
    <View style={[styles.chip, { backgroundColor: background }]}>
      <ThemedText type="smallBold" style={[styles.chipText, { color }]}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 56,
    paddingVertical: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '600',
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
  },
  leaveRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  visitActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, paddingTop: Spacing.two },
  leftButton: { flex: 1, alignItems: 'center', borderRadius: Spacing.three, paddingVertical: Spacing.three },
  leftText: { color: '#FFFFFF' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
