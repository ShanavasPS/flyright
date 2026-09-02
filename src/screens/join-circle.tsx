import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { Observe } from 'expo-observe';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { STORE_URLS } from '@/constants/store-links';
import { trackEvent } from '@/services/analytics';
import { INVITE_URL } from '@/services/circle';
import { requestPushPermission } from '@/services/notifications';

const APP_STORE_ID = STORE_URLS.ios.match(/id(\d+)/)?.[1] ?? '';

/** The invite page behind getflyright.com/i/<token>: "Sam invited you to
 * follow their trips". Accepting joins Sam's circle; the follow-up offers to
 * share back, Find My style. Reactive on web for anyone (store pitch). */
export function JoinCircle({ token }: { token: string }) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const invite = useQuery(api.circle.inviteByToken, { token });
  const accept = useMutation(api.circle.accept);
  const shareBack = useMutation(api.circle.shareBack);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<{ ownerId: string; sharingBack: boolean } | null>(null);

  // Back to the People tab, wherever this page was pushed from.
  const done = () => router.replace('/(tabs)/(people)/people');

  const onAccept = async () => {
    setBusy(true);
    try {
      const result = await accept({ token });
      Observe.logEvent('circle.joined');
      trackEvent('circle_joined');
      // The whole point of following is the pushes, and someone who only
      // follows may never hit the app's other permission moments — ask now,
      // while "you'll get a heads-up" is still on screen. One-shot OS prompt;
      // a no here is respected like everywhere else (Settings can flip it).
      await requestPushPermission();
      setJoined(result);
      if (result.sharingBack) done();
    } catch {
      // Expired mid-view; the reactive query flips to gone.
    } finally {
      setBusy(false);
    }
  };

  const onShareBack = async () => {
    if (!joined) return;
    setBusy(true);
    try {
      await shareBack({ userId: joined.ownerId });
      trackEvent('circle_shared_back');
    } catch {
      // Already severed on their side — nothing to share back to.
    } finally {
      setBusy(false);
      done();
    }
  };

  // iOS Smart App Banner: Safari shows a native "GET"/"OPEN" bar with the
  // App Store id; the argument brings the invite along when the app opens.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const meta = document.createElement('meta');
    meta.name = 'apple-itunes-app';
    meta.content = `app-id=${APP_STORE_ID}, app-argument=${INVITE_URL(token)}`;
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [token]);

  let body: React.ReactNode;
  if (invite === undefined) {
    body = <ActivityIndicator style={styles.spinner} />;
  } else if ('gone' in invite) {
    body = (
      <Card>
        <ThemedText type="subtitle">This invite has expired</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Invite links last 7 days. Ask them to send a fresh one from the People tab.
        </ThemedText>
      </Card>
    );
  } else {
    const name = invite.ownerName;
    let action: React.ReactNode;
    if (Platform.OS === 'web') {
      action = (
        <Card>
          <ThemedText type="subtitle">Follow along in FlyRight</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Get the app, then tap this link again to follow {name}. Free on both stores; the
            invite stays valid for 7 days.
          </ThemedText>
          <View style={styles.storeRow}>
            <Pressable onPress={() => window.open(STORE_URLS.ios, '_blank')}>
              <ThemedText type="linkPrimary">App Store</ThemedText>
            </Pressable>
            <Pressable onPress={() => window.open(STORE_URLS.android, '_blank')}>
              <ThemedText type="linkPrimary">Google Play</ThemedText>
            </Pressable>
          </View>
        </Card>
      );
    } else if (!isSignedIn) {
      action = (
        <PrimaryButton
          label="Sign in to follow"
          onPress={() => router.push({ pathname: '/sign-in', params: { next: `/i/${token}` } })}
        />
      );
    } else if (invite.relation === 'self') {
      action = (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          This is your own invite link — send it to the people who should follow your trips.
        </ThemedText>
      );
    } else if (joined) {
      action = (
        <Card>
          <ThemedText type="subtitle">You&apos;re following {name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Share your trips back so {name} gets your updates too?
          </ThemedText>
          <PrimaryButton label={`Share my trips with ${name}`} disabled={busy} onPress={onShareBack} />
          <Pressable onPress={done} disabled={busy} style={styles.centered}>
            <ThemedText type="link">Not now</ThemedText>
          </Pressable>
        </Card>
      );
    } else if (invite.relation === 'member') {
      action = (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            You already follow {name}&apos;s trips.
          </ThemedText>
          <PrimaryButton label="Open People" onPress={done} />
        </>
      );
    } else {
      action = <PrimaryButton label={`Follow ${name}'s trips`} disabled={busy} onPress={onAccept} />;
    }

    body = (
      <>
        <View style={styles.hero}>
          <Avatar name={name} imageUrl={invite.ownerImageUrl} size={72} />
          <ThemedText type="title" themeColor="heading" style={styles.centered}>
            {name} invited you to follow their trips
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            You can stop following at any time.
          </ThemedText>
        </View>
        <Card>
          <Bullet>A heads-up 24 hours before {name} flies</Bullet>
          <Bullet>A nudge at every step — at the airport, through security, on board, landed</Bullet>
          <Bullet>Delays and gate changes as they happen</Bullet>
        </Card>
        {action}
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Invitation' }} />
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

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bullet}>
      <ThemedText type="small" themeColor="tint">
        ✓
      </ThemedText>
      <ThemedText type="small" style={styles.bulletText}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  spinner: {
    marginTop: Spacing.six,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  centered: {
    textAlign: 'center',
    alignSelf: 'center',
  },
  bullet: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bulletText: {
    flex: 1,
  },
  storeRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
});
