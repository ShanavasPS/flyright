import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Journeys } from '@/screens/journeys';

export default function FlightsRoute() {
  useMarkInteractive();
  return <Journeys />;
}
