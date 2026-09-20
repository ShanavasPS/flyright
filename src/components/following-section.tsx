import { useAuth, useUser } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import { FollowingRail, MyUpdatesSheet, YouTile } from '@/components/following-rail';
import { useNow } from '@/hooks/use-now';
import type { JourneyRow } from '@/services/journeys';
import { onHomeScreen } from '@/services/public-session';
import type { TravelDayState } from '@/services/travel-day';
import { updateWindowOpen } from '@/services/trip-updates';
import { visibilityOf } from '@/services/trip-visibility';

/** The rail at the top of My travels: your own tile while your trip takes
 * updates, then the people you follow who are travelling. Nothing at all
 * on a day neither is true. The query is reactive, so stages and posts land
 * here without any refresh. Render only under CloudSync (Convex
 * configured). */
export function FollowingSection({
  own,
}: {
  /** Today's trip from the home hero, with its stage stamps, if any. */
  own: { journey: JourneyRow; state: TravelDayState } | null;
}) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const entries = useQuery(api.live.following, isSignedIn ? {} : 'skip');
  const now = useNow();
  const remove = useMutation(api.updates.remove);
  const [mineOpen, setMineOpen] = useState(false);

  // Your tile while the trip's update window is open (the day you fly
  // until a day after landing) and somebody besides you can see it.
  const sharing =
    isSignedIn &&
    own &&
    visibilityOf(own.journey) !== 'private' &&
    updateWindowOpen(own.journey, now.getTime(), own.state.stamps.landed ?? null)
      ? own.journey
      : null;
  const posted = useQuery(api.updates.mine, sharing ? { journeyKey: sharing.id } : 'skip');

  // The session lives 48h past arrival so late stamps still find it; the
  // server decided how long it leads and sent the deadline with it, so this
  // only watches the clock tick past it.
  const live = entries?.filter(({ session }) => onHomeScreen(session, now)) ?? [];
  if (!live.length && !sharing) return null;
  const latest = posted?.[0] ?? null;
  const hearts = (posted ?? []).reduce((sum, u) => sum + u.reactedBy.length, 0);
  const compose = () => {
    setMineOpen(false);
    if (sharing) router.push({ pathname: '/trip-update', params: { journeyId: sharing.id } });
  };

  return (
    <>
      <FollowingRail
        entries={live}
        now={now}
        leading={
          sharing && (
            <YouTile
              name={user?.fullName || user?.firstName || 'You'}
              imageUrl={user?.imageUrl ?? null}
              latest={latest}
              hearts={hearts}
              // Nothing posted yet: straight to the composer. After that, what
              // you shared and who hearted it, with "Share another" under it.
              onPress={posted?.length ? () => setMineOpen(true) : compose}
            />
          )
        }
        trailing={
          live.length
            ? { label: 'Friends', onPress: () => router.navigate({ pathname: '/people', params: { tab: 'following' } }) }
            : undefined
        }
      />
      {sharing && (
        <MyUpdatesSheet
          visible={mineOpen && !!posted?.length}
          tripLine={[sharing.number, `${sharing.fromCode} → ${sharing.toCode}`].filter(Boolean).join(' · ')}
          updates={posted ?? []}
          now={now}
          onRemove={(updateId) => void remove({ updateId: updateId as Id<'tripUpdates'> })}
          onCompose={compose}
          onClose={() => setMineOpen(false)}
        />
      )}
    </>
  );
}
