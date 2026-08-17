import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Journeys } from '@/screens/journeys';

export default function JourneysRoute() {
  useMarkInteractive();
  return <Journeys />;
}
