import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { EditProfile } from '@/screens/edit-profile';

export default function EditProfileRoute() {
  useMarkInteractive();
  return <EditProfile />;
}
