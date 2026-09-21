import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Updates } from '@/screens/updates';

export default function UpdatesRoute() {
  useMarkInteractive();
  return <Updates />;
}
