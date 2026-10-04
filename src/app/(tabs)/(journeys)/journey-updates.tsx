import { useLocalSearchParams } from 'expo-router';

import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { JourneyUpdates } from '@/screens/journey-updates';

export default function JourneyUpdatesRoute() {
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  useMarkInteractive();
  return <JourneyUpdates journeyId={journeyId} />;
}
