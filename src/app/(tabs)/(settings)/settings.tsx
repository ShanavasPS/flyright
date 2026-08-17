import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Settings } from '@/screens/settings';

export default function SettingsRoute() {
  useMarkInteractive();
  return <Settings />;
}
