import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { FormTextField, KeyboardForm } from '@/components/keyboard-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { noteSuccess, tapLight } from '@/services/haptics';
import {
  OTHER_PROGRAMME,
  PROGRAMMES,
  describeMembership,
  formatCount,
  nextTier,
  programmeById,
} from '@/services/loyalty-programmes';
import {
  addMembership,
  deleteMembership,
  updateMembership,
  useMembership,
  type MembershipInput,
} from '@/services/memberships';
import { HeaderButton } from '@/screens/journey-note';

type Draft = Record<
  'number' | 'customAirline' | 'customProgramme' | 'tier' | 'balance' | 'qualifying' | 'qualifyingTarget' | 'tierUntil' | 'expiringAmount' | 'expiringOn',
  string
>;

const EMPTY: Draft = {
  number: '',
  customAirline: '',
  customProgramme: '',
  tier: '',
  balance: '',
  qualifying: '',
  qualifyingTarget: '',
  tierUntil: '',
  expiringAmount: '',
  expiringOn: '',
};

/** "62 400" / "62,400" / "62400" → 62400; '' → null; anything else → NaN. */
function parseCount(text: string): number | null {
  const bare = text.replace(/[\s,.' ]/g, '');
  if (!bare) return null;
  return /^\d{1,9}$/.test(bare) ? Number(bare) : NaN;
}

/** "03/2027" or "3/27" → "2027-03"; '' → null; anything else → undefined. */
function parseMonth(text: string): string | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/.exec(t);
  if (!m) return undefined;
  const month = Number(m[1]);
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (month < 1 || month > 12) return undefined;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** "31/12/2026" → "2026-12-31"; '' → null; anything else → undefined. */
function parseDay(text: string): string | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(t);
  if (!m) return undefined;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function draftOf(row: NonNullable<ReturnType<typeof useMembership>>): Draft {
  const month = row.tierUntil ? `${row.tierUntil.slice(5, 7)}/${row.tierUntil.slice(0, 4)}` : '';
  const day = row.expiringOn
    ? `${row.expiringOn.slice(8, 10)}/${row.expiringOn.slice(5, 7)}/${row.expiringOn.slice(0, 4)}`
    : '';
  const count = (n: number | null) => (n == null ? '' : formatCount(n));
  return {
    number: row.number,
    customAirline: row.customAirline ?? '',
    customProgramme: row.customProgramme ?? '',
    tier: row.tier ?? '',
    balance: count(row.balance),
    qualifying: count(row.qualifying),
    qualifyingTarget: count(row.qualifyingTarget),
    tierUntil: month,
    expiringAmount: count(row.expiringAmount),
    expiringOn: day,
  };
}

/** Adds or edits one membership card. Adding starts with the programme
 * list; editing opens straight on the form. Only the number is required —
 * everything else is what the traveller wants the card to remember. */
export function MembershipEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { userId } = useAuth();
  const existing = useMembership(id);
  const [programme, setProgramme] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const editing = !!id;
  const chosen = programme ?? existing?.programme ?? null;
  const base = useMemo(() => (existing ? draftOf(existing) : EMPTY), [existing]);
  const values = draft ?? base;
  const dirty = !!chosen && (draft != null || (!!programme && programme !== existing?.programme));

  const set = (key: keyof Draft) => (text: string) => setDraft({ ...values, [key]: text });

  const save = async () => {
    if (!chosen || saving) return;
    const number = values.number.trim();
    if (!number) {
      Alert.alert('Membership number', 'Add the number from your card or the airline’s app.');
      return;
    }
    if (chosen === OTHER_PROGRAMME && !values.customAirline.trim() && !values.customProgramme.trim()) {
      Alert.alert('Which programme?', 'Name the airline or the programme so you can tell the card apart.');
      return;
    }
    const counts = {
      balance: parseCount(values.balance),
      qualifying: parseCount(values.qualifying),
      qualifyingTarget: parseCount(values.qualifyingTarget),
      expiringAmount: parseCount(values.expiringAmount),
    };
    if (Object.values(counts).some((n) => Number.isNaN(n))) {
      Alert.alert('Check the numbers', 'Miles and points are whole numbers, like 62 400.');
      return;
    }
    const tierUntil = parseMonth(values.tierUntil);
    if (tierUntil === undefined) {
      Alert.alert('Tier valid until', 'Enter the month and year, like 03/2027.');
      return;
    }
    const expiringOn = parseDay(values.expiringOn);
    if (expiringOn === undefined) {
      Alert.alert('Expiry date', 'Enter the date, like 31/12/2026.');
      return;
    }
    const input: MembershipInput = {
      programme: chosen,
      customAirline: chosen === OTHER_PROGRAMME ? values.customAirline.trim() || null : null,
      customProgramme: chosen === OTHER_PROGRAMME ? values.customProgramme.trim() || null : null,
      number,
      tier: values.tier.trim() || null,
      ...counts,
      tierUntil,
      expiringOn,
    } as MembershipInput;
    setSaving(true);
    try {
      if (editing && existing) await updateMembership(existing.id, input);
      else await addMembership(userId, input);
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
    Alert.alert('Discard this card?', undefined, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const remove = () => {
    if (!existing) return;
    const d = describeMembership(existing);
    Alert.alert(`Remove ${d.name}?`, 'The card and its number are removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteMembership(existing.id);
          router.back();
        },
      },
    ]);
  };

  const title = editing ? 'Edit membership' : chosen ? 'Add membership' : 'Choose a programme';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title,
          headerTitleAlign: 'center',
          headerLeft: () => <HeaderButton label="Cancel" onPress={cancel} />,
          headerRight: chosen
            ? () => <HeaderButton label="Save" bold disabled={!dirty || saving} onPress={save} />
            : undefined,
        }}
      />
      {editing && !existing ? null : !chosen ? (
        <ProgrammePicker
          onPick={(p) => {
            tapLight();
            setProgramme(p);
          }}
        />
      ) : (
        <MembershipForm
          programme={chosen}
          values={values}
          set={set}
          onSubmit={save}
          onChangeProgramme={editing ? undefined : () => setProgramme(null)}
          onRemove={editing ? remove : undefined}
        />
      )}
    </ThemedView>
  );
}

