import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { GoPro } from '@/screens/go-pro';

export default function GoProRoute() {
  useMarkInteractive();
  return <GoPro />;
}
