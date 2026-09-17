import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { StatsFlights } from '@/screens/stats-flights';

export default function StatsFlightsRoute() {
  useMarkInteractive();
  return <StatsFlights />;
}
