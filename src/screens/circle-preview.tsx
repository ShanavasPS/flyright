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
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';
import { formatDayLabel } from '@/services/dates';

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
    const hidden = new Set<string>(data.hiddenIds);
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

    body = (
      <>
        <View style={[styles.segment, { backgroundColor: theme.field }]}>
          {(['close', 'rest'] as const).map((t) => {
            const on = t === shownTier;
            return (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => switchTier(t)}
                style={[
                  styles.segmentItem,
                  on && {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.hairline,
                    borderWidth: StyleSheet.hairlineWidth,
                  },
                ]}>
                <ThemedText type="smallBold" themeColor={on ? 'heading' : 'textSecondary'}>
                  {t === 'close' ? 'Close circle' : 'Rest of circle'}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={inTier.length > 1 ? `${personaTitle}. Change person` : personaTitle}
          disabled={inTier.length < 2}
          onPress={pickPerson}
          style={({ pressed }) => pressed && styles.pressed}>
          <SheenCard style={styles.persona}>
            {shown ? (
              <Avatar name={shown.name} imageUrl={shown.imageUrl} size={44} />
            ) : (
              <View style={[styles.personaEmpty, { backgroundColor: `${theme.tint}1A` }]}>
                <SymbolView
                  name={{ ios: 'person.2', android: 'group', web: 'group' }}
                  size={20}
                  tintColor={theme.tint}
                />
              </View>
            )}
            <View style={styles.personaBody}>
              <ThemedText themeColor="heading">{personaTitle}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {personaDetail}
              </ThemedText>
            </View>
            {inTier.length > 1 && (
              <SymbolView
                name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                size={16}
                tintColor={theme.textSecondary}
              />
            )}
          </SheenCard>
        </Pressable>

        <View style={styles.hero}>
          <Avatar name={data.name} imageUrl={data.imageUrl} size={88} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {shown
              ? `Sharing their trips with you since ${formatDayLabel(shown.since)}`
              : 'Sharing their trips with you'}
            {closeTier ? ' · in their close circle' : ''}
          </ThemedText>
        </View>

        <PersonTravel
          name={data.name}
          data={data}
          now={now}
          badgeFor={
            closeTier
              ? (journeyId) =>
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
              : undefined
          }
          afterUpcoming={
            <OwnerNote>
              {closeTier
                ? hidden.size
                  ? `${who ?? 'Your close circle'} sees these trips exactly like this. The Close circle markers show only to you, here.`
                  : `${who ?? 'Your close circle'} sees these trips exactly like this. Mark a trip "Only my close circle" from its ··· menu and it stays here, for them alone.`
                : missing
                  ? `${plural(data.hiddenAhead, 'trip')} ahead${data.hiddenFlown ? ` and ${plural(data.hiddenFlown, 'trip')} flown` : ''} ${missing === 1 ? 'is' : 'are'} kept to your close circle. ${who ?? 'The rest of your circle'} counts them in the totals above but can't see or open them, and a shared link to one shows ${who ?? 'them'} your name and a Follow button instead of the flight.`
                  : `${who ?? 'Everyone in your circle'} sees every trip. Mark one "Only my close circle" from its ··· menu and it disappears from this view, while still counting in the totals.`}
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
      </SafeAreaView>
    </ThemedView>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A dashed aside only the owner sees — what this tier is not shown. */
function OwnerNote({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.note, { borderColor: `${theme.tint}59` }]}>
      <SymbolView
        name={{ ios: 'eye', android: 'visibility', web: 'visibility' }}
        size={16}
        tintColor={theme.tint}
        style={styles.noteIcon}
      />
      <ThemedText type="small" themeColor="heading" style={styles.noteText}>
        {children}
      </ThemedText>
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
  segment: {
    flexDirection: 'row',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: Spacing.three,
  },
  segmentItem: {
    flex: 1,
    height: 36,
    borderRadius: Spacing.three - Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
  persona: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  personaEmpty: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
  noteText: { flex: 1 },
  pressed: { opacity: 0.6 },
});
