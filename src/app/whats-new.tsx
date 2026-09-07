import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { WhatsNew } from '@/screens/whats-new';

export default function WhatsNewRoute() {
  useMarkInteractive();
  return <WhatsNew />;
}
