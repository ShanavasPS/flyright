import { useUser } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Observe } from 'expo-observe';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { CIRCLE_FULL, FREE_CIRCLE_LABEL, FREE_CIRCLE_SIZE, SEARCH_LIMIT } from '../../convex/circleShared';

import { Avatar } from '@/components/avatar';
import { IconBadge, SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';
import { shareInvite } from '@/services/circle-share';
import { useProLocked } from '@/services/purchases';

type Person = {
  userId: string;
  name: string;
  imageUrl: string | null;
  pro: boolean;
  relation: string;
};

/** As many hits as the sheet can show without scrolling — see the note on
 * styles.results. Whole-name matching rarely returns more. */
const MAX_ROWS = 5;

/**
 * "Add someone": the two ways to put a person in your circle, in the order
 * that costs them least. Someone who already has FlyRight is invited inside
 * it — a push and a row in their People tab, no link to lose; anyone else
 * gets the share-sheet link, which is still the only way to reach a phone
 * that has never seen the app. Both end in the same place (convex/circle.ts:
 * requestFollow and accept both run `join`), so the circle can't tell which
 * door someone came through.
 *
 * Search matches a whole first name or a whole email address — see
 * circle.findPeople for why it isn't a prefix search.
 */
export function AddPerson() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useUser();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const proLocked = useProLocked();
  const insets = useSafeAreaInsets();
  const requestFollow = useMutation(api.circle.requestFollow);
  const createInvite = useMutation(api.circle.createInvite);
  // Same subscription the People tab holds, so this costs nothing extra.
  const circle = useQuery(api.circle.list);

  // The cap, said before the invitations go out rather than after they
  // can't be honoured: a free account seats FREE_CIRCLE_SIZE followers, and
  // more invitations out than seats are a race for them — the losers hear
  // "circle is full" when they say yes, and this sheet is the only place
  // that could have warned the sender.
  let capNote: string | null = null;
  if (proLocked && circle) {
    const seat = FREE_CIRCLE_LABEL;
    const out = circle.outgoing.length;
    const followerCount = circle.followers.length;
    const seatsLeft = FREE_CIRCLE_SIZE - followerCount;
    if (seatsLeft <= 0) {
      capNote = `Your free circle is full — ${seat} can follow your trips. Pro lets your whole family follow.`;
    } else if (out >= seatsLeft) {
      // More promises out than seats: whoever answers last finds no room.
      capNote = `Free accounts share trips with ${seat}. ${out === 1 ? 'One invitation is' : `${out} invitations are`} already out for ${seatsLeft === 1 ? 'the last seat' : `${seatsLeft} seats`} — whoever accepts first takes ${seatsLeft === 1 ? 'it' : 'them'}. Pro lets your whole family follow.`;
    } else {
      capNote = `Free accounts share trips with ${seat}. Pro lets your whole family follow.`;
    }
  }

  // Only search once there's something worth matching whole, and a beat
  // after the last keystroke: each search is a counted mutation (see
  // circle.findPeople), so the box asks once per pause, not per letter.
  const term = query.trim();
  const findPeople = useMutation(api.circle.searchPeople);
  // Answers are kept with the term they answer, so a stale reply for an
  // earlier term never shows under the current one — and the box reads as
  // "searching" (undefined) until the current term has its own answer.
  const [answer, setAnswer] = useState<{ term: string; people: Person[] } | null>(null);
  const results = term.length >= 2 && answer?.term === term ? answer.people : undefined;
  const latest = useRef('');
  useEffect(() => {
    latest.current = term;
    if (term.length < 2) return;
    const handle = setTimeout(() => {
      findPeople({ q: term })
        .then((people) => {
          if (latest.current === term) setAnswer({ term, people });
        })
        .catch((e) => {
          if (latest.current !== term) return;
          setAnswer({ term, people: [] });
          setError(
            e instanceof ConvexError && e.data === SEARCH_LIMIT
              ? "That's a lot of searching for one day — send a link instead."
              : 'Could not search right now. Check your connection and try again.',
          );
        });
    }, 350);
    return () => clearTimeout(handle);
  }, [term, findPeople]);

  const onInvite = async (person: Person) => {
    setBusy(person.userId);
    setError(null);
    try {
      const result = await requestFollow({ userId: person.userId });
      Observe.logEvent('circle.invited');
      trackEvent('circle_invite_sent', { channel: 'in_app' });
      if (result.status === 'sharing') setError(`${person.name} already follows your trips.`);
    } catch (e) {
      setError(
        e instanceof ConvexError && e.data === CIRCLE_FULL
          ? proLocked
            ? `Free accounts share with ${FREE_CIRCLE_LABEL}. Pro lets your whole family follow.`
            : 'Your Pro purchase is still syncing — try again in a moment.'
          : `Couldn't send that invitation. Check your connection and try again.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const onShareLink = async () => {
    setBusy('link');
    setError(null);
    try {
      const { token } = await createInvite({});
      await shareInvite(token, user?.firstName);
      router.back();
    } catch (e) {
      setError(
        e instanceof ConvexError && e.data === CIRCLE_FULL
          ? 'Your circle is full — FlyRight Pro lets your whole family follow.'
          : `Couldn't create a link just now. Check your connection and try again.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const linkBusy = busy === 'link';
  const sendLink = () => void onShareLink();

  // The link is an answer to the search, not a footer under it. Pinned to the
  // bottom it spent its life behind the keyboard this sheet opens with — and
  // it belongs beside the people anyway: "not on FlyRight" is a result about
  // the person searched for, told the way a hit is told.
  let found: React.ReactNode;
  if (term.length < 2) {
    found = (
      <>
        <LinkRow
          title="Not on FlyRight yet?"
          subtitle="Send a link — it opens the invitation once they install."
          busy={linkBusy}
          onPress={sendLink}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          Already on FlyRight? Search their whole first name, or the email address they signed in
          with.
        </ThemedText>
      </>
    );
  } else if (results === undefined) {
    found = <ActivityIndicator style={styles.spinner} />;
  } else if (results.length === 0) {
    found = (
      <>
        {/* The name goes in the subtitle, not the title: an address is long
            enough to truncate a title down to the quotation marks. */}
        <LinkRow
          title="Not on FlyRight"
          subtitle={`Nobody matches “${term}”. Send them a link instead.`}
          busy={linkBusy}
          onPress={sendLink}
          accessibilityLabel={`Send ${term} an invite link`}
        />
        {/* Second, and quietly: the search is whole-word, so a miss is as
            often a half-typed name as a person who hasn't installed it. */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          Already have it? Search their whole first name, or the email address they signed in
          with.
        </ThemedText>
      </>
    );
  } else {
    found = (
      <>
        {results.slice(0, MAX_ROWS).map((person) => (
          <PersonRow
            key={person.userId}
            person={person}
            busy={busy === person.userId}
            onInvite={() => void onInvite(person)}
          />
        ))}
        <LinkRow
          title="Someone else?"
          subtitle="Send a link to anyone who isn't on FlyRight yet."
          busy={linkBusy}
          onPress={sendLink}
        />
      </>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingBottom: Math.max(insets.bottom, Spacing.four) }]}>
      <View style={styles.header}>
        <ThemedText type="subtitle" themeColor="heading">
          Add someone
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <ThemedText type="link">Done</ThemedText>
        </Pressable>
      </View>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        keyboardType="email-address"
        returnKeyType="search"
        value={query}
        onChangeText={setQuery}
        placeholder="First name or email"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.field }]}
      />
      {/* Plain layout on purpose: a ScrollView inside a formSheet is captured
          by the sheet's drag integration and hoisted over the header (the
          same constraint claim-wizard and add-flight carry). Whole-name
          matching keeps the list short enough that it never needs one. */}
      <View style={styles.results}>
        {capNote && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Free accounts share with ${FREE_CIRCLE_LABEL}. See FlyRight Pro`}
            testID="add-person-cap-note"
            onPress={() => router.push({ pathname: '/paywall', params: { next: '/people' } })}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.capNote}>
              {capNote}
            </ThemedText>
          </Pressable>
        )}
        {found}
        {error && (
          <ThemedText type="small" style={[styles.empty, { color: theme.danger }]}>
            {error}
          </ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

/** The link, told as a search result: the same card, badge and chip a person
 * gets, because to the traveller it answers the same question. */
function LinkRow({
  title,
  subtitle,
  busy,
  onPress,
  accessibilityLabel = 'Send an invite link',
}: {
  title: string;
  subtitle: string;
  busy: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <SheenCard style={styles.rowCard}>
      <IconBadge
        symbol={{ ios: 'paperplane.fill', android: 'send', web: 'send' }}
        size={44}
      />
      <View style={styles.rowBody}>
        <ThemedText themeColor="heading" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
          {subtitle}
        </ThemedText>
      </View>
      <ActionChip
        label="Send"
        accessibilityLabel={accessibilityLabel}
        busy={busy}
        onPress={onPress}
        testID="share-invite-link"
      />
    </SheenCard>
  );
}

/** One search hit: who they are, and the one thing to do about them. */
function PersonRow({
  person,
  busy,
  onInvite,
}: {
  person: Person;
  busy: boolean;
  onInvite: () => void;
}) {
  const status =
    person.relation === 'sharing'
      ? 'Already follows your trips'
      : person.relation === 'invited'
        ? 'Invited — waiting for them'
        : person.relation === 'incoming'
          ? 'Invited you first — answer in People'
          : 'On FlyRight';
  return (
    <SheenCard style={styles.rowCard}>
      <Avatar name={person.name} imageUrl={person.imageUrl} size={44} pro={person.pro} />
      <View style={styles.rowBody}>
        <ThemedText themeColor="heading" numberOfLines={1}>
          {person.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {status}
        </ThemedText>
      </View>
      {person.relation === 'none' && (
        <ActionChip
          label="Invite"
          accessibilityLabel={`Invite ${person.name} to follow your trips`}
          busy={busy}
          onPress={onInvite}
        />
      )}
    </SheenCard>
  );
}

/** The one action a row carries, on the right of it. */
function ActionChip({
  label,
  accessibilityLabel,
  busy,
  onPress,
  testID,
}: {
  label: string;
  accessibilityLabel: string;
  busy: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.inviteChip,
        { backgroundColor: theme.tint },
        pressed && styles.pressed,
      ]}>
      {busy ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <ThemedText type="smallBold" style={styles.inviteChipLabel}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: {
    fontSize: 16,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  // The room between the field and the link footer.
  results: {
    flex: 1,
    gap: Spacing.two,
  },
  spinner: {
    marginTop: Spacing.four,
  },
  empty: {
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
  },
  capNote: {
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
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
  inviteChip: {
    minWidth: 76,
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  inviteChipLabel: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.6,
  },
});
