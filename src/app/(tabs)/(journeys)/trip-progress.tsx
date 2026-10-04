import { useLocalSearchParams } from 'expo-router';

import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { TripProgress } from '@/screens/trip-progress';

export default function TripProgressRoute() {
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  useMarkInteractive();
  return <TripProgress journeyId={journeyId} />;
}
