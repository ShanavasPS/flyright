import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Account } from '@/screens/account';

export default function AccountRoute() {
  useMarkInteractive();
  return <Account />;
}
