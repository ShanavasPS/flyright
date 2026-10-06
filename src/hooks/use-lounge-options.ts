import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';

import { airportZone } from '@/services/airports';
import { loungeOptions, type LoungeOption, type LoungePass } from '@/services/lounge-access';
import { enginePass, networkInfo } from '@/services/lounge-pass-logic';
import { useLoungePasses, useLoungeVisits, type LoungePassRow, type LoungeVisitRow } from '@/services/lounge-passes';
import { loungeDeparture, statusEvidence, type LoungeFacts, type LoungeTrip } from '@/services/lounge-trip';
import { useLounges } from '@/services/lounges';
import { useMemberships, type MembershipRow } from '@/services/memberships';

/** Every lounge at a trip's departure airport with its verdict for this
 * traveller (docs/lounges.md). Undefined while the directory or the
 * memberships load; an empty list where the directory has nothing. */
export function useLoungeOptions(
  trip: LoungeTrip | null | undefined,
  facts?: LoungeFacts,
):
  | {
      options: LoungeOption[];
      memberships: MembershipRow[];
      passes: LoungePassRow[];
      visits: LoungeVisitRow[];
      zone: string | null;
    }
  | undefined {
  const { userId } = useAuth();
  const memberships = useMemberships(userId);
  const passes = useLoungePasses(userId);
  const visits = useLoungeVisits(userId);
  const lounges = useLounges([trip?.fromCode]);
  const terminal = facts?.terminal ?? null;
  const boardingTime = facts?.boardingTime ?? null;
  const estimatedDeparture = facts?.estimatedDeparture ?? null;

  return useMemo(() => {
    if (!trip || !lounges || !memberships || !passes || !visits) return undefined;
    const zone = airportZone(trip.fromCode);
    const departure = loungeDeparture(trip, zone, { terminal, boardingTime, estimatedDeparture });
    if (!departure) return { options: [], memberships, passes, visits, zone };
    const today = new Date().toISOString().slice(0, 10);
    const engine = passes.map((p) => enginePass(p, visits, today)).filter((p): p is LoungePass => !!p);
    return {
      options: loungeOptions(lounges, departure, statusEvidence(trip, memberships), engine, today.slice(0, 7)),
      memberships,
      passes,
      visits,
      zone,
    };
  }, [trip, lounges, memberships, passes, visits, terminal, boardingTime, estimatedDeparture]);
}

/** Names a pass by its id for wayLine: "Priority Pass". */
export function passNamer(passes: LoungePassRow[]): (id: string) => string | null {
  return (id) => {
    const pass = passes.find((p) => p.id === id);
    return pass ? (networkInfo(pass.network)?.name ?? null) : null;
  };
}
