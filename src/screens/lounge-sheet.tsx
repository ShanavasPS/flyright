/** One lounge on the travel day (docs/lounges.md, design A4): why this
 * traveller gets in, what to have ready at the desk, and when to leave.
 * FlyRight is never what the desk scans, so the main action opens the
 * saved boarding pass. */
import { useAuth } from '@clerk/expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { VerdictChip } from '@/components/lounge-card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { passNamer, useLoungeOptions } from '@/hooks/use-lounge-options';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { showFlash } from '@/services/flash';
import { hideLoungesFor } from '@/services/lounge-dismissals';
import { networkInfo, visitsLeftLabel } from '@/services/lounge-pass-logic';
import { isOngoing, logLoungeVisit } from '@/services/lounge-passes';
import { fixLine, leaveBy, leaveByLabel, onBooking, wayLine } from '@/services/lounge-trip';
import { describeMembership } from '@/services/loyalty-programmes';
import { useJourney } from '@/services/journeys';
import { factsFor } from '@/services/travel-day-lifecycle';

function hoursLabel(hours: { open: string; close: string } | null): string {
  if (!hours) return 'Not known';
  if (hours.open === '00:00' && hours.close === '24:00') return 'Open 24 h';
  return `${hours.open}–${hours.close === '24:00' ? '00:00' : hours.close}`;
}

