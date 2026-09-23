import { useAuth } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { CONVEX_URL } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { billingAvailable, useHasPro, useProReady } from '@/services/purchases';
import { dismissHomeProCard, markProIntroductionSeen, useProPreferences } from '@/services/pro-prompts';
import type { JourneyRow } from '@/services/journeys';
import { formatDayLabel, formatTime } from '@/services/dates';
import { airportZone } from '@/services/airports';
import { useNow } from '@/hooks/use-now';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { proTripUpcoming } from '../../convex/proShared';

/** One home entry for all owned trips; a dismissal never hides the detail entry. */
export function ProTripCard({ trip, home = false }: { trip: JourneyRow; home?: boolean }) {
  const { userId } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const pro = useHasPro();
  const customer = useProReady();
  const preferences = useProPreferences(userId);
  const now = useNow().getTime();
  const upcoming = proTripUpcoming(trip, now);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const { height } = useWindowDimensions();
  const card = useRef<View>(null);
  const [introducedThisVisit, setIntroducedThisVisit] = useState(false);
  const [consumedThisVisit, setConsumedThisVisit] = useState(false);
  const resolved = preferences.loaded && (!userId || !CONVEX_URL || preferences.remoteLoaded);
  const intro = home && resolved && !consumedThisVisit && (!preferences.introductionSeen || introducedThisVisit);

  useFocusEffect(useCallback(() => () => { setIntroducedThisVisit(false); setConsumedThisVisit(true); }, []));
  useEffect(() => {
    if (!upcoming || !intro || introducedThisVisit || !focused || pro || !customer || preferences.homeDismissed) return;
    const inspect = () => card.current?.measureInWindow((_x, y, _width, h) => {
      if (h > 0 && y >= 0 && y + Math.min(h / 2, 120) < height - 70) {
        setIntroducedThisVisit(true);
        markProIntroductionSeen(userId);
      }
    });
    inspect();
    const timer = setInterval(inspect, 1000);
    return () => clearInterval(timer);
  }, [upcoming, intro, introducedThisVisit, focused, pro, customer, preferences.homeDismissed, height, userId]);

  if (!upcoming || !billingAvailable || pro || !customer || (home && (!resolved || preferences.homeDismissed))) return null;
  const open = () => {
    markProIntroductionSeen(userId);
    setConsumedThisVisit(true);
    router.push({ pathname: '/pro-offer', params: { journeyId: trip.id } });
  };
  const reminder = preferences.reminders.find(r => r.journeyKey === trip.id);
  const due = !!reminder && reminder.remindAt <= now && proTripUpcoming(trip, now);
  const zone = airportZone(trip.fromCode);
  return (
    <View ref={card} collapsable={false} style={home ? { marginBottom: Spacing.three } : undefined} testID={home ? 'pro-home-card' : 'pro-trip-card'}>
      {intro && !due ? (
        <Card style={[styles.intro, { borderColor: theme.hairline }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">FlyRight Pro</ThemedText>
          <ThemedText type="smallBold" style={styles.title}>Extra help when you travel.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Live flight updates, postcards for your people and help preparing a delay claim.</ThemedText>
          <ThemedText type="small">Your family follows for free.</ThemedText>
          <PrimaryButton label="See Pro for this trip" onPress={open} />
          <Pressable accessibilityRole="button" style={styles.link} onPress={() => {
            markProIntroductionSeen(userId); setConsumedThisVisit(true);
          }}><ThemedText type="small" themeColor="textSecondary">Not now</ThemedText></Pressable>
        </Card>
      ) : (
        <View style={[styles.row, { borderColor: theme.hairline, backgroundColor: theme.backgroundElement }]}>
          <View style={styles.copy}>
            <ThemedText type="smallBold" themeColor="textSecondary">{due ? 'Your Pro reminder' : 'Live updates off'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{due ? `${trip.fromCode} → ${trip.toCode} · ${formatDayLabel(trip.scheduledDeparture, zone)}` : home ? 'For your upcoming flights' : 'For this trip'}</ThemedText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`See Pro for ${trip.number || 'this trip'}`} style={styles.link} onPress={open}>
            <ThemedText type="smallBold" themeColor="tint">See Pro</ThemedText>
          </Pressable>
          {home && <Pressable testID="pro-home-dismiss" accessibilityRole="button" accessibilityLabel="Hide live updates card from home" style={styles.close} onPress={() => dismissHomeProCard(userId)}>
            <ThemedText themeColor="textSecondary" style={styles.cross}>×</ThemedText>
          </Pressable>}
        </View>
      )}
      {due && userId && CONVEX_URL && <DismissReminder userId={userId} journeyKey={trip.id} />}
      {!home && reminder && !due && <Pressable accessibilityRole="button" style={styles.reminder} onPress={() => router.push({ pathname: '/pro-offer', params: { journeyId: trip.id, step: 'reminder' } })}>
        <ThemedText type="small" themeColor="textSecondary">Pro reminder · {formatDayLabel(new Date(reminder.remindAt).toISOString(), zone)} · {formatTime(new Date(reminder.remindAt).toISOString(), zone)} · Manage</ThemedText>
      </Pressable>}
    </View>
  );
}

function DismissReminder({ userId, journeyKey }: { userId: string; journeyKey: string }) {
  const update = useMutation(api.proPrompts.setReminder);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return <Pressable accessibilityRole="button" disabled={busy} style={styles.reminder} onPress={() => {
    setBusy(true); setFailed(false);
    void update({ userId, journeyKey, action: 'dismiss' }).catch(() => setFailed(true)).finally(() => setBusy(false));
  }}><ThemedText type="small" themeColor="textSecondary">{failed ? 'Couldn’t dismiss · Try again' : busy ? 'Dismissing…' : 'Dismiss this reminder'}</ThemedText></Pressable>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: Spacing.three },
  copy: { flex: 1, paddingLeft: Spacing.two },
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.two },
  close: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  cross: { fontSize: 24 },
  intro: { borderWidth: StyleSheet.hairlineWidth, gap: Spacing.three },
  title: { fontSize: 20 },
  reminder: { padding: Spacing.two, minHeight: 44, justifyContent: 'center' },
});
