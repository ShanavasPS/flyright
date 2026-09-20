import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { UpdateViewer } from '@/screens/update-viewer';

export default function UpdateViewerRoute() {
  useMarkInteractive();
  return <UpdateViewer />;
}
