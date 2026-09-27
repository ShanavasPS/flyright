import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { HomeBaseCity } from '@/screens/home-base-city';

export default function HomeBaseCityRoute() {
  useMarkInteractive();
  return <HomeBaseCity />;
}
