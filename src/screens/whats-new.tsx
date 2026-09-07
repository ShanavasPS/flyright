import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAppVersion } from '@/hooks/use-app-version';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';

/** "6 Sep 2026" from a `YYYY-MM-DD` or ISO date. */
function shortDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** The screen behind the Settings update row: the version on the store, the
 * one running here, an Update button to the store, and every release note
 * in between so the traveller sees what they are missing — not only the
 * latest release's, the way the stores show it.
 *
 * A card modal, not a formSheet: the notes can run to several releases and
 * must scroll, and a ScrollView inside a formSheet is captured by the
 * sheet's drag integration (see add-person, claim-wizard). */
export function WhatsNew() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // iOS's card modal starts below the status bar on its own (its top inset
  // reads 0). Android's modal is full-screen, edge-to-edge, AND reports a
  // zero top inset from inside the modal — the status bar height is the
  // reliable figure there, or the close button sits under the clock.
  const topInset =
    Platform.OS === 'android' ? Math.max(insets.top, StatusBar.currentHeight ?? 0) : insets.top;
  const { update, storeUrl } = useAppVersion();
  const storeName = Platform.OS === 'android' ? 'Google Play' : 'the App Store';

  const openStore = () => {
    const url = update?.storeUrl ?? storeUrl;
    if (!url) return;
    trackEvent('app_update_tapped', {
      installed: update?.installed ?? '',
      latest: update?.latest ?? '',
      behind: update?.notes.length ?? 0,
    });
    void Linking.openURL(url);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset + Spacing.three, paddingBottom: insets.bottom + Spacing.five },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.bar}>
          <ThemedText type="subtitle" themeColor="heading">
            What’s new
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            onPress={() => router.back()}
            style={[styles.close, { backgroundColor: theme.field }]}>
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={14}
              weight="bold"
              tintColor={theme.textSecondary}
            />
          </Pressable>
        </View>
        <View style={styles.hero}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.icon}
            accessibilityIgnoresInvertColors
          />
          <View style={styles.heroCopy}>
            <ThemedText type="title" themeColor="heading">
              {update ? `FlyRight ${update.latest}` : 'FlyRight'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {update
                ? `You have ${update.installed}${update.releasedAt ? ` · released ${shortDate(update.releasedAt)}` : ''}`
                : 'You’re on the latest version.'}
            </ThemedText>
          </View>
        </View>

        {update && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Update on ${storeName}`}
            onPress={openStore}
            style={({ pressed }) => [
              styles.updateButton,
              { backgroundColor: theme.tint },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={styles.updateLabel}>
              Update on {storeName}
            </ThemedText>
          </Pressable>
        )}

        {update && (
          <ThemedText type="subtitle" themeColor="heading" style={styles.sectionTitle}>
            {update.notes.length > 1
              ? `What you’re missing — ${update.notes.length} releases`
              : `What ${update.latest} brings`}
          </ThemedText>
        )}

        {update?.notes.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Release notes for {update.latest} are on their way. The update is on {storeName} now.
          </ThemedText>
        )}

        {update?.notes.map((release) => (
          <ThemedView key={release.version} type="backgroundElement" style={styles.release}>
            <View style={styles.releaseHeader}>
              <ThemedText type="smallBold">{release.version}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {shortDate(release.date)}
              </ThemedText>
            </View>
            {release.notes.map((note, i) => (
              <View key={i} style={styles.note}>
                <View style={[styles.bullet, { backgroundColor: theme.tint }]} />
                <ThemedText type="small" style={styles.noteText}>
                  {note}
                </ThemedText>
              </View>
            ))}
          </ThemedView>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
          <ThemedText type="link">{update ? 'Not now' : 'Done'}</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  heroCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
  updateButton: {
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateLabel: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  sectionTitle: {
    marginTop: Spacing.two,
  },
  release: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  releaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  noteText: {
    flex: 1,
  },
  later: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
});
