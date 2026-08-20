import { useAuth } from '@clerk/expo';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TravelStatsHeader } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/rules/engine';
import type { Money } from '@/rules/types';
import { useClaims, type ClaimRow } from '@/services/claims';
import {
  countdown,
  formatDayLabel,
  formatDayLabelWithYear,
  formatTime,
} from '@/services/dates';
import { useDisruptions } from '@/services/disruptions';
import { toDomainJourney, useJourneys, type JourneyRow } from '@/services/journeys';
import { groupJourneys, travelStats } from '@/services/timeline';

const YEAR_MS = 365 * 86_400_000;

export function Journeys() {
  const router = useRouter();
  const { userId } = useAuth();
  const { data: journeys } = useJourneys(userId);
  const { data: claimRows } = useClaims(userId);
  const { data: disruptionRows } = useDisruptions();

  const now = new Date();
  const sections = useMemo(() => groupJourneys(journeys ?? [], now), [journeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => travelStats(journeys ?? []), [journeys]);
  const claimByJourney = useMemo(() => {
    const map = new Map<string, ClaimRow>();
    for (const row of claimRows ?? []) map.set(row.claims.journeyId, row.claims);
    return map;
  }, [claimRows]);
  // Cached delays run through the pure rules engine — no network — so rows the
  // app knows are compensation-eligible get a money badge before any claim exists.
  const owedByJourney = useMemo(() => {
    const byId = new Map((journeys ?? []).map((j) => [j.id, j]));
    const map = new Map<string, Money>();
    for (const d of disruptionRows ?? []) {
      if (d.delayMinutes == null) continue;
      const row = byId.get(d.journeyId);
      if (!row) continue;
      const verdict = evaluate(toDomainJourney(row), {
        type: 'delay',
        delayMinutes: d.delayMinutes,
      });
      if (verdict.eligible && verdict.compensation) map.set(row.id, verdict.compensation);
    }
    return map;
  }, [disruptionRows, journeys]);

  return (
    <ThemedView style={styles.container}>
      {/* Top edge only: the list itself runs under the floating tab bar (the
          iOS 26 behavior — glass blurs the content scrolling beneath it). */}
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.titleRow}>
          <ThemedText type="title" themeColor="heading">
            My travels
          </ThemedText>
          <AddFlightButton onPress={() => router.push('/add-flight')} />
        </View>

        {journeys?.length ? (
          <SectionList
            sections={sections}
            keyExtractor={(row) => row.id}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            ListHeaderComponent={<TravelStatsHeader stats={stats} />}
            renderSectionHeader={({ section }) => (
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
                {section.title}
              </ThemedText>
            )}
            renderItem={({ item }) => (
              <JourneyItem
                row={item}
                now={now}
                claim={claimByJourney.get(item.id)}
                owed={owedByJourney.get(item.id)}
              />
            )}
          />
        ) : (
          <Card>
            <ThemedText type="subtitle">Your travel journal</ThemedText>
            <ThemedText type="small">
              Log any flight — next month&apos;s trip or one from years back. Your travel
              history lives here, and if a delay ever makes you eligible for compensation,
              you&apos;ll know — and how much.
            </ThemedText>
            {/* Demo journey exercises the whole verdict flow without live data. */}
            <Link href="/journey/demo">
              <ThemedText type="link">See a demo verdict →</ThemedText>
            </Link>
          </Card>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

/** Header-style "+" on the title row's right edge — the standard list-screen
 * add affordance, same placement on every platform. Liquid Glass where the OS
 * supports it; an elevated brand-tint circle everywhere else. */
function AddFlightButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable();

  const icon = (
    <SymbolView
      name={{ ios: 'plus', android: 'add', web: 'add' }}
      size={20}
      weight="semibold"
      tintColor={glass ? theme.tint : '#ffffff'}
    />
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add a flight, past or future"
      onPress={onPress}>
      {glass ? (
        <GlassView glassEffectStyle="regular" isInteractive style={styles.addCircle}>
          {icon}
        </GlassView>
      ) : (
        <View style={[styles.addCircle, styles.addFallback, { backgroundColor: theme.tint }]}>
          {icon}
        </View>
      )}
    </Pressable>
  );
}

/** Journal entries only carry times the user typed: identical noon timestamps
 * are the "no times" placeholder (show distance), identical non-noon ones mean
 * a single entered time — never render a fabricated departure → arrival pair. */
function manualScheduleLabel(row: JourneyRow): string {
  const { scheduledDeparture: dep, scheduledArrival: arr } = row;
  if (dep === arr) {
    return dep.endsWith('T12:00:00')
      ? `${Math.round(row.distanceKm).toLocaleString()} km`
      : `${formatTime(dep)} · ${Math.round(row.distanceKm).toLocaleString()} km`;
  }
  return `${formatTime(dep)} → ${formatTime(arr)}`;
}

/** Money-moment marker on a journey row: the amount in payout green on the
 * page background, so it pops off the card surface in both light (porcelain
 * on white) and dark (deep navy on card navy) modes. A claim's lifecycle
 * (draft/sent/overdue) wins over plain eligibility ("owed"). */
function MoneyBadge({ claim, owed, now }: { claim?: ClaimRow; owed?: Money; now: Date }) {
  const theme = useTheme();
  const amount = claim ? `${claim.amount} ${claim.currency}` : `${owed!.amount} ${owed!.currency}`;
  const overdue =
    claim?.status === 'sent' &&
    !!claim.responseDeadline &&
    Date.parse(claim.responseDeadline) < now.getTime();

  const label = !claim
    ? 'owed'
    : claim.status === 'draft'
      ? 'draft'
      : overdue
        ? 'overdue'
        : claim.status;

  return (
    <ThemedView type="background" style={styles.claimBadge}>
      <ThemedText type="smallBold" style={{ color: theme.success }}>
        {amount}
      </ThemedText>
      <ThemedText
        type="small"
        themeColor={overdue ? undefined : 'textSecondary'}
        style={overdue ? { color: theme.danger } : undefined}>
        {label}
      </ThemedText>
    </ThemedView>
  );
}

/** "in 3h" / "26h ago" / "in 5d" / "now" — compact enough to live on the
 * row's right edge without squeezing the flight details. */
function timerLabel(timer: { value: number; unit: string }): string {
  if (timer.unit === 'now') return 'now';
  const short = timer.unit.startsWith('hours') ? 'h' : 'd';
  return timer.unit.endsWith('ago') ? `${timer.value}${short} ago` : `in ${timer.value}${short}`;
}

function JourneyItem({
  row,
  now,
  claim,
  owed,
}: {
  row: JourneyRow;
  now: Date;
  claim?: ClaimRow;
  owed?: Money;
}) {
  // Recent and upcoming trips get the live countdown; older ones read like a
  // journal entry — the full date in the carrier line says enough.
  const isOld = now.getTime() - Date.parse(row.scheduledDeparture) > YEAR_MS;
  const timer = countdown(row.scheduledDeparture, now);
  const upcoming = Date.parse(row.scheduledDeparture) >= now.getTime();

  return (
    <Link href={{ pathname: '/journey/[id]', params: { id: row.id } }} asChild>
      <Pressable>
        <ThemedView type="backgroundElement" style={styles.rowCard}>
          <View style={styles.rowBody}>
            <ThemedText type="small" themeColor="textSecondary">
              {row.carrier}
              {row.number ? ` ${row.number}` : ''} ·{' '}
              {isOld
                ? formatDayLabelWithYear(row.scheduledDeparture)
                : formatDayLabel(row.scheduledDeparture)}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.route}>
              {row.fromCode} to {row.toCode}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {row.source === 'manual'
                ? manualScheduleLabel(row)
                : `${formatTime(row.scheduledDeparture)} → ${formatTime(row.scheduledArrival)}`}
            </ThemedText>
          </View>
          <View style={styles.rowAside}>
            {!isOld && (
              <ThemedText
                type={upcoming ? 'smallBold' : 'small'}
                themeColor={upcoming ? 'heading' : 'textSecondary'}>
                {timerLabel(timer)}
              </ThemedText>
            )}
            {(claim || owed) && <MoneyBadge claim={claim} owed={owed} now={now} />}
          </View>
        </ThemedView>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  addFallback: {
    shadowColor: '#0B1520',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  list: {
    gap: Spacing.two,
    // Breathing room past the auto tab-bar inset when scrolled to the end.
    paddingBottom: Spacing.three,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.two,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
  rowAside: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  route: {
    fontSize: 16,
  },
  claimBadge: {
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    gap: Spacing.half,
  },
});
