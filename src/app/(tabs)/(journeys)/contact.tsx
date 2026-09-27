import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { ContactSupport } from '@/screens/contact-support';

export default function ContactRoute() {
  useMarkInteractive();
  return <ContactSupport />;
}
