import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Claims } from '@/screens/claims';

export default function ClaimsRoute() {
  useMarkInteractive();
  return <Claims />;
}
