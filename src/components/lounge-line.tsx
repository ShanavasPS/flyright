import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { loungeOptions } from '@/services/lounge-access';
import { loungeDeparture, loungeLine, statusEvidence, type LoungeTrip } from '@/services/lounge-trip';
import { useLounges } from '@/services/lounges';
import { useMemberships } from '@/services/memberships';

const thisMonth = () => new Date().toISOString().slice(0, 7);

/** "2 lounges you can use · Finnair Platinum Wing included" under the
 * airport card before the day (docs/lounges.md, design A1). Nothing at all
 * when the directory has no lounges at the departure airport. */
export function LoungeLine({ trip }: { trip: LoungeTrip }) {
  const theme = useTheme();
  const router = useRouter();
  const { userId } = useAuth();
  const memberships = useMemberships(userId);
  const lounges = useLounges([trip.fromCode]);

  const line = useMemo(() => {
    if (!lounges?.length || !memberships) return null;
    const departure = loungeDeparture(trip, airportZone(trip.fromCode));
    if (!departure) return null;
    const options = loungeOptions(lounges, departure, statusEvidence(trip, memberships), [], thisMonth());
    return loungeLine(options, memberships.length > 0);
  }, [lounges, memberships, trip]);

  if (!line) return null;
  const label = line.detail ? `${line.title}. ${line.detail}` : line.title;
  const addMembership = memberships?.length === 0;
  const body = (
    <>
      <SymbolView name={{ ios: 'sofa', android: 'weekend', web: 'weekend' }} size={16} tintColor={theme.tint} />
      <View style={styles.text}>
        <ThemedText type="smallBold" themeColor="heading" numberOfLines={1}>
          {line.title}
        </ThemedText>
        {line.detail && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {line.detail}
          </ThemedText>
        )}
      </View>
    </>
  );
  if (!addMembership) {
    return (
      <View testID="trip-lounges" accessible accessibilityLabel={label} style={[styles.line, { borderTopColor: theme.hairline }]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID="trip-lounges"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens your memberships"
      onPress={() => router.push('/memberships')}
      style={({ pressed }) => [styles.line, { borderTopColor: theme.hairline }, pressed && { opacity: 0.6 }]}>
      {body}
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={12}
        tintColor={theme.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
  },
  text: {
    flex: 1,
  },
});
