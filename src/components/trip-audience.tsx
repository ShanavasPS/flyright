import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';

import { useChoiceSheet } from '@/components/choice-sheet';
import { ThemedText } from '@/components/themed-text';
import { WHITE, WHITE_DIM, WHITE_FAINT } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { watcherNames } from '@/services/circle';
import {
  VISIBILITY_LABEL,
  VISIBILITY_ORDER,
  audienceLine,
  type TripVisibility,
} from '@/services/trip-visibility';

export type Follower = { name: string | null; close: boolean };

/** The people who follow the signed-in traveler, close-circle flag included;
 * undefined while loading or signed out (nobody to show a trip to then). */
export function useCircleFollowers(): Follower[] | undefined {
  const { isSignedIn } = useAuth();
  const circle = useQuery(api.circle.list, isSignedIn ? {} : 'skip');
  return circle?.followers;
}

/** "Whole circle · Anna & Sam" — one row of the chooser. */
function optionLabel(visibility: TripVisibility, followers: Follower[]) {
  if (visibility === 'private') return VISIBILITY_LABEL.private;
  const people = visibility === 'close' ? followers.filter((f) => f.close) : followers;
  return `${VISIBILITY_LABEL[visibility]} · ${people.length ? watcherNames(people) : 'nobody yet'}`;
}

/** The three-way "who sees this trip?" sheet, shared by the add-trip screens,
 * the trip menu and the circle preview. Render `sheet` once in the screen. */
export function useVisibilityChooser(followers: Follower[] | undefined) {
  const { show, sheet } = useChoiceSheet();
  const choose = (current: TripVisibility, onSelect: (next: TripVisibility) => void) => {
    show(
      `Who sees this trip? Now: ${VISIBILITY_LABEL[current]}`,
      VISIBILITY_ORDER.map((value) => ({
        text: optionLabel(value, followers ?? []),
        onPress: () => {
          if (value !== current) onSelect(value);
        },
      })),
    );
  };
  return { choose, sheet };
}

const ICON = {
  circle: { ios: 'person.2.fill', android: 'group', web: 'group' },
  close: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  private: { ios: 'eye.slash.fill', android: 'visibility_off', web: 'visibility_off' },
} as const satisfies Record<TripVisibility, ComponentProps<typeof SymbolView>['name']>;

/** The row an add-trip screen shows above its save button: who will see the
 * trip and get the heads-up push, prefilled from Settings, tappable to change
 * it for this trip only. */
export function AudienceRow({
  value,
  followers,
  onPress,
  tone = 'card',
  testID = 'trip-audience',
}: {
  value: TripVisibility;
  followers: Follower[] | undefined;
  onPress: () => void;
  /** 'pass' = on the night-sky boarding pass, white on navy. */
  tone?: 'card' | 'pass';
  testID?: string;
}) {
  const theme = useTheme();
  const line = audienceLine(value, followers ?? []);
  const onPass = tone === 'pass';
  const primary = onPass ? WHITE : theme.text;
  const secondary = onPass ? WHITE_DIM : theme.textSecondary;
  const accent = onPass ? WHITE : theme.tint;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Who sees this trip: ${VISIBILITY_LABEL[value]}. ${line} Change`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: onPass ? WHITE_FAINT : theme.field },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.disc, { backgroundColor: onPass ? WHITE_FAINT : `${theme.tint}1A` }]}>
        <SymbolView name={ICON[value]} size={15} weight="semibold" tintColor={accent} />
      </View>
      <View style={styles.text}>
        <ThemedText type="smallBold" style={{ color: primary }}>
          {VISIBILITY_LABEL[value]}
        </ThemedText>
        <ThemedText type="small" style={{ color: secondary }}>
          {line}
        </ThemedText>
      </View>
      <SymbolView
        name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more', web: 'unfold_more' }}
        size={13}
        weight="bold"
        tintColor={secondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
    borderRadius: 12,
  },
  pressed: { opacity: 0.7 },
  disc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
