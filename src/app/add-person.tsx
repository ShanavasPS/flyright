import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { AddPerson } from '@/screens/add-person';

export default function AddPersonRoute() {
  useMarkInteractive();
  return <AddPerson />;
}
