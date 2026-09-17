import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { StatsAircraft } from '@/screens/stats-aircraft';

export default function StatsAircraftRoute() {
  useMarkInteractive();
  return <StatsAircraft />;
}
