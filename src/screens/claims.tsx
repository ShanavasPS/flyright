import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClaimsSummaryCard, Eu261Bands, HowClaimsWork, RecentFlightsCard } from '@/components/claim-explainers';
import { StatusChip, isOverdue, showOutcomeMenu, statusGuidance } from '@/components/claim-status';
import { DataErrorCard, LoadingState } from '@/components/data-state';
import { DashedNote, PaneOutline } from '@/components/pane-placeholders';
import { MicroLabel, PassAction, PassCard, PassDivider } from '@/components/pass-card';
import { PadTabBarClearance, SplitPanes } from '@/components/split-panes';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MiniContrail, WHITE, WHITE_DIM } from '@/components/travel-stats-header';
import { MaxContentWidth, Spacing, paneWidth } from '@/constants/theme';
import { useSplitLayout } from '@/hooks/use-split-layout';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { ClaimPane } from '@/screens/claim-pane';
import { NEXT_STATUSES, claimsSummary, isClosed, parseSentSnapshot } from '@/services/claim-status';
import { useClaims, type ClaimWithJourney } from '@/services/claims';
import { formatDayLabelWithYear } from '@/services/dates';
import { keepOrFallback, pickClaim } from '@/services/default-pick';

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
  const { data: rows, error } = useClaims(userId);
  // Frozen at mount — overdue-ness doesn't need to tick while the tab is open.
  const [now] = useState(() => Date.now());

  const open = rows?.filter((row) => !isClosed(row.claims.status)) ?? [];
  const closed = rows?.filter((row) => isClosed(row.claims.status)) ?? [];

  // Wide windows (docs/wide-layouts-plan.md §6): the list keeps this column
  // and the chosen claim — by default the one that needs you — opens beside
  // it. Split once there is something to say: the claims, or why they could
  // not be read. Loading stays single-column.
  const layout = useSplitLayout('claims', { primaryWidth: paneWidth(400) });
  const split = layout.split && (!!error || !!rows);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ids = useMemo(() => new Set((rows ?? []).map((row) => row.claims.id)), [rows]);
  const detailId =
    split && rows?.length
      ? keepOrFallback(selectedId, ids, () => pickClaim(rows.map((row) => row.claims), now))
      : null;
  // Pin what the pane shows. The default pick is a starting point, not a
  // rule the pane keeps following: recording a response on the overdue claim
  // makes it no longer overdue, and without this the pane jumped to another
  // claim under the thumb that had just answered. Only a claim that is gone
  // falls back (keepOrFallback), and then the fallback is pinned in turn.
  useEffect(() => {
    // In an effect, not during render: this screen renders inside a tab that
    // may not have mounted yet, and a render-time update there is an error.
    // Guarded, so it settles after one extra render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (detailId != null && detailId !== selectedId) setSelectedId(detailId);
  }, [detailId, selectedId]);
  const detailRow = detailId ? rows?.find((row) => row.claims.id === detailId) : undefined;
  const select = split ? (id: string) => setSelectedId(id) : undefined;
  const claimedIds = useMemo(() => new Set((rows ?? []).map((row) => row.journeys.id)), [rows]);

  const listPane = (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.titleBlock}>
          <ThemedText
            type="smallBold"
            themeColor="textSecondary"
            style={styles.eyebrow}
            numberOfLines={1}>
            {claimsEyebrow(open, closed)}
          </ThemedText>
          <ThemedText type="tabTitle" themeColor="heading">
            Claims
          </ThemedText>
        </View>
        {error ? (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}>
            <DataErrorCard title="Couldn't read your claims" error={error} />
          </ScrollView>
        ) : !rows ? (
          <LoadingState />
        ) : rows.length ? (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}>
            {split && <ClaimsSummaryCard items={claimsSummary(rows.map((row) => row.claims))} />}
            {(open.length > 0 || split) && <SectionLabel>In progress</SectionLabel>}
            {/* Wide only: an empty "In progress" says so instead of leaving a gap. */}
            {split && open.length === 0 && (
              <DashedNote title="Nothing in progress" detail="No airline owes you a reply right now." />
            )}
            {open.map((row, index) => (
              <ClaimCard
                key={row.claims.id}
                row={row}
                now={now}
                index={index}
                onSelect={select}
                selected={row.claims.id === detailId}
              />
            ))}
            {closed.length > 0 && <SectionLabel>Closed</SectionLabel>}
            {closed.map((row, index) => (
              <ClaimCard
                key={row.claims.id}
                row={row}
                now={now}
                index={open.length + index}
                onSelect={select}
                selected={row.claims.id === detailId}
              />
            ))}
            {/* Wide only, and only when nothing is in progress: the list
                answers "is anything owed right now?" to the bottom. */}
            {split && open.length === 0 && <RecentFlightsCard claimedJourneyIds={claimedIds} />}
          </ScrollView>
        ) : (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}>
            <ClaimsHero onDemo={() => router.push('/journey/demo')} />
          </ScrollView>
        )}
      </SafeAreaView>
  );

  return (
    <ThemedView style={styles.container}>
      <SplitPanes
        layout={{ ...layout, split }}
        primary={listPane}
        secondary={
          error ? (
            <SafeAreaView edges={['top', 'right']} style={styles.pane}>
              <PaneOutline kind="claim" caption="Your claims appear here once FlyRight can reach them." />
            </SafeAreaView>
          ) : rows?.length ? (
            // Keyed so another claim starts fresh instead of morphing.
            detailRow && <ClaimPane key={detailRow.claims.id} row={detailRow} now={now} />
          ) : (
            <NoClaimsPane />
          )
        }
      />
    </ThemedView>
  );
}

