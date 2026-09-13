// Intentional editorial pause: keep native animations recording between taps.
// Maestro's JS runtime has no setTimeout. Each pause is bounded to 12 seconds.
var holdUntil = Date.now() + Math.min(Number(HOLD_MS), 12000);
while (Date.now() < holdUntil) {}
