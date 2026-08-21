import { useAuth } from '@clerk/expo';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AirlineLogo } from '@/components/airline-logo';
import { Card } from '@/components/card';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TravelStatsHeader } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/rules/engine';
import type { Money } from '@/rules/types';
import { useClaims, type ClaimRow } from '@/services/claims';
import { countdown, formatDayLabel, formatTime } from '@/services/dates';
import { useDisruptions } from '@/services/disruptions';
import { toDomainJourney, useJourneys, type JourneyRow } from '@/services/journeys';
import { markOnboardingSeen, onboardingSeen } from '@/services/onboarding';
import { cityOf, groupJourneys, travelStats } from '@/services/timeline';

const YEAR_MS = 365 * 86_400_000;

/** The context line above the title — the next departure when one is booked
 * (the thing a traveller actually wants at a glance), today's date otherwise.
 * Relies on groupJourneys putting the soonest upcoming trip first. */
function headerEyebrow(sections: ReturnType<typeof groupJourneys>, now: Date): string {
  const next = sections[0]?.key === 'upcoming' ? sections[0].data[0] : undefined;
  if (next) {
    const timer = countdown(next.scheduledDeparture, now);
    const when = timer.unit === 'now' ? 'boarding soon' : timerLabel(timer);
    return `Next trip ${when} · ${next.fromCode} → ${next.toCode}`;
  }
  return now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function Journeys() {
  const router = useRouter();
  const { userId } = useAuth();
  const { data: journeys } = useJourneys(userId);
  const { data: claimRows } = useClaims(userId);
  const { data: disruptionRows } = useDisruptions();

  // First launch decides once the journal has loaded: a brand-new user (no
  // rows, intro never shown) gets the onboarding pages; a user whose journal
  // already has entries predates the intro and is waived, not interrupted.
  const loaded = journeys != null;
  useEffect(() => {
    if (!loaded || onboardingSeen()) return;
    if (journeys!.length) markOnboardingSeen();
    else router.push('/onboarding');
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <View style={styles.titleBlock}>
            <ThemedText
              type="smallBold"
              themeColor="textSecondary"
              style={styles.eyebrow}
              numberOfLines={1}>
              {headerEyebrow(sections, now)}
            </ThemedText>
            <ThemedText type="title" themeColor="heading">
              My travels
            </ThemedText>
          </View>
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
          // Pure travel-journal pitch — claims live in their own tab.
          <Card>
            <ThemedText type="subtitle">Your travel journal</ThemedText>
            <ThemedText type="small">
              Log any flight — next month&apos;s trip or one from years back. Distance,
              countries, airlines: your travel story adds up here.
            </ThemedText>
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

/** The codes-and-times detail line, Flighty-style: "HEL 10:15 → LHR 14:20".
 * Journal entries only carry times the user typed: identical noon timestamps
 * are the "no times" placeholder (show distance), identical non-noon ones mean
 * a single entered time — never render a fabricated departure → arrival pair. */
function scheduleLabel(row: JourneyRow): string {
  const { scheduledDeparture: dep, scheduledArrival: arr } = row;
  const km = `${Math.round(row.distanceKm).toLocaleString()} km`;
  if (row.source === 'manual' && dep === arr) {
    return dep.endsWith('T12:00:00')
      ? `${row.fromCode} → ${row.toCode} · ${km}`
      : `${row.fromCode} ${formatTime(dep)} → ${row.toCode} · ${km}`;
  }
  return `${row.fromCode} ${formatTime(dep)} → ${row.toCode} ${formatTime(arr)}`;
}

/** Money-moment marker on a journey row: a compact pill in the meta line's
 * right slot — amount in payout green on the page background, so it pops off
 * the card surface in both light (porcelain on white) and dark (deep navy on
 * card navy) modes. A claim's lifecycle (draft/sent/overdue) wins over plain
 * eligibility ("owed"). */
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
  // journal entry — the calendar rail plus the year section header say enough.
  const isOld = now.getTime() - Date.parse(row.scheduledDeparture) > YEAR_MS;
  const timer = countdown(row.scheduledDeparture, now);
  const upcoming = Date.parse(row.scheduledDeparture) >= now.getTime();
  return (
    <Link href={{ pathname: '/journey/[id]', params: { id: row.id } }} asChild>
      <Pressable style={({ pressed }) => pressed && styles.rowPressed}>
        <SheenCard style={styles.rowCard}>
          <AirlineLogo number={row.number} carrier={row.carrier} />
          <View style={styles.rowBody}>
            {/* Countdown sits on the meta line's right (Flighty's date slot) so
                the title and schedule lines get the full card width below.
                Date leads so a long carrier name truncates, never the date;
                the year lives in the section headers. */}
            <View style={styles.metaRow}>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                numberOfLines={1}
                style={styles.metaCarrier}>
                {/* The logo already names the airline, so the flight number
                    alone follows the date (Flighty's pattern); carrier is the
                    fallback for number-less journal entries. */}
                {formatDayLabel(row.scheduledDeparture)} · {row.number || row.carrier}
              </ThemedText>
              {/* One right slot: the money moment outranks the countdown. */}
              {claim || owed ? (
                <MoneyBadge claim={claim} owed={owed} now={now} />
              ) : (
                !isOld && (
                  <ThemedText
                    type={upcoming ? 'smallBold' : 'small'}
                    themeColor={upcoming ? 'heading' : 'textSecondary'}>
                    {timerLabel(timer)}
                  </ThemedText>
                )
              )}
            </View>
            <ThemedText
              type="smallBold"
              themeColor="heading"
              style={styles.route}
              numberOfLines={1}>
              {cityOf(row.fromCode)} to {cityOf(row.toCode)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {scheduleLabel(row)}
            </ThemedText>
          </View>
        </SheenCard>
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
    gap: Spacing.three,
  },
  titleBlock: {
    flex: 1,
    gap: Spacing.half,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
  rowPressed: {
    opacity: 0.9,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  metaCarrier: {
    flex: 1,
  },
  route: {
    fontSize: 16,
  },
  claimBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderRadius: Spacing.two,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    gap: Spacing.one,
  },
});
