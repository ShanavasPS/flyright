import { useLocalSearchParams } from 'expo-router';

import { JourneyDetail } from '@/screens/journey-detail';

export default function JourneyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <JourneyDetail journeyId={id} />;
}
