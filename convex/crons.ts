import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

// Safety net for the live sessions: closes expired ones and re-arms poll
// chains that died (see liveInternal.closeExpired). Hourly is enough — the
// chains reschedule themselves in the happy path.
crons.interval('close expired live sessions', { hours: 1 }, internal.liveInternal.closeExpired, {});

export default crons;
