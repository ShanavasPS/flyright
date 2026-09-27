import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { ManageSubscription } from '@/screens/manage-subscription';

export default function ManageSubscriptionRoute() {
  useMarkInteractive();
  return <ManageSubscription />;
}
