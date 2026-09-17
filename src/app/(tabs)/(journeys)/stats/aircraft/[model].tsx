import { Stack, useLocalSearchParams } from 'expo-router';

import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { StatsAircraftType } from '@/screens/stats-aircraft-type';

/** One aircraft type: its airframes and every flight flown on it. */
export default function StatsAircraftTypeRoute() {
  useMarkInteractive();
  const { model } = useLocalSearchParams<{ model: string }>();
  return (
    <>
      <Stack.Screen options={{ title: model ?? 'Aircraft' }} />
      <StatsAircraftType model={model ?? ''} />
    </>
  );
}
