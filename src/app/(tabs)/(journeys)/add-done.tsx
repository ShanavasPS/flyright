import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { AddFlightDone } from '@/screens/add-flight';

export default function AddFlightDoneRoute() {
  useMarkInteractive();
  return <AddFlightDone />;
}
