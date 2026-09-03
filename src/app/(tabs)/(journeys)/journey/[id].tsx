import { useLocalSearchParams } from 'expo-router';

import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { JourneyDetail } from '@/screens/journey-detail';

export default function JourneyRoute() {
  // `from`/`to` are optional hints the pushing screen already knows, so the
  // header can read "DXB → LAX" on the first frame instead of after the row
  // loads; deep links without them fall back to a blank title until then.
  const { id, from, to } = useLocalSearchParams<{ id: string; from?: string; to?: string }>();
  useMarkInteractive();
  return <JourneyDetail journeyId={id} routeHint={from && to ? { from, to } : undefined} />;
}
