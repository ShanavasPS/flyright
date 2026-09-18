import { Platform } from 'react-native';

import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Journeys } from '@/screens/journeys';
import { Landing } from '@/screens/landing';

export default function JourneysRoute() {
  useMarkInteractive();
  // Web has no local journal (SQLite is stubbed), so getflyright.com's root
  // is the website's front page instead of an empty travels list. The tabs
  // layout hides its bar for it.
  if (Platform.OS === 'web') return <Landing />;
  return <Journeys />;
}
