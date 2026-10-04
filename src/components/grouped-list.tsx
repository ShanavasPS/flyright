import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The grouped-list pieces the Profile area shares: an uppercase section
 * label, a rounded group, and a row with an icon tile, a label, an
 * optional value and a chevron. Settings keeps its own older rows. */

export function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section} accessibilityRole="header">
      {children.toUpperCase()}
    </ThemedText>
  );
}

export function Group({ children }: { children: ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.group}>
      {children}
    </ThemedView>
  );
}

export function GroupSeparator() {
  return <ThemedView type="backgroundSelected" style={styles.separator} />;
}

export function GroupRow({
  icon,
  label,
  value,
  tone = 'default',
  chevron = true,
  onPress,
  testID,
  accessory,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  value?: string;
  /** 'danger' paints the label and icon red (Sign out). */
  tone?: 'default' | 'danger' | 'pro';
  chevron?: boolean;
  onPress?: () => void;
  testID?: string;
  accessory?: ReactNode;
}) {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.danger : tone === 'pro' ? theme.warning : theme.tint;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.iconTile, { backgroundColor: `${color}1F` }]}>
        <SymbolView name={icon} size={18} tintColor={color} />
      </View>
      <ThemedText style={[styles.label, tone === 'danger' && { color: theme.danger }]} numberOfLines={1}>
        {label}
      </ThemedText>
      {value ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.value}>
          {value}
        </ThemedText>
      ) : (
        <View style={styles.value} />
      )}
      {accessory}
      {chevron && (
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={13}
          weight="bold"
          tintColor={theme.textSecondary}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    letterSpacing: 1.6,
    marginTop: Spacing.two,
    marginLeft: Spacing.two,
  },
  group: {
    borderRadius: Spacing.four,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The label always reads in full; the value beside it gives way.
  label: {
    flexShrink: 0,
    maxWidth: '62%',
    fontWeight: 600,
  },
  value: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
  },
});
