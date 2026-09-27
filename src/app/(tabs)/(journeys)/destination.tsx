import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Destination } from '@/screens/destination';

export default function DestinationRoute() {
  useMarkInteractive();
  return <Destination />;
}
