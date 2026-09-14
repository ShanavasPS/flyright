import { useLocalSearchParams } from 'expo-router';
import { CONVEX_URL } from '@/constants/config';
import { FollowTrip } from '@/screens/follow-trip';
import type { Id } from '../../../convex/_generated/dataModel';

/** Authenticated follower destination used by Lock Screen and Dynamic Island. */
export default function FollowingActivityRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!CONVEX_URL || typeof id !== 'string') return null;
  return <FollowTrip sessionId={id as Id<'liveSessions'>} />;
}
