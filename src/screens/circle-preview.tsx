import { useQuery } from 'convex/react';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { PersonTravel } from '@/components/person-travel';
import { SegmentTabs } from '@/components/segment-tabs';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { useVisibilityChooser } from '@/components/trip-audience';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';
import { formatDayLabel } from '@/services/dates';
import { setJourneyVisibility } from '@/services/journeys';
import type { TripVisibility } from '@/services/trip-visibility';

type Tier = 'close' | 'rest';

/**
 * How others see you — your own person page rendered through a member's
 * eyes. Two tiers to flip between (the close circle, and everyone else in
 * the circle), and under the switch the name of a real person in that tier,
 * so the page reads as "what Anna sees" rather than an abstract setting.
 *
 * The body is the SAME component the member's device draws (PersonTravel on
 * the same server shape), which is what makes this honest: it cannot show
 * you something a member wouldn't get. The only additions are yours alone —
 * a marker on the trips you keep to the close circle, and a dashed note
 * saying what this tier is missing and why the totals still add up.
 */
export function CirclePreview({ memberId, close }: { memberId?: string; close?: boolean }) {
  const theme = useTheme();
  // Both tiers are subscribed from the start and the switch only picks
  // between them, so flipping tabs is instant — a query whose arguments
  // change resubscribes and shows a spinner, and a tab that loads on every
  // tap doesn't read as a tab. Nothing is synced into state: until the owner
  // touches the switch the tier is whatever the follower we were opened on
  // belongs to, and the person shown is derived from the followers list.
  const [tier, setTier] = useState<Tier | null>(null);
  const [member, setMember] = useState<string | null | undefined>(undefined);
  const closeData = useQuery(api.circle.previewMe, { close: true });
  const restData = useQuery(api.circle.previewMe, { close: false });
  const followers = closeData?.followers ?? restData?.followers ?? [];
  const now = new Date();

  const openedOn = memberId ? followers.find((f) => f.userId === memberId) : undefined;
  const shownTier: Tier =
    tier ?? (openedOn ? (openedOn.close ? 'close' : 'rest') : close ? 'close' : 'rest');
  const data = shownTier === 'close' ? closeData : restData;
  const inTier = followers.filter((f) => (shownTier === 'close') === f.close);
  // The member shown must belong to the tier; otherwise the first who does.
  const wanted = member === undefined ? memberId ?? null : member;
  const shown = inTier.find((f) => f.userId === wanted) ?? inTier[0] ?? null;

  const { choose: chooseAudience, sheet: audienceSheet } = useVisibilityChooser(followers);

  const switchTier = (next: Tier) => {
    if (next === shownTier) return;
    trackEvent('circle_preview_tier', { tier: next });
    setTier(next);
    const first = followers.find((f) => (next === 'close') === f.close);
    setMember(first?.userId ?? null);
  };

  const pickPerson = () => {
    if (inTier.length < 2) return;
    const names = inTier.map((f) => f.name);
    const choose = (index: number) => {
      const f = inTier[index];
      if (f) setMember(f.userId);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...names, 'Cancel'], cancelButtonIndex: names.length, title: 'View as' },
        (index) => {
          if (index < names.length) choose(index);
        },
      );
      return;
    }
    Alert.alert('View as', undefined, [
      ...names.map((n, i) => ({ text: n, onPress: () => choose(i) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  let body: React.ReactNode;
  if (data === undefined) {
    body = <ActivityIndicator style={styles.spinner} />;
  } else if (data === null) {
    body = (
      <Card>
        <ThemedText type="subtitle">Sign in to preview</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your circle, and what it sees, lives with your account.
        </ThemedText>
      </Card>
    );
  } else {
    const closeTier = shownTier === 'close';
    // The close tier's answer holds every trip; the rest tier's is missing
    // the close-circle ones. The Rest of circle tab lists ALL of them and
    // fades the ones this tier isn't shown — the owner sees what is missing
    // in place, and can put it back from the row. Members see no such thing.
    const full = closeData ?? data;
    const hidden = new Set<string>(full.hiddenIds);
    const keys = full.keys;
    const shownData = closeTier ? data : { ...data, upcoming: full.upcoming, past: full.past };
    const missing = data.hiddenAhead + data.hiddenFlown;
    const who = shown?.name ?? null;
    const tierWord = closeTier ? 'Close circle' : 'Circle';
    const personaTitle = who
      ? `Viewing as ${who}`
      : closeTier
        ? 'Nobody in your close circle yet'
        : 'Nobody else in your circle yet';
    const personaDetail = shown
      ? `${tierWord} · following since ${formatDayLabel(shown.since)}`
      : closeTier
        ? 'Add someone from their page in People. This is what they would see.'
        : 'This is what anyone you invite would see.';

    // Tap a row: the same choice the trip's ··· menu offers, here where the
    // effect is visible. The local row is the source of truth; the sync
    // carries it up and this query re-renders within a moment.
    const setVisibility = (journeyId: string, next: TripVisibility, from: string) => {
      const key = keys[journeyId];
      if (!key) return;
      trackEvent('circle_trip_audience', { audience: next, from });
      void setJourneyVisibility(key, next);
    };
    // The same three-way chooser the trip's ··· menu opens. A trip made
    // private leaves both tiers' lists — the preview shows what others see,
    // and nobody sees it; the note below counts it.
    const audienceMenu = (journeyId: string) =>
      chooseAudience(hidden.has(journeyId) ? 'close' : 'circle', (next) =>
        setVisibility(journeyId, next, 'preview'),
      );
    const showAll = () => {
      const ids = [...hidden];
      Alert.alert(
        'Show everything to your whole circle?',
        `${plural(ids.length, 'trip')} ${ids.length === 1 ? 'is' : 'are'} kept to your close circle right now. Everyone in your circle will see ${ids.length === 1 ? 'it' : 'them'}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Show everything',
            onPress: () => {
              trackEvent('circle_trip_audience', { audience: 'circle', from: 'preview-all', count: ids.length });
              for (const id of ids) setVisibility(id, 'circle', 'preview-all');
            },
          },
        ],
      );
    };

    body = (
      <>
        <SegmentTabs
          value={shownTier}
          onChange={switchTier}
          tabs={[
            { key: 'close', label: 'Close circle' },
            { key: 'rest', label: 'Rest of circle' },
          ]}
        />

        {/* Who this is seen as. A card only when it can be tapped to pick
            someone else; with one person or nobody it is a plain row, so it
            doesn't dress up as a button it isn't. */}
        {inTier.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${personaTitle}. Change person`}
            onPress={pickPerson}
            style={({ pressed }) => pressed && styles.pressed}>
            <SheenCard style={styles.persona}>
              <Avatar name={shown!.name} imageUrl={shown!.imageUrl} size={44} pro={shown!.pro} />
              <View style={styles.personaBody}>
                <ThemedText themeColor="heading">{personaTitle}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {personaDetail}
                </ThemedText>
              </View>
              <SymbolView
                name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                size={16}
                tintColor={theme.textSecondary}
              />
            </SheenCard>
          </Pressable>
        ) : (
          <View style={styles.personaPlain}>
            {shown ? (
              <Avatar name={shown.name} imageUrl={shown.imageUrl} size={28} />
            ) : (
              <SymbolView
                name={{ ios: 'person.2', android: 'group', web: 'group' }}
                size={18}
                tintColor={theme.textSecondary}
              />
            )}
            <View style={styles.personaBody}>
              <ThemedText type="smallBold" themeColor="heading">
                {personaTitle}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {personaDetail}
              </ThemedText>
            </View>
          </View>
        )}

        <View style={styles.hero}>
          <Avatar name={data.name} imageUrl={data.imageUrl} size={88} pro={data.pro} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {shown
              ? `Sharing their trips with you since ${formatDayLabel(shown.since)}`
              : 'Sharing their trips with you'}
            {closeTier ? ' · in their close circle' : ''}
          </ThemedText>
        </View>

        <PersonTravel
          name={data.name}
          data={shownData}
          now={now}
          onOpenTrip={audienceMenu}
          dimFor={closeTier ? undefined : (journeyId) => hidden.has(journeyId)}
          badgeFor={(journeyId) =>
            hidden.has(journeyId) ? (
              <View style={[styles.marker, { backgroundColor: `${theme.tint}1A` }]}>
                <SymbolView
                  name={{ ios: 'house.fill', android: 'home', web: 'home' }}
                  size={11}
                  weight="bold"
                  tintColor={theme.tint}
                />
                <ThemedText style={[styles.markerText, { color: theme.tint }]}>
                  Close circle
                </ThemedText>
              </View>
            ) : undefined
          }
          afterUpcoming={
            <OwnerNote
              action={!closeTier && hidden.size > 0 ? { label: 'Show everything to your whole circle', onPress: showAll } : undefined}>
              {closeTier
                ? hidden.size
                  ? `${who ?? 'Your close circle'} sees these trips exactly like this. The Close circle markers show only to you, here. Tap a trip to change who sees it.`
                  : `${who ?? 'Your close circle'} sees these trips exactly like this. Tap a trip to keep it to your close circle.`
                : missing
                  ? `The faded ${missing === 1 ? 'trip is' : 'trips are'} kept to your close circle. ${who ?? 'The rest of your circle'} counts ${missing === 1 ? 'it' : 'them'} in the totals above but can't see or open ${missing === 1 ? 'it' : 'them'}, and a shared link to one shows ${who ?? 'them'} your name and a Follow button instead of the flight. Tap a trip to change who sees it.`
                  : `${who ?? 'Everyone in your circle'} sees every trip — that's the default. Tap a trip to keep it to your close circle; it stays in these totals.`}
              {full.privateCount
                ? ` ${plural(full.privateCount, 'trip')} ${full.privateCount === 1 ? 'is' : 'are'} only yours and ${full.privateCount === 1 ? 'appears' : 'appear'} nowhere here, not even in the totals.`
                : ''}
            </OwnerNote>
          }
        />
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {body}
        </ScrollView>
        {audienceSheet}
      </SafeAreaView>
    </ThemedView>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A dashed aside only the owner sees — what this tier is not shown, and
 * optionally the one action that undoes it. */
function OwnerNote({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { label: string; onPress: () => void };
}) {
  const theme = useTheme();
  return (
    <View style={[styles.note, { borderColor: `${theme.tint}59` }]}>
      <SymbolView
        name={{ ios: 'eye', android: 'visibility', web: 'visibility' }}
        size={16}
        tintColor={theme.tint}
        style={styles.noteIcon}
      />
      <View style={styles.noteText}>
        <ThemedText type="small" themeColor="heading">
          {children}
        </ThemedText>
        {action && (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={Spacing.one}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              {action.label}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  spinner: { marginTop: Spacing.six },
  persona: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  personaPlain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + Spacing.half,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  personaBody: { flex: 1, gap: Spacing.half },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  centered: { textAlign: 'center', alignSelf: 'center' },
  marker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
  },
  markerText: { fontSize: 11, lineHeight: 12, fontWeight: 700 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three - Spacing.one,
    paddingVertical: Spacing.three - Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  noteIcon: { marginTop: Spacing.half },
  noteText: { flex: 1, gap: Spacing.two },
  pressed: { opacity: 0.6 },
});
