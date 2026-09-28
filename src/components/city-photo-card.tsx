import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CityPhotoFill, PhotoCredit } from '@/components/city-photo';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { usePlacePhoto } from '@/components/trip-cover';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { HomePlace } from '@/services/home-base';

/** A city under its own photo: the photo fills the card, a label rides the
 * top-left corner (an action pill and the credit the top-right), and the
 * city's name, a line about it and its airport chips sit where the photo
 * fades into the card. The Home base and Top destination cards on Travel
 * stats share it, so both read as the same kind of card. */
export function CityPhotoCard({
  place,
  label,
  action,
  meta,
  chips,
  compact = false,
  onPress,
  accessibilityLabel,
  testID,
}: {
  place: HomePlace;
  label: string;
  /** A small pill in the top-right corner, e.g. "Change". */
  action?: string;
  meta: string;
  chips?: ReactNode;
  compact?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  const theme = useTheme();
  const photo = usePlacePhoto(place);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={!onPress}
      testID={testID}>
      <SheenCard style={[styles.card, compact && styles.compact]}>
        <CityPhotoFill place={place} photo={photo} />
        <View
          style={[
            StyleSheet.absoluteFill,
            { experimental_backgroundImage: `linear-gradient(180deg, ${theme.backgroundElement}00 30%, ${theme.backgroundElement}E6 72%, ${theme.backgroundElement} 100%)` },
          ]}
        />
        <View style={styles.top}>
          <View style={styles.pill}>
            <ThemedText type="smallBold" style={styles.pillText} numberOfLines={1}>{label.toUpperCase()}</ThemedText>
          </View>
          <View style={styles.topRight}>
            {!!action && (
              <View style={[styles.action, { backgroundColor: `${theme.backgroundElement}E6` }]}>
                <ThemedText type="smallBold" themeColor="tint">{action}</ThemedText>
              </View>
            )}
            <PhotoCredit photo={photo} style={styles.credit} />
          </View>
        </View>
        <View style={styles.bottom}>
          <ThemedText type="subtitle" themeColor="heading" numberOfLines={1} adjustsFontSizeToFit>{place.city}</ThemedText>
          <View style={styles.meta}>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.shrink}>{meta}</ThemedText>
            {chips}
          </View>
        </View>
      </SheenCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, gap: 0, overflow: 'hidden', minHeight: 150, justifyContent: 'space-between' },
  compact: { minHeight: 132 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two, padding: Spacing.three },
  topRight: { alignItems: 'flex-end', gap: Spacing.one, maxWidth: '55%' },
  pill: { flexShrink: 1, borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: 3, backgroundColor: 'rgba(7,15,32,0.55)' },
  pillText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
  action: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 4 },
  credit: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(7,15,32,0.45)' },
  bottom: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.half },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  shrink: { flexShrink: 1 },
});
