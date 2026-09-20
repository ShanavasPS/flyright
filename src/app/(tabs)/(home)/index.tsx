import { Platform } from 'react-native';

import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Home } from '@/screens/home';
import { Landing } from '@/screens/landing';

/** The app opens here: what is happening right now. On the web this path is
 * getflyright.com's front page instead — a browser has no local journal and
 * no travel day to lead with. The tabs layout hides its bar for it. */
export default function HomeRoute() {
  useMarkInteractive();
  if (Platform.OS === 'web') return <Landing />;
  return <Home />;
}
