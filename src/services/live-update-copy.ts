import type { LiveContent } from '@/services/travel-day';

/** The Android live notification's two lines, from the same lead rule the
 * iPhone Lock Screen draws (convex/liveShared.ts liveLead): the clock label
 * and the one fact that matters now as the title ("Departs in · Gate 53",
 * "Lands in · Seat 14A", "Landed 17:08 · Belt 7"), the fact's sub line under
 * it, led by the delay chip when late ("+46 min · Was 15:14"). No flight
 * number and no next-step sentence — the status-bar chip carries the
 * countdown itself. */
export function liveUpdateLines(
  content: Pick<LiveContent, 'clockLabel' | 'lead' | 'delayChip'>,
): { title: string; text: string } {
  const label = sentenceCase(content.clockLabel);
  // A value that already names itself ("Belt 7") needs no label before it.
  const fact = content.lead
    ? /^[A-Za-z]+\s/.test(content.lead.value)
      ? content.lead.value
      : `${sentenceCase(content.lead.label)} ${content.lead.value}`
    : null;
  const title = [label, fact].filter(Boolean).join(' · ');
  const text = [content.delayChip, content.lead?.sub].filter(Boolean).join(' · ');
  return { title, text };
}

/** "DEPARTS IN" → "Departs in", "LANDED 17:08" → "Landed 17:08",
 * "CHECK-IN" → "Check-in". The Lock Screen shouts in caps; a notification
 * title reads as a sentence. */
function sentenceCase(text: string): string {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
