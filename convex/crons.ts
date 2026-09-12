import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

// Safety net for the live sessions: closes expired ones and re-arms poll
// chains that died (see liveInternal.closeExpired). Hourly is enough — the
// chains reschedule themselves in the happy path.
crons.interval('close expired live sessions', { hours: 1 }, internal.liveInternal.closeExpired, {});

// Retention sweep for the cached provider answers. The provider's terms cap
// retention at 7 consecutive days and require deletion after, so this is a
// compliance job — see provider.prune.
crons.interval('prune cached flight facts', { hours: 6 }, internal.provider.prune, {});

// The Live Activity proxy's abuse meter only needs a day of history.
crons.interval('prune live activity meter', { hours: 12 }, internal.liveActivityMeter.prune, {});

crons.interval('prune abuse counters', { hours: 1 }, internal.abuse.prune, {});
crons.interval('prune photo uploads', { hours: 1 }, internal.uploads.prune, {});

export default crons;
