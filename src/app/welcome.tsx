import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Welcome } from '@/screens/welcome';

export default function WelcomeRoute() {
  useMarkInteractive();
  return <Welcome />;
}
