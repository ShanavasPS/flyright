import { useLocalSearchParams } from 'expo-router';

import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { JourneyDetail } from '@/screens/journey-detail';

export default function JourneyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useMarkInteractive();
  return <JourneyDetail journeyId={id} />;
}
