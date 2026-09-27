import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { HomePhoto } from '@/screens/home-photo';

export default function HomePhotoRoute() {
  useMarkInteractive();
  return <HomePhoto />;
}
