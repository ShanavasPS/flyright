import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

// Six saturated washes that sit well on both the porcelain page and the
// night-sky navy — each person keeps theirs (hashed from the name), so the
// same face reads the same in the People tab, the invite page and the
// follower list. White initials on top, like the pass's monogram chip.
const HUES = [
  'linear-gradient(160deg, #4E9BF5 0%, #1E6BE0 100%)', // cobalt
  'linear-gradient(160deg, #2FD68C 0%, #0FA362 100%)', // payout green
  'linear-gradient(160deg, #A78BFA 0%, #6D4AE0 100%)', // violet
  'linear-gradient(160deg, #FF8A65 0%, #E0553A 100%)', // coral
  'linear-gradient(160deg, #F2B441 0%, #D48A0B 100%)', // amber
  'linear-gradient(160deg, #38C8D8 0%, #0E8FA3 100%)', // teal
] as const;

export function avatarHue(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return HUES[Math.abs(hash) % HUES.length]!;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Round profile picture with a colored-initials fallback — Clerk's imageUrl
 * always resolves to something, but circle members synced through the
 * webhook may have none. `ring` draws a 2px halo in that color (live trips,
 * stacked avatars on navy). */
export function Avatar({
  name,
  imageUrl,
  size = 40,
  ring,
}: {
  name: string;
  imageUrl: string | null;
  size?: number;
  ring?: string;
}) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  const face = imageUrl ? (
    <Image source={imageUrl} style={shape} accessibilityLabel={name} />
  ) : (
    <View
      accessibilityLabel={name}
      style={[styles.fallback, shape, { experimental_backgroundImage: avatarHue(name) }]}>
      <Text style={[styles.initials, { fontSize: size * 0.4, lineHeight: size * 0.5 }]}>
        {initialsOf(name) || '?'}
      </Text>
    </View>
  );

  if (!ring) return face;
  const ringSize = size + 6;
  return (
    <View
      style={[
        styles.ring,
        { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderColor: ring },
      ]}>
      {face}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  ring: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
