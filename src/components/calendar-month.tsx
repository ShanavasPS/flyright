import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { localDateString } from '@/services/dates';

type CalendarMonthProps = {
  /** Selected day as 'YYYY-MM-DD', or null before the first pick. */
  value: string | null;
  minDate: Date;
  maxDate: Date;
  onSelect: (day: string) => void;
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const pad = (n: number) => `${n}`.padStart(2, '0');
const isoOf = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;
/** Months since year 0 — a single comparable number per calendar month. */
const monthIndex = (year: number, month: number) => year * 12 + month;

/** In-app month calendar, replacing the platform date pickers on this screen:
 * the Android Material inline picker renders a fixed ~500dp tall widget that
 * overflows small screens, and neither platform's widget matches the theme.
 * Steppers for both month and year keep decades-old journal dates reachable
 * without spinning through hundreds of months. */
export function CalendarMonth({ value, minDate, maxDate, onSelect }: CalendarMonthProps) {
  const theme = useTheme();
  const todayIso = localDateString(new Date());

  const initial = value ? new Date(`${value}T12:00:00`) : new Date();
  const [visible, setVisible] = useState(() => ({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  }));

  const minMonth = monthIndex(minDate.getFullYear(), minDate.getMonth());
  const maxMonth = monthIndex(maxDate.getFullYear(), maxDate.getMonth());
  const shiftMonths = (delta: number) => {
    const clamped = Math.min(maxMonth, Math.max(minMonth, monthIndex(visible.year, visible.month) + delta));
    setVisible({ year: Math.floor(clamped / 12), month: clamped % 12 });
  };
  const current = monthIndex(visible.year, visible.month);

  // Monday-first grid: cells before the 1st and after the last day are null.
  const firstWeekday = (new Date(visible.year, visible.month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(visible.year, visible.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const minIso = localDateString(minDate);
  const maxIso = localDateString(maxDate);

  const stepper = (label: string, onStep: (delta: number) => void, canBack: boolean, canForward: boolean) => (
    <View style={styles.stepper}>
      <Pressable
        accessibilityLabel={`Previous ${label === `${visible.year}` ? 'year' : 'month'}`}
        disabled={!canBack}
        hitSlop={Spacing.two}
        onPress={() => onStep(-1)}>
        <ThemedText themeColor={canBack ? 'tint' : 'textSecondary'} style={styles.chevron}>
          ‹
        </ThemedText>
      </Pressable>
      <ThemedText type="smallBold" style={styles.stepperLabel}>
        {label}
      </ThemedText>
      <Pressable
        accessibilityLabel={`Next ${label === `${visible.year}` ? 'year' : 'month'}`}
        disabled={!canForward}
        hitSlop={Spacing.two}
        onPress={() => onStep(1)}>
        <ThemedText themeColor={canForward ? 'tint' : 'textSecondary'} style={styles.chevron}>
          ›
        </ThemedText>
      </Pressable>
    </View>
  );

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        {stepper(MONTHS[visible.month], shiftMonths, current > minMonth, current < maxMonth)}
        {/* Year jumps clamp into range, so the same bounds enable them. */}
        {stepper(
          `${visible.year}`,
          (delta) => shiftMonths(delta * 12),
          current > minMonth,
          current < maxMonth,
        )}
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((day, i) => (
          <ThemedText
            key={`${day}-${i}`}
            type="small"
            themeColor="textSecondary"
            style={styles.weekday}>
            {day}
          </ThemedText>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={styles.week}>
          {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
            if (!day) return <View key={i} style={styles.day} />;
            const iso = isoOf(visible.year, visible.month, day);
            const disabled = iso < minIso || iso > maxIso;
            const selected = iso === value;
            const isToday = iso === todayIso;
            return (
              <Pressable
                key={i}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={iso}
                onPress={() => onSelect(iso)}
                style={styles.day}>
                <View
                  style={[
                    styles.dayInner,
                    selected && { backgroundColor: theme.tint },
                    !selected && isToday && { borderWidth: 1.5, borderColor: theme.tint },
                  ]}>
                  <ThemedText
                    type={selected || isToday ? 'smallBold' : 'small'}
                    style={[
                      disabled && styles.dayDisabled,
                      selected && styles.daySelected,
                      !selected && isToday && { color: theme.tint },
                    ]}>
                    {day}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.one,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepperLabel: {
    textAlign: 'center',
    minWidth: 44,
  },
  chevron: {
    fontSize: 22,
    lineHeight: 24,
    paddingHorizontal: Spacing.one,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
  },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayInner: {
    width: 36,
    height: 36,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDisabled: {
    opacity: 0.25,
  },
  daySelected: {
    color: '#FFFFFF',
  },
});
