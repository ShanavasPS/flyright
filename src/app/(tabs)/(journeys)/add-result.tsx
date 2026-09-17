import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { AddFlight } from '@/screens/add-flight';

export default function AddFlightResultRoute() {
  useMarkInteractive();
  return <AddFlight step="result" />;
}
