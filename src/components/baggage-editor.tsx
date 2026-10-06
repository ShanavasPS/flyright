import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Baggage } from '@/services/baggage';
import { tick } from '@/services/haptics';

type Choice<T> = { value: T; label: string };

/** The ticket's baggage, set part by part: the personal item and the
 * carry-on (included or not, the carry-on's weight), the checked bags (none
 * to three, the weight of each). Each part is optional — tapping the chosen
 * answer again clears it, since "not said" is not "not included". Used in
 * the trip details editor; `onFocusWeight` lets it keep a weight field in
 * view above the keyboard. */
export function BaggageEditor({
  value,
  onChange,
  onFocusWeight,
}: {
  value: Baggage;
  onChange: (next: Baggage) => void;
  onFocusWeight?: () => void;
}) {
  const set = (patch: Partial<Baggage>) => {
    const next: Baggage = { ...value, ...patch };
    for (const key of Object.keys(next) as (keyof Baggage)[]) if (next[key] == null) delete next[key];
    onChange(next);
  };
  const included: Choice<boolean>[] = [
    { value: true, label: 'Included' },
    { value: false, label: 'Not included' },
  ];
  const checked: Choice<number>[] = [
    { value: 0, label: 'None' },
    { value: 1, label: '1 bag' },
    { value: 2, label: '2 bags' },
    { value: 3, label: '3 bags' },
  ];
  return (
    <View style={styles.block}>
      <Part label="Personal item">
        <Chips testID="baggage-personal" choices={included} value={value.personal} onChange={(personal) => set({ personal })} />
      </Part>
      <Part label="Carry-on">
        <Chips
          testID="baggage-carry-on"
          choices={included}
          value={value.carryOn}
          onChange={(carryOn) => set({ carryOn, ...(carryOn ? {} : { carryOnKg: undefined }) })}
        />
        {value.carryOn && (
          <WeightField
            testID="baggage-carry-on-kg"
            label="Carry-on weight limit"
            hint="kg (optional)"
            value={value.carryOnKg}
            onChange={(carryOnKg) => set({ carryOnKg })}
            onFocus={onFocusWeight}
          />
        )}
      </Part>
      <Part label="Checked bags">
        <Chips
          testID="baggage-checked"
          choices={checked}
          value={value.checked}
          onChange={(count) => set({ checked: count, ...(count ? {} : { checkedKg: undefined }) })}
        />
        {!!value.checked && (
          <WeightField
            testID="baggage-checked-kg"
            label="Weight per bag"
            hint="kg per bag (optional)"
            value={value.checkedKg}
            onChange={(checkedKg) => set({ checkedKg })}
            onFocus={onFocusWeight}
          />
        )}
      </Part>
    </View>
  );
}

function Part({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.part}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

function Chips<T extends boolean | number>({
  choices,
  value,
  onChange,
  testID,
}: {
  choices: Choice<T>[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {choices.map((choice) => {
        const selected = value === choice.value;
        return (
          <Pressable
            key={String(choice.value)}
            testID={`${testID}-${String(choice.value)}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityHint={selected ? 'Tap again to clear' : undefined}
            onPress={() => {
              tick();
              onChange(selected ? undefined : choice.value);
            }}
            style={({ pressed }) => [
              styles.chip,
              {
                borderColor: selected ? theme.tint : theme.hairline,
                backgroundColor: selected ? `${theme.tint}22` : theme.backgroundElement,
              },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={selected ? { color: theme.tint } : undefined}>
              {choice.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function WeightField({
  label,
  hint,
  value,
  onChange,
  onFocus,
  testID,
}: {
  label: string;
  hint: string;
  value: number | undefined;
  onChange: (kg: number | undefined) => void;
  onFocus?: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.weight}>
      <TextInput
        testID={testID}
        accessibilityLabel={`${label} in kilos`}
        value={value ? String(value) : ''}
        onChangeText={(text) => {
          const kg = Number(text.replace(/\D/g, '').slice(0, 3));
          onChange(kg > 0 ? kg : undefined);
        }}
        onFocus={onFocus}
        keyboardType="number-pad"
        returnKeyType="done"
        placeholder="kg"
        placeholderTextColor={theme.textSecondary}
        style={[styles.weightInput, { color: theme.text, backgroundColor: theme.field, borderColor: theme.hairline }]}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {hint}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.three,
  },
  part: {
    gap: Spacing.two,
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
  pressed: {
    opacity: 0.7,
  },
  weight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  weightInput: {
    width: 88,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0,
  },
});
