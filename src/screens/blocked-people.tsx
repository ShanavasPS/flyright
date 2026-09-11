import { useMutation, useQuery } from 'convex/react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';

import { Avatar } from '@/components/avatar';
import { LoadingState } from '@/components/data-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';
import { formatDayLabel } from '@/services/dates';

/** Settings → Blocked people. The only list a blocked person still appears
 * in: search, circles and share pages all act as if they had left. */
export function BlockedPeople() {
  const theme = useTheme();
  const people = useQuery(api.safety.blockedPeople, {});
  const unblock = useMutation(api.safety.unblock);

  const confirmUnblock = (userId: string, name: string) =>
    Alert.alert(
      `Unblock ${name}?`,
      'They will be able to find you and ask to follow your trips again. Nothing is shared until you say so.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: () => {
            trackEvent('person_unblocked');
            void unblock({ userId });
          },
        },
      ],
    );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          {people === undefined ? (
            <LoadingState />
          ) : people.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Nobody is blocked. To block someone, open their profile and choose Block from the ⋯ menu.
            </ThemedText>
          ) : (
            <ThemedView type="backgroundElement" style={styles.group}>
              {people.map((p, i) => (
                <View
                  key={p.userId}
                  style={[
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
                  ]}>
                  <Avatar name={p.name} imageUrl={p.imageUrl} size={40} />
                  <View style={styles.rowLabel}>
                    <ThemedText>{p.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Blocked {formatDayLabel(p.since)}
                    </ThemedText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Unblock ${p.name}`}
                    testID={`unblock-${p.userId}`}
                    onPress={() => confirmUnblock(p.userId, p.name)}
                    style={({ pressed }) => [styles.unblock, { backgroundColor: theme.field }, pressed && styles.pressed]}>
                    <ThemedText type="smallBold" style={{ color: theme.tint }}>
                      Unblock
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
            </ThemedView>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  empty: { paddingTop: Spacing.four, textAlign: 'center' },
  group: { borderRadius: Spacing.three, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  rowLabel: { flex: 1, gap: 2 },
  unblock: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 999 },
  pressed: { opacity: 0.6 },
});
