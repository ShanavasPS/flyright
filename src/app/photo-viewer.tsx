import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { PhotoViewer } from '@/screens/photo-viewer';

export default function PhotoViewerRoute() {
  useMarkInteractive();
  return <PhotoViewer />;
}
