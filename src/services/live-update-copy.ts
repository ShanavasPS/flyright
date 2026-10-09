import type { LiveContent } from '@/services/travel-day';

/** The Android live notification's two lines, from the same lead rule the
 * iPhone Lock Screen draws (convex/liveShared.ts liveLead): the clock label
 * and the facts that matter now as the title ("Departs in · Gate 53 · Seat
 * 14A", "Lands in · Seat 14A · Belt 7", "Landed 17:08 · Belt 7"), the fact's sub line under
 * it, led by the delay chip when late ("+46 min · Was 15:14"). No flight
 * number and no next-step sentence — the status-bar chip carries the
 * countdown itself. */
export function liveUpdateLines(
  content: Pick<LiveContent, 'clockLabel' | 'lead' | 'delayChip'> & Partial<Pick<LiveContent, 'countdownEnd' | 'second'>>,
): { title: string; text: string } {
  const label = sentenceCase(clockWord(content));
  // A value that already names itself ("Belt 7") needs no label before it.
  const fact = (f: { label: string; value: string } | null | undefined) =>
    f ? (/^[A-Za-z]+\s/.test(f.value) ? f.value : `${sentenceCase(f.label)} ${f.value}`) : null;
  const title = [label, fact(content.lead), fact(content.second)].filter(Boolean).join(' · ');
  const text = [content.delayChip, content.lead?.sub].filter(Boolean).join(' · ');
  return { title, text };
}

/** The notification draws the countdown itself (a chronometer in its
 * header), so "DEPARTS IN" only reads right while there is one to draw.
 * With no countdown left — the last minute, or a take-off recorded with
 * no landing to count to yet — the label names the moment instead, the
 * way the headline does: "Departing now" / "Landing now". A bare "Departs
 * in" was what a traveller saw all flight (2026-09-24). */
function clockWord(content: Pick<LiveContent, 'clockLabel'> & Partial<Pick<LiveContent, 'countdownEnd'>>): string {
  if (content.countdownEnd !== undefined && content.countdownEnd === null) {
    if (content.clockLabel === 'DEPARTS IN') return 'DEPARTING NOW';
    if (content.clockLabel === 'LANDS IN') return 'LANDING NOW';
  }
  return content.clockLabel;
}

/** "DEPARTS IN" → "Departs in", "LANDED 17:08" → "Landed 17:08",
 * "CHECK-IN" → "Check-in". The Lock Screen shouts in caps; a notification
 * title reads as a sentence. A 12-hour time keeps its "AM" / "PM", as the
 * line under it prints them ("Landed 5:11 AM", not "5:11 am"). */
function sentenceCase(text: string): string {
  const lower = text.toLowerCase().replace(/(\d)(\s?)([ap]m)\b/g, (_, digit, space, half) => digit + space + half.toUpperCase());
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
