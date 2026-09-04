import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { JourneyNote } from '@/screens/journey-note';

export default function JourneyNoteRoute() {
  useMarkInteractive();
  return <JourneyNote />;
}
