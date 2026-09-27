import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { HomeBase } from '@/screens/home-base';

export default function HomeBaseRoute() {
  useMarkInteractive();
  return <HomeBase />;
}