function ProgrammePicker({ onPick }: { onPick: (id: string) => void }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const list = PROGRAMMES.filter(
    (p) => !q || `${p.airline} ${p.name} ${p.carriers.join(' ')}`.toLowerCase().includes(q),
  );
  return (
    <KeyboardForm testID="programme-picker" contentContainerStyle={styles.content}>
      <View style={[styles.search, { backgroundColor: theme.field, borderColor: theme.hairline }]}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={theme.textSecondary} />
        <TextInput
          testID="programme-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Airline or programme"
          autoCapitalize="none"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: theme.text }]}
        />
      </View>
      <ThemedView type="backgroundElement" style={styles.list}>
        {list.map((p, i) => (
          <Pressable
            key={p.id}
            testID={`programme-${p.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${p.airline} ${p.name}`}
            onPress={() => onPick(p.id)}
            style={({ pressed }) => [
              styles.listRow,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
              pressed && styles.pressed,
            ]}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: p.card.from, experimental_backgroundImage: `linear-gradient(135deg, ${p.card.from} 0%, ${p.card.to} 100%)` },
              ]}>
              <View style={[styles.swatchStripe, { backgroundColor: p.card.accent }]} />
            </View>
            <View style={styles.listText}>
              <ThemedText style={styles.listTitle}>{p.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {p.airline}
                {p.alliance ? ` · ${p.alliance}` : ''}
              </ThemedText>
            </View>
          </Pressable>
        ))}
        <Pressable
          testID="programme-other"
          accessibilityRole="button"
          accessibilityLabel="Another programme, name it yourself"
          onPress={() => onPick(OTHER_PROGRAMME)}
          style={({ pressed }) => [
            styles.listRow,
            list.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
            pressed && styles.pressed,
          ]}>
          <View style={[styles.swatch, styles.otherSwatch, { borderColor: theme.textSecondary }]}>
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={14} tintColor={theme.textSecondary} />
          </View>
          <View style={styles.listText}>
            <ThemedText style={styles.listTitle}>Another programme</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Name it yourself
            </ThemedText>
          </View>
        </Pressable>
      </ThemedView>
    </KeyboardForm>
  );
}

