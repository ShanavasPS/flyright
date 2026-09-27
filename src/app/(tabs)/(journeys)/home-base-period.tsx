import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { HomeBasePeriod } from '@/screens/home-base-period';

export default function HomeBasePeriodRoute() {
  useMarkInteractive();
  return <HomeBasePeriod />;
}
