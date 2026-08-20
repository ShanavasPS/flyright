import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { Onboarding } from '@/screens/onboarding';

export default function OnboardingRoute() {
  useMarkInteractive();
  return <Onboarding />;
}
