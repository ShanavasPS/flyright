import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { compactCount } from '@/services/circle';

export type SegmentTab<K extends string> = {
  key: K;
  label: string;
  /** Shown after the label, muted — "Followers 12". */
  count?: number;
  /** Something waiting on this tab (a request to answer): a tinted badge
   * with the number, so the tab says so before it is opened. */
  badge?: number;
};

/** The in-page segmented tabs the People tab and the circle preview share:
 * a soft field with the selected segment raised on the card surface. Two or
 * three segments across the full width, never scrolling — for more than
 * that a top-tab bar is the right control, not this. */
export function SegmentTabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: SegmentTab<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: theme.field }]}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${t.label}${t.count != null ? `, ${t.count}` : ''}${t.badge ? `, ${t.badge} waiting` : ''}`}
            testID={`tab-${t.key}`}
            onPress={() => onChange(t.key)}
            style={[
              styles.segmentItem,
              on && {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.hairline,
                borderWidth: StyleSheet.hairlineWidth,
              },
            ]}>
            <ThemedText
              type="smallBold"
              themeColor={on ? 'heading' : 'textSecondary'}
              numberOfLines={1}
              style={styles.label}>
              {t.label}
            </ThemedText>
            {t.count != null && t.count > 0 && (
              <ThemedText
                type="small"
                themeColor={on ? 'text' : 'textSecondary'}
                numberOfLines={1}>
                {compactCount(t.count)}
              </ThemedText>
            )}
            {!!t.badge && (
              <View style={[styles.badge, { backgroundColor: theme.tint }]}>
                <ThemedText type="smallBold" style={styles.badgeText}>
                  {t.badge}
                </ThemedText>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: Spacing.three,
  },
  segmentItem: {
    flex: 1,
    height: 36,
    borderRadius: Spacing.three - Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  label: {
    flexShrink: 1,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 14,
  },
});
