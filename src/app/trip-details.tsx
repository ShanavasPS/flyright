import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { TripDetailsEdit } from '@/screens/trip-details-edit';

export default function TripDetailsRoute() {
  useMarkInteractive();
  return <TripDetailsEdit />;
}
