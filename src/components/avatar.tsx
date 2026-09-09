import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

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

/** The Pro crown: gold disc, midnight-navy crown — gold because that is what
 * "premium" looks like to everyone, navy so the mark stays on brand and reads
 * on the disc (a white crown on gold washes out). Distinct from the amber the
 * app uses for delays, which is warmer and never sits on a face. */
const PRO_GOLD = '#E8B93B';
const PRO_CROWN = '#13294B';

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
 * stacked avatars on navy). `pro` pins a small crown to the top-right
 * corner: the one mark that tells a Pro member from the rest wherever a
 * face is drawn. `badgeBorder` is the card colour the crown sits on, so it
 * reads as cut out of the face on the navy pass as well as the light cards. */
export function Avatar({
  name,
  imageUrl,
  size = 40,
  ring,
  pro = false,
  badgeBorder,
}: {
  name: string;
  imageUrl: string | null;
  size?: number;
  ring?: string;
  pro?: boolean;
  badgeBorder?: string;
}) {
  const theme = useTheme();
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

  const framed = ring ? (
    <View
      style={[
        styles.ring,
        {
          width: size + 6,
          height: size + 6,
          borderRadius: (size + 6) / 2,
          borderColor: ring,
        },
      ]}>
      {face}
    </View>
  ) : (
    face
  );
  if (!pro) return framed;

  // The crown scales with the face but never below a legible 16pt; the
  // border is the card behind it, so it looks punched out of the photo.
  const badge = Math.max(16, Math.round(size * 0.36));
  const border = Math.max(1.5, Math.round(badge / 8));
  return (
    <View style={styles.badged}>
      {framed}
      <View
        accessibilityLabel="FlyRight Pro"
        style={[
          styles.badge,
          {
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            borderWidth: border,
            borderColor: badgeBorder ?? theme.background,
            backgroundColor: PRO_GOLD,
          },
        ]}>
        <SymbolView
          name={{ ios: 'crown.fill', android: 'workspace_premium', web: 'workspace_premium' }}
          size={Math.round(badge * 0.55)}
          tintColor={PRO_CROWN}
        />
      </View>
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
  badged: {
    alignSelf: 'flex-start',
  },
  badge: {
    position: 'absolute',
    right: -2,
    top: -2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
