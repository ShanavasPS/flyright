import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { MembershipEdit } from '@/screens/membership-edit';

export default function MembershipRoute() {
  useMarkInteractive();
  return <MembershipEdit />;
}
