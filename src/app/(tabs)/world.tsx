import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { World } from '@/screens/world';

export default function WorldRoute() {
  useMarkInteractive();
  return <World />;
}
