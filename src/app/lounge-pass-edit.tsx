import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { LoungePassEdit } from '@/screens/lounge-pass-edit';

export default function LoungePassEditRoute() {
  useMarkInteractive();
  return <LoungePassEdit />;
}
