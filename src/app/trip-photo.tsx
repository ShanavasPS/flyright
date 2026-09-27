import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { TripPhoto } from '@/screens/trip-photo';

export default function TripPhotoRoute() {
  useMarkInteractive();
  return <TripPhoto />;
}
