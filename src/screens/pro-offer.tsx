import { useAuth } from '@clerk/expo';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { canSetProReminder, nextProTrip, proReminderTime } from '../../convex/proShared';
import { PrimaryButton } from '@/components/primary-button';
import { ProBenefits, ProHeader, ProHero, ProReminderCard, ProReminderSteps } from '@/components/pro-presentation';
import { ThemedText } from '@/components/themed-text';
import { CONVEX_URL } from '@/constants/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useJourneys, type JourneyRow } from '@/services/journeys';
import { useProPreferences } from '@/services/pro-prompts';
import { billingAvailable, useHasPro } from '@/services/purchases';
import { showFlash } from '@/services/flash';

export function ProOffer() {
  const { journeyId, feature, next, step } = useLocalSearchParams<{ journeyId?: string; feature?: string; next?: string; step?: string }>();
  const { userId } = useAuth();
  const { data: journeys } = useJourneys(userId);
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(60_000).getTime();
  const pro = useHasPro();
  const preferences = useProPreferences(userId);
  const trip = journeyId ? journeys?.find(j => j.id === journeyId) ?? null : nextProTrip(journeys ?? [], now);
  const [reminding, setReminding] = useState(step === 'reminder');
  const close = () => router.canGoBack() ? router.back() : router.replace('/');
  const plans = () => {
    const params = { ...(trip ? { journeyId: trip.id } : {}), ...(next ? { next } : {}), ...(feature ? { feature } : {}) };
    // Browsing prices is free, including for guests. Checkout asks for an
    // account only after they choose to buy or restore a purchase.
    router.replace({ pathname: '/paywall', params });
  };
  const reminder = trip ? preferences.reminders.find(r => r.journeyKey === trip.id) : null;
  const canRemind = billingAvailable && trip && !pro && (canSetProReminder(trip, now) || !!reminder);

  // iOS form sheets size a direct ScrollView child natively. An intervening
  // flex wrapper can have zero height on first presentation (but work on refresh).
  return <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, Spacing.four) }]}>
    <ProHeader onClose={close} closeLabel="Close Pro offer" />
      {reminding && trip && CONVEX_URL && userId ? <ReminderEditor trip={trip} userId={userId} saved={!!reminder} onDone={close} onPlans={plans} /> : <>
        <ProHero title={feature === 'postcard' ? 'Share postcards with Pro' : feature === 'claim' ? 'Prepare your claim with Pro' : 'What Pro adds'} trip={trip} />
        <ProBenefits />
        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>Updates where available. Family follows free.</ThemedText>
        <View style={styles.actions}>
        {pro ? <PrimaryButton label="Back to my trip" onPress={close} /> : billingAvailable ? <PrimaryButton label="See plans" onPress={plans} /> : <ThemedText type="small" themeColor="textSecondary">Pro purchases aren’t available in this build. If you already have Pro, sign in with that account.</ThemedText>}
        {canRemind && <Pressable accessibilityRole="button" style={[styles.secondary, { borderColor: theme.hairline }]} onPress={() => {
          if (!userId) { router.replace({ pathname: '/sign-in', params: { next: `/pro-offer?journeyId=${encodeURIComponent(trip.id)}&step=reminder` } }); return; }
          if (!CONVEX_URL) { Alert.alert('Reminders unavailable', 'Please try again when account sync is available.'); return; }
          setReminding(true);
        }}><ThemedText type="smallBold">{reminder ? 'Manage reminder' : 'Remind me 2 days before this trip'}</ThemedText></Pressable>}
        {trip && !pro && !canRemind && Date.parse(trip.scheduledDeparture) > now && <ThemedText type="small" themeColor="textSecondary">You’re flying soon. Choose Pro when you’re ready.</ThemedText>}
        <Pressable testID="pro-continue-free" accessibilityRole="button" style={({ pressed }) => [styles.continueFree, { opacity: pressed ? 0.7 : 1 }]} onPress={close}><ThemedText type="smallBold" themeColor="tint">{pro ? 'Close' : 'Continue free'}</ThemedText></Pressable>
        </View>
      </>}
  </ScrollView>;
}

function ReminderEditor({ trip, userId, saved, onDone, onPlans }: { trip: JourneyRow; userId: string; saved: boolean; onDone: () => void; onPlans: () => void }) {
  const mutate = useMutation(api.proPrompts.setReminder);
  const [busy, setBusy] = useState(false);
  const date = new Date(proReminderTime(trip)).toISOString();
  const now = useNow(60_000).getTime();
  const possible = canSetProReminder(trip, now);
  // A guest's flight is claimed and uploaded after sign-in. Wait for that
  // acknowledgement before asking the server to attach a reminder to it.
  const synced = trip.userId === userId && !!trip.syncedAt;
  async function change(action: 'set' | 'cancel') {
    if (busy) return;
    setBusy(true);
    try {
      await mutate({ userId, journeyKey: trip.id, action });
      showFlash(action === 'set' ? 'Reminder set' : 'Reminder cancelled', action === 'set' ? 'You’re still on Free. Nothing charged.' : undefined);
      onDone();
    } catch (error) {
      Alert.alert('Could not save reminder', error instanceof ConvexError ? String(error.data) : 'Check your connection and try again. Your flight is still saved.');
    } finally { setBusy(false); }
  }
  return <>
    <View style={styles.heading}>
      <ThemedText type="title" themeColor="heading" style={styles.title}>{saved ? 'Your Pro reminder' : possible ? 'Remind me before take-off' : 'You’re flying soon'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{possible || saved ? 'A little nudge. The choice stays yours.' : 'Choose Pro whenever you’re ready.'}</ThemedText>
    </View>
    {possible || saved ? <><ProReminderCard trip={trip} date={date} /><ProReminderSteps /></> : <ProHero title="Your next flight" trip={trip} />}
    {possible && !saved && !synced && <ThemedText type="small" themeColor="textSecondary">Your flight needs to finish syncing before you can set a reminder. Keep FlyRight open and connected.</ThemedText>}
    <View style={styles.actions}>
      <PrimaryButton label={saved || !possible ? 'See Pro plans' : busy ? 'Saving…' : 'Set reminder'} disabled={busy || (!saved && possible && !synced)} onPress={saved || !possible ? onPlans : () => void change('set')} />
      <Pressable accessibilityRole="button" style={({ pressed }) => [styles.continueFree, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]} disabled={busy} onPress={saved ? () => void change('cancel') : onDone}><ThemedText type="smallBold" themeColor="tint">{saved ? 'Cancel reminder' : 'Not now'}</ThemedText></Pressable>
    </View>
  </>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.three, maxWidth: Math.min(520, MaxContentWidth), width: '100%', alignSelf: 'center' },
  heading: { gap: Spacing.two },
  title: { fontSize: 28, lineHeight: 34 },
  footnote: { textAlign: 'center' },
  actions: { gap: Spacing.three, marginTop: Spacing.two },
  secondary: { borderWidth: 1, borderRadius: Spacing.three, minHeight: 56, padding: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  // Plus the body gap: at least the approved 24pt clear separation.
  continueFree: { marginTop: Spacing.two, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
});
