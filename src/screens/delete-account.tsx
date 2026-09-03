import { useUser } from '@clerk/expo';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SUPPORT_EMAIL } from '@/constants/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Self-service account deletion, reachable without the app installed at
 * https://flyright.expo.app/delete-account — Google Play's account-deletion
 * policy requires a web path, and Apple's 5.1.1(v) an in-app one (this route
 * plus Clerk's profile screen both satisfy it in-app). Deleting the Clerk
 * account also triggers the user.deleted webhook that purges synced journeys
 * from Convex (see convex/http.ts).
 */
export function DeleteAccount() {
  const theme = useTheme();
  const { isLoaded, isSignedIn, user } = useUser();
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<'idle' | 'deleting' | 'done' | 'error'>('idle');

  const onDelete = async () => {
    setState('deleting');
    try {
      await user!.delete();
      setState('done');
    } catch {
      setState('error');
    }
  };

  let body;
  if (state === 'done') {
    body = (
      <Card>
        <ThemedText type="subtitle">Account deleted</ThemedText>
        <ThemedText type="small">
          Your account and the travel history synced to it are gone. Any data still on
          your devices can be removed by deleting the app. Safe travels.
        </ThemedText>
      </Card>
    );
  } else if (!isLoaded) {
    body = <ActivityIndicator />;
  } else if (!isSignedIn) {
    body = (
      <Card>
        <ThemedText type="subtitle">Delete your FlyRight account</ThemedText>
        <ThemedText type="small">
          Sign in first so we know whose account to delete. Deletion permanently removes
          your account and the travel history synced to it.
        </ThemedText>
        <Link href="/sign-in">
          <ThemedText type="link">Sign in →</ThemedText>
        </Link>
      </Card>
    );
  } else {
    body = (
      <Card>
        <ThemedText type="subtitle">Delete your FlyRight account</ThemedText>
        <ThemedText type="small">
          Signed in as {user.primaryEmailAddress?.emailAddress ?? user.id}. Deleting your
          account permanently removes it along with all travel history synced to your
          account. This cannot be undone. Store subscriptions are managed by the App
          Store or Google Play and should be cancelled there.
        </ThemedText>
        {!confirming ? (
          <Pressable onPress={() => setConfirming(true)} hitSlop={Spacing.two}>
            <ThemedText style={{ color: theme.danger }}>Delete my account</ThemedText>
          </Pressable>
        ) : (
          <View style={styles.confirmBlock}>
            <ThemedText type="smallBold" style={{ color: theme.danger }}>
              Are you sure? There is no way back.
            </ThemedText>
            <Pressable onPress={onDelete} disabled={state === 'deleting'} hitSlop={Spacing.two}>
              <ThemedText style={{ color: theme.danger }}>
                {state === 'deleting' ? 'Deleting…' : 'Yes, permanently delete everything'}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setConfirming(false)} hitSlop={Spacing.two}>
              <ThemedText type="link">Keep my account</ThemedText>
            </Pressable>
          </View>
        )}
        {state === 'error' && (
          <ThemedText type="small" style={{ color: theme.danger }}>
            Deletion failed — please try again, or contact {SUPPORT_EMAIL}.
          </ThemedText>
        )}
      </Card>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* No top edge: the stack header already owns that inset. */}
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
        {body}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
  },
  confirmBlock: {
    gap: Spacing.two,
  },
});
