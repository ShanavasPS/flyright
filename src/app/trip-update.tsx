import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { TripUpdateComposer } from '@/screens/trip-update';

export default function TripUpdateRoute() {
  useMarkInteractive();
  return <TripUpdateComposer />;
}