const NO_CLAIMS: ReadonlySet<string> = new Set();

/** Wide window, no claims: say so in one small card, then how a claim works
 * and what the regulation pays — no claim-shaped silhouette, since the steps
 * already say what will appear here. */
function NoClaimsPane() {
  return (
    <SafeAreaView edges={['top', 'right']} style={styles.fill}>
      <ScrollView
        // The SafeAreaView already pads the top; "automatic" would add it twice.
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.pane}
        showsVerticalScrollIndicator={false}>
        <DashedNote
          title="No active claims"
          detail="When a flight qualifies, its claim and every step with the airline open here."
        />
        <RecentFlightsCard claimedJourneyIds={NO_CLAIMS} />
        <HowClaimsWork />
        <Eu261Bands />
      </ScrollView>
    </SafeAreaView>
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
          Delayed 3h+ or cancelled? EU261 and UK261 pay €250–600. When a journal flight
          qualifies, the claim starts here.
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


function SectionLabel({ children }: { children: string }) {
  return (
    <Animated.View layout={LinearTransition.springify().damping(18)}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
        {children}
      </ThemedText>
    </Animated.View>
  );
}

function ClaimCard({
  row,
  now,
  index,
  onSelect,
  selected = false,
}: {
  row: ClaimWithJourney;
  now: number;
  index: number;
  /** Wide window: open the claim in the pane beside the list, not a route. */
  onSelect?: (claimId: string) => void;
  selected?: boolean;
}) {
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
      <ThemedView
        type="backgroundElement"
        style={[styles.card, selected && { borderWidth: 1, borderColor: theme.tint }]}>
        {/* Navigation and the record link stay SIBLINGS — an iOS Pressable
         * flattens its children into one a11y element and would swallow a
         * nested button (same trap as the timeline's Undo). */}
        {/* No explicit label: iOS flattens the children into one readable
         * a11y string ("Sent, EU261 · …, 400 EUR, …"), matching the journey
         * rows' convention — VoiceOver and Maestro both get the content. */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={onSelect ? { selected } : undefined}
          onPress={() =>
            onSelect
              ? onSelect(claim.id)
              : router.push({
                  pathname: '/journey/[id]',
                  params: { id: journey.id, from: journey.fromCode, to: journey.toCode },
                })
          }
          style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}>
          <View style={styles.chipRow}>
            <StatusChip status={claim.status} overdue={overdue} />
            <ThemedText type="small" themeColor="textSecondary">
              {claim.regulation} ·{' '}
              {formatDayLabelWithYear(journey.scheduledDeparture, airportZone(journey.fromCode))}
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
  fill: {
    flex: 1,
  },
  // A wide window's second pane: clear of iPadOS's floating tab bar.
  pane: {
    flexGrow: 1,
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + PadTabBarClearance,
    paddingBottom: Spacing.five,
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
});
