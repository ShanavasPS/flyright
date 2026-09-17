import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { StatsAirlines } from '@/screens/stats-airlines';

export default function StatsAirlinesRoute() {
  useMarkInteractive();
  return <StatsAirlines />;
}
