import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { BoardingPassScreen } from '@/screens/boarding-pass';

export default function BoardingPassRoute() {
  useMarkInteractive();
  return <BoardingPassScreen />;
}
