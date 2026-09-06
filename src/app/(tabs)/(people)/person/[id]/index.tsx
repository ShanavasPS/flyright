import { useLocalSearchParams } from 'expo-router';

import { Person } from '@/screens/person';

/** Somebody in your circle, opened from a row in People. Pushed inside the
 * tab so the tab bar stays put and back returns to the list. */
export default function PersonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Person userId={typeof id === 'string' ? id : ''} />;
}
