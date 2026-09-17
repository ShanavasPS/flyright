import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { StatsPlaces } from '@/screens/stats-places';

export default function StatsPlacesRoute() {
  useMarkInteractive();
  return <StatsPlaces />;
}
