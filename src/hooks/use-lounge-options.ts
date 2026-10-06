import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';

import { airportZone } from '@/services/airports';
import { loungeOptions, type LoungeOption } from '@/services/lounge-access';
import { loungeDeparture, statusEvidence, type LoungeFacts, type LoungeTrip } from '@/services/lounge-trip';
import { useLounges } from '@/services/lounges';
import { useMemberships, type MembershipRow } from '@/services/memberships';

/** Every lounge at a trip's departure airport with its verdict for this
 * traveller (docs/lounges.md). Undefined while the directory or the
 * memberships load; an empty list where the directory has nothing. */
export function useLoungeOptions(
  trip: LoungeTrip | null | undefined,
  facts?: LoungeFacts,
): { options: LoungeOption[]; memberships: MembershipRow[]; zone: string | null } | undefined {
  const { userId } = useAuth();
  const memberships = useMemberships(userId);
  const lounges = useLounges([trip?.fromCode]);
  const terminal = facts?.terminal ?? null;
  const boardingTime = facts?.boardingTime ?? null;
  const estimatedDeparture = facts?.estimatedDeparture ?? null;

  return useMemo(() => {
    if (!trip || !lounges || !memberships) return undefined;
    const zone = airportZone(trip.fromCode);
    const departure = loungeDeparture(trip, zone, { terminal, boardingTime, estimatedDeparture });
    if (!departure) return { options: [], memberships, zone };
    const thisMonth = new Date().toISOString().slice(0, 7);
    return {
      options: loungeOptions(lounges, departure, statusEvidence(trip, memberships), [], thisMonth),
      memberships,
      zone,
    };
  }, [trip, lounges, memberships, terminal, boardingTime, estimatedDeparture]);
}
