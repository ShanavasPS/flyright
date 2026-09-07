import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { localDateString } from '@/services/dates';
import { formatDay } from '@/services/world-period';

export type DateFieldProps = {
  label: string;
  /** `YYYY-MM-DD`. */
  value: string;
  min?: string;
  max?: string;
  onChange: (day: string) => void;
};

/** Noon local, so a picker that hands back the same instant never rounds the
 * day across a DST edge. */
function toDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

/** A labelled date, edited in the platform's own date control.
 *
 * iOS: the compact system picker, which is its own tappable field and pops
 * the calendar over the map. Android: a chip that opens the Material date
 * dialog — the dialog is mounted on tap and unmounted on OK or cancel, the
 * contract the community picker's `presentation="dialog"` asks for. Web
 * (date-field.web.tsx) uses the browser's date input. */
export function DateField({ label, value, min, max, onChange }: DateFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.field}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <DateTimePicker
          value={toDate(value)}
          mode="date"
          display="compact"
          minimumDate={min ? toDate(min) : undefined}
          maximumDate={max ? toDate(max) : undefined}
          accentColor={theme.tint}
          // The compact control reports no intrinsic size to Yoga; unsized,
          // two of them collapse onto each other.
          style={styles.compact}
          onValueChange={(_event, picked) => onChange(localDateString(picked))}
        />
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${formatDay(value)}`}
        onPress={() => setOpen(true)}
        style={[styles.chip, { backgroundColor: theme.field }]}>
        <ThemedText type="smallBold" themeColor="tint">
          {formatDay(value)}
        </ThemedText>
      </Pressable>
      {open && (
        <DateTimePicker
          value={toDate(value)}
          mode="date"
          presentation="dialog"
          minimumDate={min ? toDate(min) : undefined}
          maximumDate={max ? toDate(max) : undefined}
          accentColor={theme.tint}
          onDismiss={() => setOpen(false)}
          onValueChange={(_event, picked) => {
            setOpen(false);
            onChange(localDateString(picked));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  compact: {
    width: 128,
    height: 34,
  },
  chip: {
    height: 32,
    paddingHorizontal: Spacing.three,
    borderRadius: 16,
    justifyContent: 'center',
  },
});
