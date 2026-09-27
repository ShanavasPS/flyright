import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { SignIn } from '@/screens/sign-in';

export default function SignInRoute() {
  useMarkInteractive();
  return <SignIn />;
}
