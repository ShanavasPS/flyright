import { useAuth, useUser } from '@clerk/expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { confirmServerPro } from '@/services/pro-access';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { openBrowserAsync } from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';

import { PrimaryButton } from '@/components/primary-button';
import { ProHeader, ProHero } from '@/components/pro-presentation';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { entitledToPro, getAppUserId, getCurrentOffering, logInPurchases, purchase, restorePurchases } from '@/services/purchases';
import { planName, planPrice, sortPlans } from '@/services/pro-plans';

/** Acquisition uses the store's actual packages and prices. Named subscriber
 * offerings still use RevenueCat's change-plan screen. */
export function ProPlans({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const theme = useTheme();
  const { userId } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string; journeyId?: string; feature?: string; packageId?: string }>();
  const signIn = () => {
    const returnParams = {
      ...Object.fromEntries(Object.entries(params).filter(([,v]) => typeof v === 'string')),
      ...(selected ? { packageId: selected } : {}),
    };
    router.replace({ pathname: '/sign-in', params: { next: `/paywall?${new URLSearchParams(returnParams)}` } });
  };
  const finish = async () => { await confirmServerPro().catch(() => false); onUnlocked(); };
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<string | null>(() => typeof params.packageId === 'string' ? params.packageId : null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const load = useCallback(() => getCurrentOffering().then(offering => {
    if (!mounted.current) return;
    const available = sortPlans(offering?.availablePackages ?? []);
    setPlans(available);
    setSelected(current => available.some(p => p.identifier === current) ? current : available[0]?.identifier ?? null);
    if (!available.length) setError('Plans are unavailable right now. Your flights are still saved.');
  }).catch(() => {
    if (mounted.current) setError('Couldn’t load prices. Check your connection and try again.');
  }).finally(() => { if (mounted.current) setLoading(false); }), []);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);
  const choice = plans.find(p => p.identifier === selected);
  async function buy() {
    if (!choice || busy) return;
    if (!userId) { signIn(); return; }
    setBusy(true);
    await logInPurchases(userId, user?.primaryEmailAddress?.emailAddress);
    if (await getAppUserId() !== userId) {
      setBusy(false);
      Alert.alert('Sign-in not ready', 'Reconnect and try again so your purchase belongs to this account.');
      return;
    }
    const result = await purchase(choice);
    if (result.status === 'purchased' && entitledToPro(result.customerInfo)) await finish();
    else if (result.status === 'purchased') Alert.alert('Purchase pending', 'Pro will unlock when the store confirms your purchase.');
    else if (result.status === 'error') Alert.alert('Purchase didn’t complete', result.message);
    if (mounted.current) setBusy(false);
  }
  async function restore() {
    if (busy) return;
    if (!userId) { signIn(); return; }
    setBusy(true);
    await logInPurchases(userId);
    if (await getAppUserId() !== userId) {
      setBusy(false);
      Alert.alert('Sign-in not ready', 'Reconnect and try again to restore to this account.');
      return;
    }
    const active = await restorePurchases();
    if (active) await finish();
    else Alert.alert('No active purchase restored', 'Check the store account you purchased with, or try again when connected.');
    if (mounted.current) setBusy(false);
  }
  return <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, Spacing.four) }]}>
    <ProHeader onClose={onClose} closeLabel="Close plans" disabled={busy} />
    <ProHero title="Pro when you travel." plans />
    <View style={styles.sectionHeading}>
      <ThemedText type="smallBold">Choose your plan</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">All your trips</ThemedText>
    </View>
      {loading && <ActivityIndicator accessibilityLabel="Loading plans" />}
      {error && <><ThemedText type="small">{error}</ThemedText><PrimaryButton label="Try again" onPress={() => { setLoading(true); setError(null); void load(); }} /></>}
      <View style={styles.plans}>
        {plans.map(p => {
          const checked = selected === p.identifier;
          return <Pressable key={p.identifier} accessibilityRole="radio" accessibilityLabel={`${planName(p)}, ${planPrice(p)}`} accessibilityState={{ checked, disabled: busy }} disabled={busy} onPress={() => setSelected(p.identifier)} style={({ pressed }) => [styles.plan, { borderColor: checked ? theme.tint : theme.hairline, backgroundColor: pressed ? theme.backgroundSelected : checked ? theme.tint + '08' : theme.backgroundElement }]}>
            <View style={[styles.radio, { borderColor: checked ? theme.tint : theme.textSecondary, backgroundColor: checked ? theme.tint : 'transparent' }]} accessible={false} importantForAccessibility="no-hide-descendants">
              {checked && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={14} weight="semibold" tintColor="#FFFFFF" />}
            </View>
            <View style={styles.planCopy}>
              <View style={styles.planTop}>
                <ThemedText type="smallBold" style={styles.planName}>{planName(p)}</ThemedText>
                <ThemedText type="smallBold">{planPrice(p)}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{p.packageType === 'MONTHLY' ? 'For the month you fly.' : p.packageType === 'ANNUAL' ? 'For a year of going places.' : p.packageType === 'LIFETIME' ? 'One payment. No renewals.' : p.product.subscriptionPeriod ? 'Renews until cancelled.' : 'A one-time purchase.'}</ThemedText>
            </View>
          </Pressable>;
        })}
      </View>
      {choice && <>
        {!userId && <ThemedText type="small" themeColor="textSecondary">Sign in to keep Pro with your account.</ThemedText>}
        <PrimaryButton label={busy ? 'Please wait…' : `Continue · ${planPrice(choice)}`} disabled={busy} onPress={() => void buy()} />
        <ThemedText type="small" themeColor="textSecondary">{choice.product.subscriptionPeriod
          ? 'Renews until cancelled in store settings. Pro stays active through your paid period. The store confirms any introductory offer before you pay.'
          : `${choice.product.priceString}, one payment. No recurring subscription.`}</ThemedText>
      </>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={({ pressed }) => [styles.continueFree, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]} onPress={onClose}><ThemedText type="smallBold" themeColor="tint">Continue free</ThemedText></Pressable>
      <View style={[styles.footer, { borderTopColor: theme.hairline }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>{'Your flights and memories stay yours.\nLive updates where available.'}</ThemedText>
        <Pressable accessibilityRole="button" disabled={busy} style={styles.link} onPress={() => void restore()}><ThemedText type="small" themeColor="tint">Restore purchases</ThemedText></Pressable>
        <View style={styles.legal}>
          {['Privacy policy', 'Terms of Use'].map((label, index) => <Pressable key={label} accessibilityRole="link" style={styles.link} onPress={() => void openBrowserAsync(`https://getflyright.com/${index ? 'terms' : 'privacy'}`)}><ThemedText type="small" themeColor="textSecondary">{label}</ThemedText></Pressable>)}
        </View>
      </View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: Math.min(520, MaxContentWidth), alignSelf: 'center' },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, marginTop: Spacing.two },
  plans: { gap: Spacing.two },
  plan: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  radio: { width: 24, height: 24, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  planCopy: { flex: 1, gap: Spacing.one }, planName: { fontSize: 16, lineHeight: 24 },
  planTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: Spacing.two, rowGap: Spacing.one },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  continueFree: { marginTop: Spacing.two, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three, gap: Spacing.two }, centered: { textAlign: 'center' },
  legal: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: Spacing.four },
});
