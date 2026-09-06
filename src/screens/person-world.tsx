import { useQuery } from 'convex/react';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';

import { Card } from '@/components/card';
import { RouteAtlas } from '@/components/route-atlas';
import { mapColors } from '@/components/world-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { cityOf } from '@/services/timeline';
import type { RouteSource } from '@/services/geo';

/**
 * Somebody else's travel, drawn.
 *
 * It lives on the person rather than as a mode of the World tab, and that is
 * the whole design. The World tab means "everywhere I have been" — its
 * countries and kilometres are the viewer's own. Put a person switcher in it
 * and every visit begins by working out whose map this is before the numbers
 * mean anything; the common case pays for the rare one. Here the answer is
 * in the title and can't drift.
 *
 * The atlas draws it, not the map SDK: a person's whole travel spans more
 * longitude than the SDK will zoom out to (~89° on an iPhone, ~72° on a
 * Pixel), and there is nothing to pan a static map with.
 */
export function PersonWorld({ userId, focusJourneyId }: { userId: string; focusJourneyId?: string }) {
  const data = useQuery(api.circle.person, { userId });
  const { sea } = mapColors(useColorScheme() === 'dark');
  // Measured rather than a fraction of the window: the atlas needs a real
  // height to fit into, and the map should own whatever the header and the
  // caption leave rather than a guess at it.
  const [box, setBox] = useState({ width: 0, height: 0 });

  const person = data && !('gone' in data) ? data : null;
  const routes: RouteSource[] = useMemo(() => {
    if (!person) return [];
    const all = [...person.upcoming, ...person.past];
    const picked = focusJourneyId ? all.filter((t) => t.journeyId === focusJourneyId) : all;
    return picked.map((t) => ({
      id: t.journeyId,
      fromCode: t.fromCode,
      toCode: t.toCode,
      number: t.number,
      carrier: t.carrier,
      scheduledDeparture: t.scheduledDeparture,
    }));
  }, [person, focusJourneyId]);

  let body: React.ReactNode;
  if (data === undefined) {
    body = <ActivityIndicator style={styles.spinner} />;
  } else if (!person || !person.theyShare) {
    body = (
      <Card>
        <ThemedText type="subtitle">Nothing to show</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          You either stopped following them, or they stopped sharing their trips.
        </ThemedText>
      </Card>
    );
  } else if (!routes.length) {
    body = (
      <Card>
        <ThemedText type="subtitle">No trips yet</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {person.name} hasn&apos;t added a flight. You&apos;ll hear when they do.
        </ThemedText>
      </Card>
    );
  } else {
    const flown = person.past.length;
    const ahead = person.upcoming.length;
    body = (
      <>
        {/* Capped to a landscape-ish shape rather than filling a portrait
            screen. Routes run east-west, and the atlas fits the wider axis:
            in a tall box that means zooming out until a single transatlantic
            leg sits on a whole-world view with Africa in frame. Held near
            4:3 it fills with the travel instead. */}
        <View style={styles.mapArea} onLayout={(e) => setBox({
          width: Math.round(e.nativeEvent.layout.width),
          height: Math.round(e.nativeEvent.layout.height),
        })}>
          {box.width > 0 && (
            <View
              style={[
                styles.map,
                { height: Math.min(box.height, Math.round(box.width * 0.78)), backgroundColor: sea },
              ]}>
              <RouteAtlas
                journeys={routes}
                height={Math.min(box.height, Math.round(box.width * 0.78))}
                // One leg wants to look like that leg; a whole travel needs
                // a little more room around it to read as a world.
                pad={focusJourneyId ? 0.16 : 0.28}
              />
            </View>
          )}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
          {focusJourneyId
            ? `${routes[0].fromCode} → ${routes[0].toCode} · ${cityOf(routes[0].fromCode)} to ${cityOf(routes[0].toCode)}`
            : `${flown === 1 ? '1 trip' : `${flown} trips`} flown${ahead ? `, ${ahead} ahead` : ''}. Only the flights ${person.name} keeps in FlyRight.`}
        </ThemedText>
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{ title: person ? `${person.name}'s world` : 'World' }}
      />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
        {body}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  spinner: { marginTop: Spacing.six },
  mapArea: { flex: 1, justifyContent: 'center' },
  map: { borderRadius: Spacing.four, overflow: 'hidden' },
  caption: { textAlign: 'center', paddingHorizontal: Spacing.two },
});
