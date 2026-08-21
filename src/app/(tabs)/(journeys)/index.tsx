import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Journeys } from '@/screens/journeys';

export default function JourneysRoute() {
  useMarkInteractive();
  // Web has no local journal (SQLite is stubbed), so flyright.expo.app's root
  // is the compensation-checker funnel instead of an empty travels list.
  if (Platform.OS === 'web') return <Redirect href="/check" />;
  return <Journeys />;
}
