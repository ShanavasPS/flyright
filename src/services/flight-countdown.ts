/** How far off a followed flight is, in the unit a follower is actually
 * counting in: minutes inside the hour, hours and minutes inside the day,
 * days beyond. "Departs in 2h 15m" until the wheels go up, then "Lands in
 * 45m" until they're down — the two questions anyone waiting on a traveller
 * asks, in the order they ask them. Null once the flight is on the ground:
 * the stage line says "Landed", and a clock counting up says nothing more.
 *
 * Pass the clocks the airline now says (see liveTimes) so a 45-minute delay
 * moves the countdown with the plane instead of arguing with it. */
export function flightCountdown(
  times: { departure: string; arrival: string },
  now: Date,
): string | null {
  const dep = Date.parse(times.departure) - now.getTime();
  if (Number.isNaN(dep)) return null;
  if (dep > 0) return `Departs in ${spanLabel(dep)}`;
  const arr = Date.parse(times.arrival) - now.getTime();
  if (Number.isNaN(arr) || arr <= 0 || times.arrival === times.departure) return null;
  return `Lands in ${spanLabel(arr)}`;
}

/** "45m" / "2h 15m" / "3h" / "3d" — a positive span, rounded to the minute
 * below a day (the follower is refreshing) and to the day above it. */
export function spanLabel(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(ms / 86_400_000)}d`;
}
