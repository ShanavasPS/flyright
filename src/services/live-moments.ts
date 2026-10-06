import type { LiveContent } from '@/services/travel-day';

/** What the hero card felt last time — compared with the next render to
 * decide which travel-day moments just happened in front of the traveller. */
export type LiveMemory = {
  delayLabel: string | null;
  gate: string | null;
  tone: LiveContent['tone'];
  /** Ground → air → landed. Null until a render says which; the clock's
   * last minute ("Departing now") has no countdown and keeps the last one. */
  phase: 'ground' | 'air' | 'landed' | null;
};

export type LiveMoment = 'delay' | 'gate' | 'boarding' | 'takeOff' | 'landed';

type Snapshot = Pick<LiveContent, 'delayLabel' | 'gate' | 'tone' | 'countdownKind'>;

function phaseOf(s: Snapshot, previous: LiveMemory['phase']): LiveMemory['phase'] {
  if (s.tone === 'landed') return 'landed';
  if (s.countdownKind === 'arrival') return 'air';
  if (s.countdownKind === 'departure') return 'ground';
  return previous;
}

export function rememberLive(s: Snapshot): LiveMemory {
  return { delayLabel: s.delayLabel, gate: s.gate, tone: s.tone, phase: phaseOf(s, null) };
}

/** The moments between two renders of the same journey's card. The first
 * render is remembered, never felt — opening the app on a landed flight is
 * old news. A new delay or gate counts each time it changes; boarding,
 * take-off and landing only on the step forward, so a data wobble back and
 * forth can't replay them. */
export function liveMoments(
  memory: LiveMemory,
  next: Snapshot,
): { moments: LiveMoment[]; memory: LiveMemory } {
  const moments: LiveMoment[] = [];
  const phase = phaseOf(next, memory.phase);

  if (phase === 'landed' && memory.phase && memory.phase !== 'landed') moments.push('landed');
  else if (phase === 'air' && memory.phase === 'ground') moments.push('takeOff');
  else if (next.tone === 'boarding' && memory.tone !== 'boarding' && rank(phase) <= 1) moments.push('boarding');

  if (next.delayLabel && next.delayLabel !== memory.delayLabel) moments.push('delay');
  if (next.gate && next.gate !== memory.gate) moments.push('gate');

  return {
    moments,
    memory: {
      delayLabel: next.delayLabel,
      gate: next.gate,
      tone: next.tone,
      // Never step back: a stale poll reading "departure" after take-off
      // would otherwise let the next fresh one replay the roll.
      phase: rank(phase) >= rank(memory.phase) ? phase : memory.phase,
    },
  };
}

function rank(phase: LiveMemory['phase']): number {
  return phase === 'landed' ? 3 : phase === 'air' ? 2 : phase === 'ground' ? 1 : 0;
}
