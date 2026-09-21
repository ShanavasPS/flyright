import { Platform } from 'react-native';

import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Journeys } from '@/screens/journeys';
import { Landing } from '@/screens/landing';

/** The app opens here: your flights, greeted by name. On the web this path
 * is getflyright.com's front page instead — a browser has no local journal
 * to lead with. The tabs layout hides its bar for it. */
export default function FlightsRoute() {
  useMarkInteractive();
  if (Platform.OS === 'web') return <Landing />;
  return <Journeys />;
}
