import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/** Round profile picture with an initials fallback — Clerk's imageUrl always
 * resolves to something, but circle members synced through the webhook may
 * have none. */
export function Avatar({ name, imageUrl, size = 40 }: { name: string; imageUrl: string | null; size?: number }) {
  const theme = useTheme();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (imageUrl) return <Image source={imageUrl} style={shape} accessibilityLabel={name} />;
  return (
    <View
      accessibilityLabel={name}
      style={[styles.fallback, shape, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText
        type="smallBold"
        themeColor="heading"
        style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
        {initials || '?'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
