import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Profile } from '@/screens/profile';

export default function ProfileRoute() {
  useMarkInteractive();
  return <Profile />;
}
