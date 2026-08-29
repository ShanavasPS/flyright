import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { ClaimLetter } from '@/screens/claim-letter';

export default function ClaimLetterRoute() {
  useMarkInteractive();
  return <ClaimLetter />;
}
