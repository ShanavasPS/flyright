import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { ReportSheet } from '@/screens/report';

export default function ReportRoute() {
  useMarkInteractive();
  return <ReportSheet />;
}
