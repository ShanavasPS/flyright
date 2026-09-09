import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PublicSession } from '../../convex/liveShared';

import { AirlineLogo } from '@/components/airline-logo';
import { Avatar } from '@/components/avatar';
import { PassCard } from '@/components/pass-card';
import { Contrail, clocks } from '@/components/route-leg';
import { COBALT, WHITE, WHITE_DIM } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { compactLiveView } from '@/services/connections';

export const NAVY = '#0C1B36';
export const LIVE_GREEN = '#2FD68C';
const AMBER = '#F2B441';

/** A connecting leg as the server whitelists it for a follower. */
export interface OnwardLegLike {
  journeyId?: string;
  number: string;
  carrier: string;
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
  scheduledArrival: string;
}

/**
 * Somebody's live trip as a night-sky pass: their face and name, the one time
 * fact a follower is waiting on ("Departs in 2h 16m", "Lands in 45m",
 * "Landed 8:55 AM"), the leg with the clocks the airline now says and the
 * plane where the flight is, the airline's mark. The People tab and the My
 * travels home screen draw the same card — one design for one thing, so a
 * follower never has to learn two.
 *
 * Once a leg has landed and a connection is still to leave, the pass becomes
 * the next leg (see compactLiveView).
 */
export function LivePass({
  person,
  session,
  onward,
  now,
  onPress,
  testID,
}: {
  person: { name: string; imageUrl: string | null; pro?: boolean };
  session: PublicSession;
  onward: OnwardLegLike[];
  now: Date;
  onPress?: () => void;
  testID?: string;
}) {
  // The leg the follower should be watching — the live one, or once it has
  // landed, the connection about to leave.
  const view = compactLiveView(session, onward, now);
  const { headline, delayed, progress, connecting } = view;
  const detail = [view.detail, view.layover].filter(Boolean).join(' · ') || null;
  const when = clocks(view.leg);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.name}'s trip: ${headline}`}
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <PassCard style={styles.pass}>
        <View style={styles.row}>
          <Avatar
            name={person.name}
            imageUrl={person.imageUrl}
            size={44}
            ring={LIVE_GREEN}
            pro={person.pro}
            badgeBorder={NAVY}
          />
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {person.name}
            </Text>
            {/* The headline is the line a follower is here for, so it takes
                the bold slot under the name, amber once the flight is late;
                what is happening around it reads quietly beneath. */}
            <Text style={[styles.headline, delayed && styles.delayed]} numberOfLines={1}>
              {headline}
            </Text>
            {detail && (
              <Text style={styles.detail} numberOfLines={1}>
                {detail}
              </Text>
            )}
          </View>
          {/* The pill means "updating now"; once down, the bold "Landed
              8:55 AM" line already says everything, so nothing sits beside
              it. */}
          {session.currentStage !== 'landed' && <LivePill />}
        </View>
        <View style={styles.route}>
          <View>
            <Text style={styles.code}>{view.leg.fromCode}</Text>
            <Text style={styles.clock}>{when.dep ?? ' '}</Text>
          </View>
          <Contrail
            progress={progress}
            tint={delayed ? AMBER : COBALT}
            dotColor={WHITE_DIM}
            style={styles.contrail}
          />
          <View>
            <Text style={[styles.code, styles.codeRight]}>{view.leg.toCode}</Text>
            <Text style={[styles.clock, styles.codeRight]}>{when.arr ?? ' '}</Text>
          </View>
          <View style={styles.logo}>
            <AirlineLogo number={view.number} carrier={view.carrier} size={28} />
          </View>
        </View>
        {connecting && (
          <Text style={styles.detail} numberOfLines={2}>
            {connecting}
          </Text>
        )}
      </PassCard>
    </Pressable>
  );
}

/** "Live" — the quiet marker that this card updates on its own. */
export function LivePill() {
  return (
    <View style={styles.pill}>
      <View style={styles.pillDot} />
      <Text style={styles.pillText}>Live</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.9 },
  pass: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    color: WHITE,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 700,
  },
  headline: {
    color: COBALT,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 700,
  },
  detail: {
    color: WHITE_DIM,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
  },
  delayed: {
    color: AMBER,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
    backgroundColor: 'rgba(47,214,140,0.16)',
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: LIVE_GREEN,
  },
  pillText: {
    color: LIVE_GREEN,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  code: {
    color: WHITE,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: 700,
    letterSpacing: 1,
  },
  codeRight: {
    textAlign: 'right',
  },
  clock: {
    color: WHITE_DIM,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 600,
  },
  contrail: {
    flex: 1,
    alignSelf: 'auto',
  },
  logo: {
    marginLeft: Spacing.two,
  },
});
