import { useLocalSearchParams } from 'expo-router';

import { PersonWorld } from '@/screens/person-world';

/** A followed person's travel on a map — reached from their page, or from
 * one of their trips, which opens it on that leg alone. */
export default function PersonWorldRoute() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  return (
    <PersonWorld
      userId={typeof id === 'string' ? id : ''}
      focusJourneyId={typeof focus === 'string' ? focus : undefined}
    />
  );
}
