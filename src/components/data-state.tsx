import { ActivityIndicator, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SUPPORT_EMAIL } from '@/constants/config';
import { Spacing } from '@/constants/theme';

/** Centred spinner for a screen (or a screen's body) whose rows haven't
 * landed yet — the honest frame between mount and the first read, in place
 * of painting the empty state and taking it back. */
export function LoadingState({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <ThemedView style={[styles.fill, style]}>
      <ActivityIndicator />
    </ThemedView>
  );
}

/** A read from the device's own storage failed. Distinct from "no rows":
 * the traveler's data is (probably) still there, the app just couldn't get
 * at it, so the copy says so and points at the two things that help. */
export function DataErrorCard({
  title = "Couldn't read your journal",
  error,
  style,
}: {
  title?: string;
  error?: Error | null;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card style={style}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Something went wrong reading this device&apos;s storage. Close FlyRight fully and open it
        again. If it keeps happening, write to us at {SUPPORT_EMAIL}.
      </ThemedText>
      {!!error?.message && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.detail}>
          {error.message}
        </ThemedText>
      )}
    </Card>
  );
}

/** Full-screen version of the storage error, for screens that have nothing
 * else to show around it. */
export function DataErrorState({ error, title }: { error?: Error | null; title?: string }) {
  return (
    <ThemedView style={styles.fill}>
      <View style={styles.centred}>
        <DataErrorCard error={error} title={title} />
      </View>
    </ThemedView>
  );
}

/** The row a route points at is gone: a stale deep link, a trip removed on
 * another device, a photo already deleted. */
export function MissingState({ title, detail }: { title: string; detail: string }) {
  return (
    <ThemedView style={[styles.fill, styles.centred]}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centredText}>
        {detail}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centred: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
    alignSelf: 'stretch',
  },
  centredText: {
    textAlign: 'center',
  },
  detail: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    opacity: 0.7,
  },
});