function checkedLabel(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function LoungeSheet() {
  const theme = useTheme();
  const router = useRouter();
  const { userId } = useAuth();
  const { journeyId = '', lounge: loungeId = '' } = useLocalSearchParams<{ journeyId?: string; lounge?: string }>();
  const { row } = useJourney(journeyId, userId);
  const facts = row ? factsFor(row) : undefined;
  const result = useLoungeOptions(row, facts);
  const now = useNow(60_000).getTime();
  const option = result?.options.find((o) => o.lounge.loungeId === loungeId);
  if (!row || !result || !option) return <ThemedView style={styles.container} />;

  const { lounge, way } = option;
  const membership = way?.kind === 'status' ? result.memberships.find((m) => m.id === way.membershipId) : undefined;
  const programme = membership ? describeMembership(membership).name : null;
  const hasPass = !!row.passCode;
  const numberOnPass = membership ? onBooking(row, membership) === true : false;
  const until = leaveBy(row, result.zone, facts);
  const fix = fixLine(option, result.memberships, hasPass);
  const why = wayLine(option, result.memberships, row.number, passNamer(result.passes));

  const notToday = () => {
    hideLoungesFor(row.id);
    router.back();
  };

  // The pass a 'pass' visit uses, or the one whose fee a paid visit pays.
  const passId = way?.kind === 'pass' ? way.passId : way?.kind === 'pay' ? way.passId : null;
  const pass = passId ? result.passes.find((p) => p.id === passId) : undefined;
  const network = pass ? networkInfo(pass.network) : undefined;
  const openApp = () => {
    if (network) void Linking.openURL(Platform.OS === 'ios' ? network.ios : network.android);
  };
  const inLounge = result.visits.some((v) => v.journeyId === row.id && isOngoing(v, now, until));

  const enter = async () => {
    if (!way) return;
    await logLoungeVisit(userId, {
      journeyId: row.id,
      loungeId: lounge.loungeId,
      loungeName: lounge.name,
      airport: lounge.airport,
      way: way.kind,
      passId,
      paidCents: way.kind === 'pay' ? way.price.amount : null,
      currency: way.kind === 'pay' ? way.price.currency : null,
      leaveBy: until != null ? new Date(until).toISOString() : null,
    });
    const left = way.kind === 'pass' && way.visitsLeft != null ? way.visitsLeft - 1 : null;
    showFlash('Visit logged', network ? `${network.name} · ${visitsLeftLabel(left)}` : lounge.name);
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      {/* Plain layout, as in home-photo: a ScrollView inside a formSheet
          collapses on iOS 26+. The content fits the sheet. */}
      <View style={styles.content}>
        <View style={styles.head}>
          <View style={styles.chipRow}>
            <VerdictChip option={option} />
          </View>
          <ThemedText type="subtitle" themeColor="heading" accessibilityRole="header">
            {lounge.name}
          </ThemedText>
          {lounge.location && (
            <ThemedText type="small" themeColor="textSecondary">
              {lounge.location}
            </ThemedText>
          )}
        </View>

        <View style={styles.tiles}>
          <View style={[styles.tile, { backgroundColor: theme.field }]}>
            <ThemedText type="small" themeColor="textSecondary">Open</ThemedText>
            <ThemedText type="smallBold" themeColor="heading">{hoursLabel(lounge.hours)}</ThemedText>
          </View>
          {until != null && (
            <View style={[styles.tile, { backgroundColor: theme.field }]}>
              <ThemedText type="small" themeColor="textSecondary">Leave by</ThemedText>
              <ThemedText type="smallBold" themeColor="heading">{leaveByLabel(until, result.zone)}</ThemedText>
            </View>
          )}
        </View>

        {why && (
          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">Why you get in</ThemedText>
            <ThemedText type="default">{why}</ThemedText>
            {fix && (
              <ThemedText type="small" style={{ color: theme.warning }}>
                {fix}
              </ThemedText>
            )}
          </View>
        )}

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">Have ready at the desk</ThemedText>
          {network && (
            <View style={[styles.ready, { borderColor: theme.hairline }]}>
              <SymbolView name={{ ios: 'wallet.pass', android: 'badge', web: 'badge' }} size={22} tintColor={theme.heading} />
              <View style={styles.grow}>
                <ThemedText type="default" style={styles.strong}>
                  {network.name} card
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {network.desk}
                </ThemedText>
              </View>
              <Pressable accessibilityRole="button" onPress={openApp} hitSlop={8}>
                <ThemedText type="link">Open</ThemedText>
              </Pressable>
            </View>
          )}
          <View style={[styles.ready, { borderColor: theme.hairline }]}>
            <SymbolView name={{ ios: 'qrcode', android: 'qr_code_2', web: 'qr_code_2' }} size={22} tintColor={theme.heading} />
            <View style={styles.grow}>
              <ThemedText type="default" style={styles.strong}>Boarding pass</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {numberOnPass && programme
                  ? `Carries your ${programme} number, so the desk sees your status`
                  : 'The desk scans it'}
              </ThemedText>
            </View>
            {network && way?.kind === 'pass' && hasPass ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/boarding-pass', params: { journeyId: row.id } })}
                hitSlop={8}>
                <ThemedText type="link">Show</ThemedText>
              </Pressable>
            ) : (
              <ThemedText type="smallBold" style={{ color: hasPass ? theme.success : theme.textSecondary }}>
                {hasPass ? 'Saved' : 'Not saved'}
              </ThemedText>
            )}
          </View>
          {way?.kind === 'pay' && !way.passId && (
            <ThemedText type="small" themeColor="textSecondary">
              And a payment card: the desk charges at the door.
            </ThemedText>
          )}
        </View>

        <View style={styles.actions}>
          {network && way?.kind === 'pass' ? (
            <PrimaryButton label={`Open ${network.name}`} onPress={openApp} />
          ) : hasPass ? (
            <PrimaryButton
              label="Show boarding pass"
              onPress={() => router.push({ pathname: '/boarding-pass', params: { journeyId: row.id } })}
            />
          ) : (
            <PrimaryButton
              label="Add boarding pass"
              onPress={() => router.push({ pathname: '/add', params: { scan: '1', journeyId: row.id } })}
            />
          )}
          {!inLounge && way && (
            <Pressable
              testID="lounge-enter"
              accessibilityRole="button"
              onPress={() => void enter()}
              style={({ pressed }) => [styles.secondary, { borderColor: theme.hairline }, pressed && { opacity: 0.6 }]}>
              <ThemedText type="default" style={[styles.strong, { color: theme.tint }]}>
                I’m in the lounge
              </ThemedText>
            </Pressable>
          )}
          <View style={styles.links}>
            {membership && (
              <Pressable accessibilityRole="button" onPress={() => router.push('/memberships')} hitSlop={8}>
                <ThemedText type="link">Member number</ThemedText>
              </Pressable>
            )}
            <Pressable testID="lounge-not-today" accessibilityRole="button" onPress={notToday} hitSlop={8}>
              <ThemedText type="link">Not today</ThemedText>
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.checked}>
            Lounge details checked {checkedLabel(lounge.checkedOn)}. Desks decide on the day.
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, paddingTop: Spacing.four, gap: Spacing.three },
  head: { gap: Spacing.one },
  chipRow: { flexDirection: 'row' },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: 2 },
  section: { gap: Spacing.two },
  ready: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  grow: { flex: 1, minWidth: 0 },
  strong: { fontWeight: '600' },
  actions: { gap: Spacing.two },
  secondary: { alignItems: 'center', borderWidth: 1, borderRadius: Spacing.three, paddingVertical: Spacing.three - 1 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.five },
  checked: { textAlign: 'center' },
});
