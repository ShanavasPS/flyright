import { useLocalSearchParams } from 'expo-router';

import type { Id } from '../../../../../convex/_generated/dataModel';

import { SupportThread } from '@/screens/support-thread';

export default function SupportThreadRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SupportThread threadId={id as Id<'supportThreads'>} />;
}
