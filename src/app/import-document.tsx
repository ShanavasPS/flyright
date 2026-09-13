import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { ImportDocument } from '@/screens/import-document';
import { useLocalSearchParams } from 'expo-router';

export default function ImportDocumentRoute() {
  useMarkInteractive();
  const { handle } = useLocalSearchParams<{ handle?: string }>();
  return <ImportDocument key={handle ?? 'missing'} />;
}
