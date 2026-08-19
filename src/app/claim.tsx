import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { ClaimWizard } from '@/screens/claim-wizard';

export default function ClaimRoute() {
  useMarkInteractive();
  return <ClaimWizard />;
}
