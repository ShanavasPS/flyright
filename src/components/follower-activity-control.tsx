import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useState } from 'react';
import { Platform } from 'react-native';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { supportsFollowerActivities } from '../../modules/flyright-live-activities';
import { ONESIGNAL_APP_ID } from '@/constants/config';
import { Card } from './card';
import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';

export function FollowerActivityControl({ sessionId }: { sessionId: Id<'liveSessions'> | null }) {
  const { isAuthenticated } = useConvexAuth();
  // Remote starts require iOS 17.2. Older binaries also lack follower-safe
  // cleanup and deep links, so do not offer a control they cannot honour.
  const [major, minor = 0] = String(Platform.Version).split('.').map(Number);
  const supported = Platform.OS === 'ios' && !!ONESIGNAL_APP_ID && (major > 17 || (major === 17 && minor >= 2)) && supportsFollowerActivities();
  const status = useQuery(api.followerActivities.status, supported && isAuthenticated && sessionId ? { sessionId } : 'skip');
  const setEnabled = useMutation(api.followerActivities.setEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!supported || !sessionId || !status || (status.phase === 'ended' && !status.enabled)) return null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await setEnabled({ sessionId, enabled: !status.enabled });
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'Could not change Lock Screen updates. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <ThemedText type="smallBold">Follow from your Lock Screen</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {status.enabled
          ? status.phase === 'waiting'
            ? 'Enabled for travel day. The card starts four hours before departure.'
            : 'Lock Screen updates are enabled for this trip. Allow Live Activities in iPhone Settings to see the card.'
          : 'Keep flight progress, delays and arrival time a glance away. The card ends an hour after arrival.'}
      </ThemedText>
      {(error || status.failed) && <ThemedText type="small">{error ?? 'Could not start Lock Screen updates. Please try again.'}</ThemedText>}
      <PrimaryButton label={busy ? 'Saving…' : status.enabled ? 'Turn off Lock Screen updates' : 'Show on Lock Screen'} disabled={busy} onPress={toggle} />
    </Card>
  );
}
