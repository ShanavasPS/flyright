import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { ImportDocument } from '@/screens/import-document';

export default function ImportDocumentRoute() {
  useMarkInteractive();
  return <ImportDocument />;
}
