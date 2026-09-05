import { useUser } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Observe } from 'expo-observe';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { CIRCLE_FULL, FREE_CIRCLE_SIZE } from '../../convex/circleShared';

import { Avatar } from '@/components/avatar';
import { PrimaryButton } from '@/components/primary-button';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';
import { shareInvite } from '@/services/circle-share';
import { useProLocked } from '@/services/purchases';

type Person = { userId: string; name: string; imageUrl: string | null; relation: string };

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

  // Only search once there's something worth matching whole; 'skip' keeps
  // the empty box from asking the server anything at all.
  const term = query.trim();
  const results = useQuery(api.circle.findPeople, term.length >= 2 ? { q: term } : 'skip');

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
            ? `Free accounts share with ${FREE_CIRCLE_SIZE === 1 ? 'one person' : `${FREE_CIRCLE_SIZE} people`}. Pro lets your whole family follow.`
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

  let found: React.ReactNode = null;
  if (term.length >= 2) {
    if (results === undefined) {
      found = <ActivityIndicator style={styles.spinner} />;
    } else if (results.length === 0) {
      found = (
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          Nobody on FlyRight matches “{term}”. Search their exact first name or the email they
          signed in with — or send them a link below.
        </ThemedText>
      );
    } else {
      found = results.slice(0, MAX_ROWS).map((person) => (
        <PersonRow
          key={person.userId}
          person={person}
          busy={busy === person.userId}
          onInvite={() => void onInvite(person)}
        />
      ));
    }
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
        {found}
        {error && (
          <ThemedText type="small" style={[styles.empty, { color: theme.danger }]}>
            {error}
          </ThemedText>
        )}
      </View>
      <View style={styles.footer}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.footerCopy}>
          Not on FlyRight yet? Send a link — it works for 7 days and opens the invitation once
          they install the app.
        </ThemedText>
        <PrimaryButton
          label="Share an invite link"
          disabled={busy != null}
          onPress={() => void onShareLink()}
        />
      </View>
    </ThemedView>
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
  const theme = useTheme();
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
      <Avatar name={person.name} imageUrl={person.imageUrl} size={44} />
      <View style={styles.rowBody}>
        <ThemedText themeColor="heading" numberOfLines={1}>
          {person.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {status}
        </ThemedText>
      </View>
      {person.relation === 'none' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Invite ${person.name} to follow your trips`}
          disabled={busy}
          onPress={onInvite}
          style={({ pressed }) => [
            styles.inviteChip,
            { backgroundColor: theme.tint },
            pressed && styles.pressed,
          ]}>
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText type="smallBold" style={styles.inviteChipLabel}>
              Invite
            </ThemedText>
          )}
        </Pressable>
      )}
    </SheenCard>
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
  footer: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  footerCopy: {
    textAlign: 'center',
  },
});
