import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { DeleteAccount } from '@/screens/delete-account';

export default function DeleteAccountRoute() {
  useMarkInteractive();
  return <DeleteAccount />;
}
