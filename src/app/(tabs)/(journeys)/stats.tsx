import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { TravelStats } from '@/screens/travel-stats';

export default function TravelStatsRoute() {
  useMarkInteractive();
  return <TravelStats />;
}
