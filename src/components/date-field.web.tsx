import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { DateFieldProps } from './date-field';

/** Web: the browser's own date input, styled as the app's chip. */
export function DateField({ label, value, min, max, onChange }: DateFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <input
        type="date"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          if (e.currentTarget.value) onChange(e.currentTarget.value);
        }}
        style={{
          height: 32,
          paddingInline: Spacing.three,
          borderRadius: 16,
          border: 'none',
          backgroundColor: theme.field,
          color: theme.tint,
          fontWeight: 600,
          fontFamily: 'inherit',
          fontSize: 14,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
