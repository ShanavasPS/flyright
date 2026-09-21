import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Spacing } from '@/constants/theme';
import { useAppVersion } from '@/hooks/use-app-version';
import { useTheme } from '@/hooks/use-theme';

/** "Good evening, Ada" by the phone's own clock; no name when signed out. */
export function greeting(now: Date, firstName: string | null): string {
  const hour = now.getHours();
  const part = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : 'evening';
  return firstName ? `Good ${part}, ${firstName}` : `Good ${part}`;
}

/** The header's door to Settings. Signed in it is your face, so the way to
 * your own things is where a profile always is; signed out it is the plain
 * person glyph, because there is nobody to show yet and initials of nothing
 * ("?") read as something having gone wrong.
 *
 * Ringed in the brand tint, in a 40pt circle like the buttons across the
 * row from it: a bare face read as a picture of you rather than something
 * to press.
 *
 * A blue dot, never a red count: red on this app means a person is waiting
 * for an answer, and that lives on Friends. */
export function ProfileButton({
  loading,
  imageUrl,
  name,
  onPress,
}: {
  /** The session is still being restored: a plain disc, not the signed-out
   * glyph that would then turn into your face. */
  loading: boolean;
  imageUrl: string | null;
  name: string | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { update } = useAppVersion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        name
          ? update
            ? 'You and settings, update available'
            : 'You and settings'
          : 'Settings and sign in'
      }
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.ring, { borderColor: theme.tint }, pressed && styles.pressed]}>
      {loading ? (
        <View
          style={[
            styles.avatarBlank,
            { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: theme.backgroundSelected },
          ]}
        />
      ) : name ? (
        <Avatar name={name} imageUrl={imageUrl} size={AVATAR} />
      ) : (
        // The ring is already the circle; a circled glyph inside it drew two.
        <SymbolView
          name={{ ios: 'person.fill', android: 'person', web: 'person' }}
          size={20}
          tintColor={theme.tint}
          fallback={
            <View
              style={[
                styles.avatarBlank,
                { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: theme.backgroundSelected },
              ]}
            />
          }
        />
      )}
      {update && <View style={[styles.dot, { backgroundColor: theme.tint, borderColor: theme.background }]} />}
    </Pressable>
  );
}

/** Inside the ring with a 2pt gap: 40 − 2 × (2pt ring + 2pt gap). */
const AVATAR = 32;

const styles = StyleSheet.create({
  ring: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  avatarBlank: { alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: -Spacing.half,
    right: -Spacing.half,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});
