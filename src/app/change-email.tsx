import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { ChangeEmail } from '@/screens/change-email';

export default function ChangeEmailRoute() {
  useMarkInteractive();
  return <ChangeEmail />;
}
