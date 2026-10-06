import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { LoungeSheet } from '@/screens/lounge-sheet';

export default function LoungeRoute() {
  useMarkInteractive();
  return <LoungeSheet />;
}
