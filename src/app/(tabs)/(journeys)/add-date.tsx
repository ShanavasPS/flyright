import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { AddFlight } from '@/screens/add-flight';

export default function AddFlightDateRoute() {
  useMarkInteractive();
  return <AddFlight step="date" />;
}
