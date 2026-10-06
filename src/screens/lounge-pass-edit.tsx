import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { FormTextField, KeyboardForm } from '@/components/keyboard-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { noteSuccess, tapLight } from '@/services/haptics';
import { NETWORKS, networkInfo } from '@/services/lounge-pass-logic';
import {
  addLoungePass,
  deleteLoungePass,
  updateLoungePass,
  useLoungePass,
  type LoungePassInput,
  type LoungePassRow,
} from '@/services/lounge-passes';
import { HeaderButton } from '@/screens/journey-note';
import { parseCount, parseDay } from '@/screens/membership-edit';

type Draft = Record<'plan' | 'number' | 'freeVisits' | 'usedBefore' | 'renewsOn' | 'extraVisit' | 'guest' | 'currency', string>;

const EMPTY: Draft = {
  plan: '',
  number: '',
  freeVisits: '',
  usedBefore: '',
  renewsOn: '',
  extraVisit: '',
  guest: '',
  currency: 'EUR',
};

/** "35" or "35.50" → 3500 / 3550 minor units; '' → null; else NaN. */
function parsePrice(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  return /^\d{1,5}(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : NaN;
}

const priceText = (cents: number | null) => (cents == null ? '' : String(cents % 100 ? (cents / 100).toFixed(2) : cents / 100));

function draftOf(row: LoungePassRow): Draft {
  return {
    plan: row.plan ?? '',
    number: row.number,
    freeVisits: row.freeVisits == null ? '' : String(row.freeVisits),
    usedBefore: row.usedBefore ? String(row.usedBefore) : '',
    renewsOn: row.renewsOn ? `${row.renewsOn.slice(8, 10)}/${row.renewsOn.slice(5, 7)}/${row.renewsOn.slice(0, 4)}` : '',
    extraVisit: priceText(row.extraVisitCents),
    guest: priceText(row.guestCents),
    currency: row.currency ?? 'EUR',
  };
}

/** Adds or edits a lounge pass (docs/lounges.md, design B2). The free
 * visits and "used so far" are typed once, so the count is right from the
 * first day; FlyRight never signs in to the pass company. */
export function LoungePassEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { userId } = useAuth();
  const existing = useLoungePass(id);
  const editing = !!id;
  const [network, setNetwork] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = network ?? existing?.network ?? NETWORKS[0].id;
  const base = useMemo(() => (existing ? draftOf(existing) : EMPTY), [existing]);
  const values = draft ?? base;
  const dirty = draft != null || (network != null && network !== existing?.network);
  const set = (key: keyof Draft) => (text: string) => setDraft({ ...values, [key]: text });
  const [inputs] = useState<Partial<Record<keyof Draft, TextInput | null>>>(() => ({}));
  const order: (keyof Draft)[] = ['plan', 'number', 'freeVisits', 'usedBefore', 'renewsOn', 'extraVisit', 'guest', 'currency'];

  const save = async () => {
    if (saving) return;
    const number = values.number.trim();
    if (!number) {
      Alert.alert('Membership number', 'Add the number from the pass or its app.');
      return;
    }
    const freeVisits = parseCount(values.freeVisits);
    const usedBefore = parseCount(values.usedBefore);
    if (Number.isNaN(freeVisits) || Number.isNaN(usedBefore)) {
      Alert.alert('Check the visits', 'Visits are whole numbers, like 10. Leave free visits empty for unlimited.');
      return;
    }
    const renewsOn = parseDay(values.renewsOn);
    if (renewsOn === undefined) {
      Alert.alert('Renews on', 'Enter the date, like 31/03/2027.');
      return;
    }
    const extraVisitCents = parsePrice(values.extraVisit);
    const guestCents = parsePrice(values.guest);
    if (Number.isNaN(extraVisitCents) || Number.isNaN(guestCents)) {
      Alert.alert('Check the prices', 'Enter amounts like 35 or 35.50.');
      return;
    }
    const currency = values.currency.trim().toUpperCase();
    if ((extraVisitCents != null || guestCents != null) && !/^[A-Z]{3}$/.test(currency)) {
      Alert.alert('Currency', 'Use the three-letter code, like EUR or USD.');
      return;
    }
    const input: LoungePassInput = {
      network: chosen,
      plan: values.plan.trim() || null,
      number,
      freeVisits,
      usedBefore: usedBefore ?? 0,
      renewsOn,
      extraVisitCents,
      guestCents,
      currency: currency || null,
    };
    setSaving(true);
    try {
      if (editing && existing) await updateLoungePass(existing.id, input);
      else await addLoungePass(userId, input);
      noteSuccess();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert('Discard this pass?', undefined, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const remove = () => {
    if (!existing) return;
    const name = networkInfo(existing.network)?.name ?? 'this pass';
    Alert.alert(`Remove ${name}?`, 'The pass and its number are removed from this phone. Logged visits stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteLoungePass(existing.id);
          router.back();
        },
      },
    ]);
  };

  const field = (key: keyof Draft) => {
    const i = order.indexOf(key);
    const next = i + 1 < order.length ? order[i + 1] : null;
    return {
      ref: (node: TextInput | null) => {
        inputs[key] = node;
      },
      testID: `lounge-pass-${key}`,
      value: values[key],
      onChangeText: set(key),
      returnKeyType: next ? ('next' as const) : ('done' as const),
      submitBehavior: next ? ('submit' as const) : ('blurAndSubmit' as const),
      onSubmitEditing: () => {
        if (next) inputs[next]?.focus();
        else void save();
      },
    };
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: editing ? 'Edit lounge pass' : 'Add lounge pass',
          headerTitleAlign: 'center',
          headerLeft: () => <HeaderButton label="Cancel" onPress={cancel} />,
          headerRight: () => <HeaderButton label="Save" bold disabled={(!dirty && editing) || saving} onPress={save} />,
        }}
      />
      {editing && !existing ? null : (
        <KeyboardForm testID="lounge-pass-form" contentContainerStyle={styles.content}>
          <View style={styles.group}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.groupLabel}>
              Network
            </ThemedText>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {NETWORKS.map((n) => {
                const selected = n.id === chosen;
                return (
                  <Pressable
                    key={n.id}
                    testID={`lounge-pass-network-${n.id}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      tapLight();
                      setNetwork(n.id);
                    }}
                    style={[
                      styles.chip,
                      { borderColor: selected ? theme.tint : theme.hairline, backgroundColor: selected ? `${theme.tint}22` : theme.backgroundElement },
                    ]}>
                    <ThemedText type="smallBold" style={selected ? { color: theme.tint } : undefined}>
                      {n.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <FormTextField label="Plan" placeholder="Optional, e.g. Standard Plus" autoCapitalize="words" {...field('plan')} />
          <FormTextField label="Membership number" placeholder="From the card or the app" autoCapitalize="characters" autoCorrect={false} {...field('number')} />
          <View style={styles.pair}>
            <FormTextField
              containerStyle={styles.half}
              label="Free visits a year"
              placeholder="Empty: unlimited"
              keyboardType="number-pad"
              {...field('freeVisits')}
            />
            <FormTextField containerStyle={styles.half} label="Used so far" placeholder="0" keyboardType="number-pad" {...field('usedBefore')} />
          </View>
          <FormTextField label="Renews on" placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" {...field('renewsOn')} />
          <View style={styles.pair}>
            <FormTextField
              containerStyle={styles.half}
              label="Extra visit"
              placeholder="e.g. 35"
              keyboardType="decimal-pad"
              {...field('extraVisit')}
            />
            <FormTextField containerStyle={styles.half} label="Guest" placeholder="e.g. 35" keyboardType="decimal-pad" {...field('guest')} />
          </View>
          <FormTextField label="Currency" placeholder="EUR" autoCapitalize="characters" autoCorrect={false} maxLength={3} {...field('currency')} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.groupLabel}>
            Copy these from the pass company’s app. FlyRight counts the visits you log here and never signs in to your account.
            The pass stays on this phone.
          </ThemedText>

          {editing && (
            <Pressable
              testID="lounge-pass-remove"
              accessibilityRole="button"
              onPress={remove}
              style={({ pressed }) => [styles.remove, { backgroundColor: theme.backgroundElement }, pressed && styles.pressed]}>
              <ThemedText style={{ color: theme.danger, fontWeight: 600 }}>Remove pass</ThemedText>
            </Pressable>
          )}
        </KeyboardForm>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  pressed: { opacity: 0.7 },
  group: { gap: Spacing.two },
  groupLabel: { marginLeft: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pair: { flexDirection: 'row', gap: Spacing.two },
  half: { flex: 1 },
  remove: { marginTop: Spacing.two, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
