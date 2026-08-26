import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { NotificationPrime } from '@/screens/notification-prime';

export default function NotificationPrimeRoute() {
  useMarkInteractive();
  return <NotificationPrime />;
}
