import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Memberships } from '@/screens/memberships';

export default function MembershipsRoute() {
  useMarkInteractive();
  return <Memberships />;
}
