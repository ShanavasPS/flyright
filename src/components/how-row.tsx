import type { SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { IconBadge } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** One beat of a tab's pitch — icon badge, bold title, one-line detail. The
 * empty states stack three of these in a SheenCard under the navy hero
 * instead of explaining themselves in a paragraph. */
export function HowRow({
  symbol,
  climbing,
  title,
  detail,
}: {
  symbol: SymbolViewProps['name'];
  climbing?: boolean;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.row}>
      <IconBadge symbol={symbol} climbing={climbing} />
      <View style={styles.body}>
        <ThemedText type="smallBold" themeColor="heading">
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
});