function MembershipForm({
  programme,
  values,
  set,
  onSubmit,
  onChangeProgramme,
  onRemove,
}: {
  programme: string;
  values: Draft;
  set: (key: keyof Draft) => (text: string) => void;
  onSubmit: () => void;
  onChangeProgramme?: () => void;
  onRemove?: () => void;
}) {
  const theme = useTheme();
  const p = programmeById(programme);
  const other = programme === OTHER_PROGRAMME;
  const d = describeMembership({
    id: '',
    programme,
    customAirline: values.customAirline || null,
    customProgramme: values.customProgramme || null,
    number: values.number,
    tier: values.tier || null,
    balance: null,
    qualifying: null,
    qualifyingTarget: null,
    tierUntil: null,
    expiringAmount: null,
    expiringOn: null,
  });
  const next = nextTier({
    id: '',
    programme,
    customAirline: null,
    customProgramme: null,
    number: '',
    tier: values.tier || null,
    balance: null,
    qualifying: null,
    qualifyingTarget: null,
    tierUntil: null,
    expiringAmount: null,
    expiringOn: null,
  });
  // Inputs by field, for Next on the keyboard. A plain holder rather than
  // a ref: the field props are built during render.
  const [inputs] = useState<Partial<Record<keyof Draft, TextInput | null>>>(() => ({}));
  const order: (keyof Draft)[] = [
    ...(other ? (['customAirline', 'customProgramme'] as const) : []),
    'number',
    ...(other ? (['tier'] as const) : []),
    'balance',
    ...(d.statusUnit || other ? (['qualifying', 'qualifyingTarget'] as const) : []),
    'tierUntil',
    'expiringAmount',
    'expiringOn',
  ];
  const nextOf = (key: keyof Draft) => {
    const i = order.indexOf(key);
    return i >= 0 && i + 1 < order.length ? order[i + 1] : null;
  };
  const field = (key: keyof Draft) => ({
    ref: (node: TextInput | null) => {
      inputs[key] = node;
    },
    testID: `membership-${key}`,
    value: values[key],
    onChangeText: set(key),
    returnKeyType: nextOf(key) ? ('next' as const) : ('done' as const),
    submitBehavior: nextOf(key) ? ('submit' as const) : ('blurAndSubmit' as const),
    onSubmitEditing: () => {
      const n = nextOf(key);
      if (n) inputs[n]?.focus();
      else onSubmit();
    },
  });
  const statusUnit = d.statusUnit ?? 'status points';

  return (
    <KeyboardForm testID="membership-form" contentContainerStyle={styles.content}>
      <View
        style={[
          styles.preview,
          { backgroundColor: d.card.from, experimental_backgroundImage: `linear-gradient(135deg, ${d.card.from} 0%, ${d.card.to} 100%)` },
        ]}>
        <View style={[styles.previewStripe, { backgroundColor: d.card.accent }]} />
        <View style={styles.previewText}>
          <ThemedText style={styles.previewEyebrow} numberOfLines={1}>
            {d.airline.toUpperCase()}
          </ThemedText>
          <ThemedText style={styles.previewName} numberOfLines={1}>
            {d.name}
          </ThemedText>
        </View>
        {onChangeProgramme && (
          <Pressable accessibilityRole="button" onPress={onChangeProgramme} hitSlop={Spacing.two} style={styles.change}>
            <ThemedText type="smallBold" style={styles.changeText}>
              Change
            </ThemedText>
          </Pressable>
        )}
      </View>

      {other && (
        <>
          <FormTextField label="Airline" placeholder="e.g. Icelandair" autoCapitalize="words" {...field('customAirline')} />
          <FormTextField label="Programme" placeholder="e.g. Saga Club" autoCapitalize="words" {...field('customProgramme')} />
        </>
      )}

      <FormTextField
        label="Membership number"
        placeholder="As printed on your card"
        autoCapitalize="characters"
        autoCorrect={false}
        hint="Kept on this phone only. It stays hidden until you unlock it."
        {...field('number')}
      />

      {other ? (
        <FormTextField label="Tier" placeholder="e.g. Silver" autoCapitalize="words" {...field('tier')} />
      ) : (
        p && (
          <View style={styles.tierBlock}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.groupLabel}>
              Tier
            </ThemedText>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {p.tiers.map((t, i) => {
                const selected = values.tier ? values.tier === t.name : i === 0;
                return (
                  <Pressable
                    key={t.name}
                    testID={`membership-tier-${t.name}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => set('tier')(i === 0 ? '' : t.name)}
                    style={[
                      styles.chip,
                      { borderColor: selected ? theme.tint : theme.hairline, backgroundColor: selected ? `${theme.tint}22` : theme.backgroundElement },
                    ]}>
                    <ThemedText type="smallBold" style={selected ? { color: theme.tint } : undefined}>
                      {t.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )
      )}

      <FormTextField
        label={`${d.currency} balance`}
        placeholder="Optional"
        keyboardType="number-pad"
        {...field('balance')}
      />

      {(d.statusUnit || other) && (
        <View style={styles.pair}>
          <FormTextField
            containerStyle={styles.half}
            label={`${statusUnit[0].toUpperCase()}${statusUnit.slice(1)} so far`}
            placeholder="Optional"
            keyboardType="number-pad"
            {...field('qualifying')}
          />
          <FormTextField
            containerStyle={styles.half}
            label={next ? `Needed for ${next.name}` : 'Next tier at'}
            placeholder={next?.threshold ? formatCount(next.threshold) : 'Optional'}
            keyboardType="number-pad"
            {...field('qualifyingTarget')}
          />
        </View>
      )}

      <FormTextField
        label="Tier valid until"
        placeholder="MM/YYYY"
        keyboardType="numbers-and-punctuation"
        {...field('tierUntil')}
      />

      <View style={styles.pair}>
        <FormTextField
          containerStyle={styles.half}
          label="Expiring"
          accessibilityLabel={`${d.currency} expiring`}
          placeholder="Optional"
          keyboardType="number-pad"
          {...field('expiringAmount')}
        />
        <FormTextField
          containerStyle={styles.half}
          label="On"
          placeholder="DD/MM/YYYY"
          keyboardType="numbers-and-punctuation"
          {...field('expiringOn')}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.groupLabel}>
        Copy these from your airline’s app when they change. FlyRight never signs in to your account.
      </ThemedText>

      {onRemove && (
        <Pressable
          testID="membership-remove"
          accessibilityRole="button"
          onPress={onRemove}
          style={({ pressed }) => [styles.remove, { backgroundColor: theme.backgroundElement }, pressed && styles.pressed]}>
          <ThemedText style={{ color: theme.danger, fontWeight: 600 }}>Remove membership</ThemedText>
        </Pressable>
      )}
    </KeyboardForm>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0,
    paddingVertical: Spacing.two,
  },
  list: {
    borderRadius: Spacing.four,
    overflow: 'hidden',
  },
  listRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  swatch: {
    width: 44,
    height: 30,
    borderRadius: 6,
    padding: 5,
  },
  swatchStripe: {
    width: 3,
    height: 12,
    borderRadius: 2,
  },
  otherSwatch: {
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listText: {
    flex: 1,
    gap: 1,
  },
  listTitle: {
    fontWeight: 600,
  },
  preview: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: 18,
  },
  previewStripe: {
    width: 5,
    height: 28,
    borderRadius: 3,
  },
  previewText: {
    flex: 1,
  },
  previewEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: 600,
    letterSpacing: 1.5,
    color: '#B8C3D6',
  },
  previewName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 700,
    color: '#FFFFFF',
  },
  change: {
    minHeight: 32,
    justifyContent: 'center',
  },
  changeText: {
    color: '#A9C4F5',
  },
  tierBlock: {
    gap: Spacing.two,
  },
  groupLabel: {
    marginLeft: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pair: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  half: {
    flex: 1,
  },
  remove: {
    marginTop: Spacing.two,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
