import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { ShareWorld } from '@/screens/share-world';

export default function ShareWorldRoute() {
  useMarkInteractive();
  return <ShareWorld />;
}
