import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { LoungePassDetail } from '@/screens/lounge-pass-detail';

export default function LoungePassRoute() {
  useMarkInteractive();
  return <LoungePassDetail />;
}
