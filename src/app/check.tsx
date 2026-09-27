import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { CheckFlight } from '@/screens/check';

export default function CheckRoute() {
  useMarkInteractive();
  return <CheckFlight />;
}
