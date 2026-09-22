// Offline security review reproductions. No credentials, network, or real user data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const requireRepo = Module.createRequire(path.join(root, 'package.json'));
const ts = requireRepo('typescript');
const originalLoad = Module._load;
const reference = parts => new Proxy({}, { get: (_, key) => key === '__path' ? parts : reference([...parts, key]) });
const api = reference([]);
Module._load = function (id, parent, main) {
  if (id.endsWith('_generated/server')) return Object.fromEntries(
    ['mutation', 'query', 'action', 'internalMutation', 'internalQuery', 'internalAction', 'httpAction'].map(k => [k, x => x]));
  if (id.endsWith('_generated/api')) return { api, internal: api };
  if (id.startsWith('@/')) id = path.join(root, 'src', id.slice(2));
  return originalLoad.call(this, id, parent, main);
};
Module._extensions['.ts'] = (m, filename) => m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, filename);
global.fetch = async () => { throw new Error('Network forbidden in offline review'); };
const load = file => require(path.join(root, file));

function context(subject = 'attacker', email = 'attacker@example.invalid') {
  const tables = new Map(); let n = 0;
  const rows = table => { if (!tables.has(table)) tables.set(table, []); return tables.get(table); };
  const get = id => [...tables.values()].flat().find(r => r._id === id) ?? null;
  const scheduled = [], deletedFiles = [], urls = [];
  const expr = {
    field: f => r => r[f], eq: (a, b) => r => (typeof a === 'function' ? a(r) : a) === (typeof b === 'function' ? b(r) : b),
    and: (...p) => r => p.every(f => f(r)), or: (...p) => r => p.some(f => f(r)),
  };
  const ctx = {
    auth: { getUserIdentity: async () => subject ? { subject, email } : null },
    db: {
      query(table) {
        const predicates = []; let direction = 'asc';
        const result = () => rows(table).filter(r => predicates.every(p => p(r))).sort((a,b) => (a._creationTime-b._creationTime)*(direction==='desc'?-1:1));
        const query = {
          withIndex(_index, build) {
            const index = Object.fromEntries(['eq','gt','gte','lt','lte'].map(op => [op, (f,v) => {
              predicates.push(r => ({eq:()=>r[f]===v,gt:()=>r[f]>v,gte:()=>r[f]>=v,lt:()=>r[f]<v,lte:()=>r[f]<=v})[op]()); return index;
            }]));
            if (build) build(index); return query;
          },
          filter(fn) { predicates.push(fn(expr)); return query; },
          order(d) { direction=d; return query; },
          collect: async () => result(), take: async count => result().slice(0,count),
          first: async () => result()[0] ?? null,
          unique: async () => { const r=result(); assert(r.length<=1, `nonunique ${table}`); return r[0]??null; },
        }; return query;
      },
      get: async id => get(id),
      insert: async (table, value) => { const row={...value,_id:`${table}:${++n}`,_creationTime:n}; rows(table).push(row); return row._id; },
      patch: async (id, value) => { assert(get(id), `missing ${id}`); Object.assign(get(id),value); },
      delete: async id => { for(const items of tables.values()) {const i=items.findIndex(r=>r._id===id); if(i>=0)items.splice(i,1);} },
    },
    storage: {
      generateUploadUrl: async () => { const url=`https://storage.example.invalid/upload/${urls.length}`; urls.push(url); return url; },
      getUrl: async id => `https://storage.example.invalid/api/storage/${id}`,
      delete: async id => { deletedFiles.push(id); },
    },
    scheduler: {
      runAfter: async (...args) => { scheduled.push(args); return `task:${scheduled.length}`; },
      runAt: async (...args) => { scheduled.push(args); return `task:${scheduled.length}`; },
      cancel: async () => {},
    },
  };
  ctx.runQuery = ctx.runMutation = ctx.runAction = async (ref, args) => {
    const [module, name] = ref.__path;
    const fn = load(`convex/${module}.ts`)[name];
    return (fn.handler ?? fn)(ctx, args);
  };
  return { ctx, rows, scheduled, deletedFiles, urls };
}

let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
(async () => {
  const users = load('convex/users.ts'), circle = load('convex/circle.ts'), photos = load('convex/photos.ts');
  const support = load('convex/support.ts'), uploads = load('convex/uploads.ts'), entitlements = load('convex/entitlements.ts');
  const { boundedBody, imageType } = load('convex/uploadShared.ts');
  const { pushAlias } = load('convex/pushIdentity.ts');
  const { entitlementChange, proUntilFromSubscriber } = load('convex/entitlementShared.ts');
  const { inviteUsable } = load('convex/liveHelpers.ts');
  const { safeAvatar } = load('convex/profileShared.ts');
  const photo = { photoId: 'photo', journeyKey: 'trip', storageId: 'victim-file', width: 1, height: 1, createdAt: '2026-09-12T00:00:00Z', updatedAt: '2026-09-12T00:00:00Z', deletedAt: null };
  const activities = load('convex/followerActivities.ts');
  const live = load('convex/live.ts');
  const { followerActivityWindow, followerContentState } = load('convex/followerActivityShared.ts');
  const { ACTIVITY_LIFETIME_MS } = load('convex/liveShared.ts');
  async function followerFixture(overrides = {}) {
    const s = context('viewer');
    const now = Date.now();
    const journeyId = await s.ctx.db.insert('journeys', { userId: 'owner', naturalKey: 'private-owner-key', deletedAt: null });
    const sessionId = await s.ctx.db.insert('liveSessions', {
      userId: 'owner', naturalKey: 'private-owner-key', number: 'AY1', carrier: 'Finnair', fromCode: 'HEL', toCode: 'LHR',
      status: 'active', shareToken: 'token', activityId: 'owner-activity',
      currentStage: 'security', stageTimes: {}, notifiedStages: {}, pendingNotify: false,
      scheduledDeparture: new Date(now + 2 * 3_600_000).toISOString(),
      scheduledArrival: new Date(now + 5 * 3_600_000).toISOString(),
      expiresAt: new Date(now + 48 * 3_600_000).toISOString(),
      delayMinutes: null, gate: '12', terminal: '2', baggageBelt: null, flightStatus: null,
      ...overrides,
    });
    const followId = await s.ctx.db.insert('follows', { sessionId, ownerId: 'owner', followerId: 'viewer', muted: false });
    return { ...s, sessionId, followId, journeyId };
  }
  await check('follower Lock Screen opt-in targets only the caller and exposes no owner activity credential', async () => {
    const s = await followerFixture();
    await activities.setEnabled.handler(s.ctx, { sessionId: s.sessionId, enabled: true });
    const f = await s.ctx.db.get(s.followId);
    assert.match(f.liveActivityId, /^following~/);
    const target = await activities.delivery.handler(s.ctx, { followId: s.followId, activityId: f.liveActivityId });
    assert.equal(target.followerId, 'viewer');
    assert.equal(target.attributes.deepLink, `flyright://following/${s.sessionId}`);
    assert.equal(target.attributes.journeyId, '');
    assert(!JSON.stringify(target).includes('private-owner-key'));
    assert(!JSON.stringify(target).includes('owner-activity'));
    assert.equal((await live.byFollow.handler(s.ctx, { sessionId: s.sessionId })).viewerFollows, true);
    const jobs = s.scheduled.length;
    await activities.setEnabled.handler(s.ctx, { sessionId: s.sessionId, enabled: true });
    assert.equal(s.scheduled.length, jobs, 'repeated enable must not mint or start a duplicate');
    s.ctx.auth.getUserIdentity = async () => ({ subject: 'stranger' });
    assert.equal(await activities.status.handler(s.ctx, { sessionId: s.sessionId }), null);
    assert.deepEqual(await activities.mine.handler(s.ctx, {}), []);
    assert.deepEqual(await live.byFollow.handler(s.ctx, { sessionId: s.sessionId }), { gone: true });
    await assert.rejects(activities.setEnabled.handler(s.ctx, { sessionId: s.sessionId, enabled: true }), /no longer shared/);
  });
  await check('private, close-circle, blocked and revoked trips cannot deliver follower activities', async () => {
    for (const change of ['private', 'close', 'blocked', 'revoked', 'deleted']) {
      const s = await followerFixture();
      await activities.setEnabled.handler(s.ctx, { sessionId: s.sessionId, enabled: true });
      const activityId = (await s.ctx.db.get(s.followId)).liveActivityId;
      if (change === 'private') await s.ctx.db.patch(s.journeyId, { privateTrip: true });
      if (change === 'close') await s.ctx.db.patch(s.journeyId, { hiddenFromCircle: true });
      if (change === 'blocked') await s.ctx.db.insert('blocks', { blockerId: 'owner', blockedId: 'viewer' });
      if (change === 'revoked') await s.ctx.db.patch(s.sessionId, { shareToken: null });
      if (change === 'deleted') await s.ctx.db.patch(s.journeyId, { deletedAt: 'now' });
      assert.equal(await activities.delivery.handler(s.ctx, { followId: s.followId, activityId }), null, change);
      await activities.syncSession.handler(s.ctx, { sessionId: s.sessionId });
      assert.equal((await s.ctx.db.get(s.followId)).liveActivityEnabled, false, change);
      assert(s.scheduled.some(([, ref, args]) => ref.__path.join('.') === 'followerActivities.endActivity' && args.activityId === activityId), change);
    }
  });
  await check('close-circle members keep permitted Lock Screen access; removing them ends the card', async () => {
    const s = await followerFixture();
    await s.ctx.db.patch(s.journeyId, { hiddenFromCircle: true });
    await s.ctx.db.insert('circle', { ownerId: 'owner', memberId: 'viewer', close: true, muted: true });
    await activities.setEnabled.handler(s.ctx, { sessionId: s.sessionId, enabled: true });
    const activityId = (await s.ctx.db.get(s.followId)).liveActivityId;
    assert(await activities.delivery.handler(s.ctx, { followId: s.followId, activityId }));
    await load('convex/liveHelpers.ts').severCircle(s.ctx, 'owner', 'viewer');
    assert.equal(await s.ctx.db.get(s.followId), null);
    assert(s.scheduled.some(([, ref, args]) => ref.__path.join('.') === 'followerActivities.endActivity' && args.activityId === activityId));
  });
  await check('unfollow and account deletion retain enough information to end cards after records disappear', async () => {
    for (const action of ['unfollow', 'owner-delete', 'follower-delete']) {
      const s = await followerFixture();
      await activities.setEnabled.handler(s.ctx, { sessionId: s.sessionId, enabled: true });
      const activityId = (await s.ctx.db.get(s.followId)).liveActivityId;
      if (action === 'unfollow') await live.unfollow.handler(s.ctx, { sessionId: s.sessionId });
      else await users.purge.handler(s.ctx, { userId: action === 'owner-delete' ? 'owner' : 'viewer' });
      assert.equal(await s.ctx.db.get(s.followId), null);
      assert(s.scheduled.some(([, ref, args]) => ref.__path.join('.') === 'followerActivities.endActivity' && args.activityId === activityId));
    }
  });
  await check('future trips wait until T-4h and long flights rotate the follower activity without touching the owner', async () => {
    const s = await followerFixture({ scheduledDeparture: new Date(Date.now() + 20 * 3_600_000).toISOString(), scheduledArrival: new Date(Date.now() + 30 * 3_600_000).toISOString() });
    await activities.setEnabled.handler(s.ctx, { sessionId: s.sessionId, enabled: true });
    assert.equal((await s.ctx.db.get(s.followId)).liveActivityId, undefined);
    assert(!s.scheduled.some(([, ref]) => ref.__path.join('.') === 'followerActivities.deliver'));
    await s.ctx.db.patch(s.sessionId, { scheduledDeparture: new Date(Date.now() + 3_600_000).toISOString() });
    await activities.wake.handler(s.ctx, { followId: s.followId });
    const first = (await s.ctx.db.get(s.followId)).liveActivityId;
    await s.ctx.db.patch(s.followId, { liveActivityStartedAt: Date.now() - ACTIVITY_LIFETIME_MS });
    await activities.wake.handler(s.ctx, { followId: s.followId });
    assert.notEqual((await s.ctx.db.get(s.followId)).liveActivityId, first);
    assert.equal((await s.ctx.db.get(s.sessionId)).activityId, 'owner-activity');
  });
  await check('landing, cancellation and expiry end the card; follower copy reports events and timetable uncertainty', async () => {
    const s = await followerFixture();
    const session = await s.ctx.db.get(s.sessionId);
    const now = Date.now();
    assert.equal(followerActivityWindow(session, now).phase, 'live');
    assert.equal(followerActivityWindow({ ...session, estimatedDeparture: new Date(now + 8 * 3_600_000).toISOString() }, now).phase, 'live', 'a delay must not hide an active card');
    assert.equal(followerContentState(session, 'Anna', now).subtitle, 'Anna · Through security');
    const landed = { ...session, currentStage: 'landed', actualArrival: new Date(now).toISOString(), baggageBelt: '3' };
    assert.equal(followerActivityWindow(landed, now + 59 * 60_000).phase, 'live');
    assert.equal(followerActivityWindow(landed, now + 60 * 60_000).phase, 'ended');
    assert.equal(followerContentState(landed, 'Anna', now).countdownEnd, 0);
    assert.equal(followerContentState(landed, 'Anna', now).subtitle, 'Anna · Landed · Bags at belt 3');
    assert.equal(followerActivityWindow({ ...session, flightStatus: 'Canceled' }, now).phase, 'ended');
    assert.equal(followerActivityWindow({ ...session, expiresAt: new Date(now).toISOString() }, now).phase, 'ended');
    const timetable = { ...session, currentStage: null, scheduledDeparture: new Date(now - 3_600_000).toISOString() };
    assert.equal(followerContentState(timetable, 'Anna', now).subtitle, 'Anna · Going by the timetable');
  });
  await check('traveller stage taps schedule follower activity refreshes independently of notification debounce', async () => {
    const s = await followerFixture();
    s.ctx.auth.getUserIdentity = async () => ({ subject: 'owner' });
    await live.setStage.handler(s.ctx, { naturalKey: 'private-owner-key', stage: 'boarded', stamps: { boarded: new Date().toISOString() }, activityId: null });
    assert(s.scheduled.some(([, ref, args]) => ref.__path.join('.') === 'followerActivities.syncSession' && args.sessionId === s.sessionId));
  });
  await check('a follower disabling during an in-flight start gets an end after the start completes', async () => {
    const s = await followerFixture();
    await activities.setEnabled.handler(s.ctx, { sessionId: s.sessionId, enabled: true });
    const activityId = (await s.ctx.db.get(s.followId)).liveActivityId;
    const onesignal = load('convex/onesignal.ts');
    const originalStart = onesignal.startLiveActivity, originalPush = onesignal.pushLiveActivity;
    const events = [];
    try {
      onesignal.startLiveActivity = async (followerId, id) => {
        assert.equal(followerId, 'viewer'); assert.equal(id, activityId);
        await activities.setEnabled.handler(s.ctx, { sessionId: s.sessionId, enabled: false });
        events.push('start'); return true;
      };
      onesignal.pushLiveActivity = async (id, event, content, immediate) => {
        assert.equal(id, activityId); assert.equal(immediate, true);
        assert(!JSON.stringify(content).includes('Anna'));
        events.push(event); return true;
      };
      await activities.deliver.handler(s.ctx, { followId: s.followId, activityId, start: true });
      assert.deepEqual(events, ['start', 'end']);
    } finally {
      onesignal.startLiveActivity = originalStart; onesignal.pushLiveActivity = originalPush;
    }
  });
  await check('client cannot claim an email, including against a trusted existing profile', async () => {
    const s = context();
    await users.syncMyProfile.handler(s.ctx, { name: 'Friend', imageUrl: null, email: 'friend@example.invalid' });
    assert.equal(s.rows('profiles')[0].email, null);
    await users.upsertProfile.handler(s.ctx, { userId: 'attacker', name: 'Owner', imageUrl: null, email: 'real@example.invalid', emailVerified: true });
    await users.syncMyProfile.handler(s.ctx, { name: 'Friend', imageUrl: null, email: 'friend@example.invalid' });
    assert.equal(s.rows('profiles')[0].email, 'real@example.invalid');
    s.ctx.auth.getUserIdentity = async () => ({ subject: 'searcher' });
    assert.equal((await circle.searchPeople.handler(s.ctx, { q: 'friend@example.invalid' })).length, 0);
    assert.equal((await circle.searchPeople.handler(s.ctx, { q: 'real@example.invalid' }))[0].userId, 'attacker');
  });
  await check('legacy poisoned email and unmetered search no longer expose accounts', async () => {
    const s = context();
    await s.ctx.db.insert('profiles', { userId: 'victim', name: 'Victim', email: 'victim@example.invalid' });
    assert.deepEqual(await circle.searchPeople.handler(s.ctx, { q: 'victim@example.invalid' }), []);
    assert.deepEqual(await circle.findPeople.handler(s.ctx, { q: 'victim@example.invalid' }), []);
    assert.equal(safeAvatar('https://attacker.invalid/track'), null);
    assert.equal(safeAvatar('https://img.clerk.com/photo'), 'https://img.clerk.com/photo');
    assert.equal(safeAvatar('https://img.clerk.com.attacker.invalid/photo'), null);
  });
  await check('foreign storage cannot be attached, read through a poisoned row, or deleted by account purge', async () => {
    const s = context();
    await s.ctx.db.insert('ownedFiles', { userId: 'victim', storageId: 'victim-file', size: 100, createdAt: 1 });
    await s.ctx.db.insert('tripPhotos', { ...photo, userId: 'victim' });
    // Invalid files are skipped so one stale row cannot block the rest of a
    // traveller's photo batch. Assert the security boundary, not an old error.
    await photos.push.handler(s.ctx, { rows: [photo] });
    assert.equal(s.rows('tripPhotos').filter(row => row.userId === 'attacker').length, 0);
    await s.ctx.db.insert('tripPhotos', { ...photo, userId: 'attacker' }); // legacy poison
    assert.equal((await photos.list.handler(s.ctx))[0].url, null);
    await users.purge.handler(s.ctx, { userId: 'attacker' });
    assert.deepEqual(s.deletedFiles, []);
    assert.equal(s.rows('ownedFiles')[0].userId, 'victim');
  });
  await check('tombstones ignore client-supplied file IDs, while owned files can be deleted', async () => {
    const s = context();
    await photos.push.handler(s.ctx, { rows: [{ ...photo, deletedAt: photo.updatedAt }] });
    assert.deepEqual(s.deletedFiles, []);
    const t = context();
    await t.ctx.db.insert('ownedFiles', { userId: 'attacker', storageId: 'victim-file', size: 100, createdAt: 1 });
    await photos.push.handler(t.ctx, { rows: [photo] });
    assert((await photos.list.handler(t.ctx))[0].url.endsWith('/victim-file'));
    await photos.push.handler(t.ctx, { rows: [{ ...photo, deletedAt: photo.updatedAt }] });
    assert.deepEqual(t.deletedFiles, ['victim-file']);
  });
  await check('uploads are user-bound, single-use, expire, and enforce issuance quotas', async () => {
    process.env.CONVEX_SITE_URL = 'https://fixture.convex.site';
    const s = context();
    const url = await photos.generateUploadUrl.handler(s.ctx, {});
    const token = new URL(url).searchParams.get('ticket');
    const ticketId = await uploads.claim.handler(s.ctx, { token });
    assert(ticketId);
    assert.equal(await uploads.claim.handler(s.ctx, { token }), null);
    await uploads.finish.handler(s.ctx, { ticketId, storageId: 'new-file', size: 100 });
    assert.equal(s.rows('ownedFiles')[0].userId, 'attacker');
    for (let i = 1; i < 200; i++) await photos.generateUploadUrl.handler(s.ctx, {});
    await assert.rejects(photos.generateUploadUrl.handler(s.ctx, {}), /Too many requests/);
    const pending = s.rows('uploadTickets').find(t => t.state === 'pending');
    pending.expiresAt = 1;
    assert.equal(await uploads.claim.handler(s.ctx, { token: pending.token }), null);
  });
  await check('upload boundary rejects oversized streams and non-raster content', async () => {
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'));
    assert.equal(imageType(png), 'image/png');
    assert.equal(imageType(new TextEncoder().encode('<svg onload="alert(1)"></svg>')), null);
    const huge = png.slice(); new DataView(huge.buffer).setUint32(16, 100_000_000);
    assert.equal(imageType(huge), null);
    const request = new Request('https://fixture.invalid', { method: 'POST', body: '12345' });
    await assert.rejects(boundedBody(request, 4), /Body too large/);
    assert.equal(new TextDecoder().decode(await boundedBody(new Request('https://fixture.invalid', { method: 'POST', body: '1234' }), 4)), '1234');
  });
  await check('anonymous support rotation and authenticated reply flooding are blocked', async () => {
    const s = context(null);
    await assert.rejects(support.startThread.handler(s.ctx, { message: 'Please help me sign in', email: 'x@example.invalid', platform: 'web', appVersion: 'test' }), /Email support/);
    assert.equal(s.scheduled.length, 0);
    s.ctx.auth.getUserIdentity = async () => ({ subject: 'attacker', email: 'owner@example.invalid', emailVerified: true });
    const id = await support.startThread.handler(s.ctx, { message: 'Please help me sign in', email: 'forged@example.invalid', platform: 'web', appVersion: 'test' });
    assert.equal(s.rows('supportThreads')[0].email, 'owner@example.invalid');
    s.rows('supportThreads')[0].email = 'legacy-forgery@example.invalid';
    for (let i = 0; i < 5; i++) await support.reply.handler(s.ctx, { threadId: id, message: 'Please help with this issue' });
    await assert.rejects(support.reply.handler(s.ctx, { threadId: id, message: 'Please help with this issue' }), /Too many requests/);
    assert.equal(s.scheduled.length, 6);
    assert.equal(s.rows('supportThreads')[0].email, 'owner@example.invalid');
  });
  await check('cancel-and-resend cannot reset the invitation budget', async () => {
    const s = context();
    await s.ctx.db.insert('profiles', { userId: 'victim', name: 'Victim' });
    await circle.requestFollow.handler(s.ctx, { userId: 'victim' });
    const invitation = s.rows('circleRequests')[0];
    await circle.cancelRequest.handler(s.ctx, { requestId: invitation._id });
    await assert.rejects(circle.requestFollow.handler(s.ctx, { userId: 'victim' }), /Too many requests/);
    assert.equal(s.scheduled.length, 1);
  });
  await check('only owner-issued circle invitations are redeemable; trip follows expose no circle token', async () => {
    assert.equal(inviteUsable({ uses: 0, expiresAt: '2099-01-01' }), false);
    assert.equal(inviteUsable({ uses: 0, expiresAt: '2099-01-01', ownerIssued: true }), true);
    const s = context('viewer');
    await s.ctx.db.insert('liveSessions', { userId: 'owner', naturalKey: 'trip', shareToken: 'known-trip-token', status: 'active' });
    const result = await load('convex/live.ts').follow.handler(s.ctx, { token: 'known-trip-token' });
    assert.equal(result.circleInviteToken, null);
    assert.equal(s.rows('circleInvites').length, 0);
  });
  await check('refunds revoke lifetime access; production snapshots reject sandbox purchases', async () => {
    assert.equal(entitlementChange({ type: 'CANCELLATION', app_user_id: 'user_x', entitlement_ids: ['Owed Pro'], expiration_at_ms: null })?.proUntil, null);
    const snapshot = { entitlements: { 'Owed Pro': { product_identifier: 'lifetime', expires_date: null } }, non_subscriptions: { lifetime: [{ is_sandbox: true }] } };
    assert.equal(proUntilFromSubscriber(snapshot, false), null);
    snapshot.non_subscriptions.lifetime[0].is_sandbox = false;
    assert.equal(proUntilFromSubscriber(snapshot, false), '9999-12-31T00:00:00.000Z');
  });
  await check('a stale entitlement response cannot overwrite a newer revocation, and events deduplicate', async () => {
    const s = context();
    const old = await entitlements.reserveSnapshot.handler(s.ctx, { userId: 'owner' });
    const fresh = await entitlements.reserveSnapshot.handler(s.ctx, { userId: 'owner' });
    assert.equal(await entitlements.commitSnapshot.handler(s.ctx, { userId: 'owner', generation: fresh, proUntil: null }), true);
    assert.equal(await entitlements.commitSnapshot.handler(s.ctx, { userId: 'owner', generation: old, proUntil: '9999-12-31' }), false);
    assert.equal(s.rows('entitlements')[0].proUntil, null);
    assert.equal(await entitlements.eventProcessed.handler(s.ctx, { eventId: 'event-1', complete: false }), false);
    await entitlements.eventProcessed.handler(s.ctx, { eventId: 'event-1', complete: true });
    assert.equal(await entitlements.eventProcessed.handler(s.ctx, { eventId: 'event-1', complete: false }), true);
  });
  await check('push identities require a server secret and differ across accounts and key rotations', async () => {
    delete process.env.PUSH_IDENTITY_SECRET;
    assert.equal(await pushAlias('user_public'), null);
    process.env.PUSH_IDENTITY_SECRET = 'a'.repeat(43);
    const a = await pushAlias('user_public');
    assert.match(a, /^push_[a-f0-9]{64}$/);
    assert.equal(await pushAlias('user_public'), a);
    assert.notEqual(await pushAlias('user_other'), a);
    process.env.PUSH_IDENTITY_SECRET = 'b'.repeat(43);
    assert.notEqual(await pushAlias('user_public'), a);
  });
  await check('guest lookup allowance permits five fresh requests, then resets the next UTC day', async () => {
    const previousSecret = process.env.LOOKUP_QUOTA_SECRET;
    const previousPool = process.env.AERODATABOX_MONTHLY_UNITS;
    process.env.LOOKUP_QUOTA_SECRET = 'fixture-lookup-secret';
    process.env.AERODATABOX_MONTHLY_UNITS = '10000';
    try {
      const { begin, record } = load('convex/provider.ts');
      const { ctx, rows } = context(null);
      const args = {
        secret: 'fixture-lookup-secret', day: '2026-09-14', date: '2026-09-14',
        flight: 'AY1', want: 'base', kind: 'interactive', cost: 1,
        subject: { kind: 'anonymous', address: 'hashed-network' },
      };
      for (let n = 1; n <= 5; n++) {
        assert.equal((await begin.handler(ctx, { ...args, flight: `AY${n}` })).outcome, 'permit');
      }
      assert.equal(rows('lookupQuota')[0].count, 5);
      assert.equal((await begin.handler(ctx, { ...args, flight: 'AY6' })).reason, 'quota');
      assert.equal(rows('lookupQuota')[0].count, 5);
      // Signing in starts the separate account allowance on the same network.
      assert.equal((await begin.handler(ctx, { ...args, subject: { kind: 'user', userId: 'new-account' } })).outcome, 'permit');
      assert.equal((await begin.handler(ctx, { ...args, day: '2026-09-15' })).outcome, 'permit');
      // A shared cached result is free even after the five fresh lookups.
      await ctx.db.insert('flightFacts', {
        key: 'AY9:2026-09-14', flight: 'AY9', date: '2026-09-14',
        payload: '{"flight":"AY9"}', expiresAt: Date.now() + 60000,
      });
      assert.equal((await begin.handler(ctx, { ...args, flight: 'AY9' })).outcome, 'cached');
      assert.equal(rows('lookupQuota')[0].count, 5);
      // An upstream failure gives the guest their unit back.
      await record.handler(ctx, {
        secret: args.secret, flight: 'AY5', date: args.date, want: 'base',
        payload: null, phase: 'uncacheable', expiresAt: 0, units: 1, reported: null,
        refund: { day: args.day, cost: 1, subject: args.subject },
      });
      assert.equal(rows('lookupQuota')[0].count, 4);
      assert.equal((await begin.handler(ctx, { ...args, flight: 'AY6' })).outcome, 'permit');
      await assert.rejects(begin.handler(ctx, { ...args, secret: 'wrong' }), /forbidden/);
    } finally {
      if (previousSecret === undefined) delete process.env.LOOKUP_QUOTA_SECRET;
      else process.env.LOOKUP_QUOTA_SECRET = previousSecret;
      if (previousPool === undefined) delete process.env.AERODATABOX_MONTHLY_UNITS;
      else process.env.AERODATABOX_MONTHLY_UNITS = previousPool;
    }
  });
  await check('paid lookup fails closed when production metering is missing or unavailable', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LOOKUP_QUOTA_SECRET;
    const gate = load('src/server/lookup-gate.ts');
    assert.deepEqual(await gate.beginLookup({ kind: 'user', userId: 'x' }, { flight: 'AY1', date: '2026-09-12', want: 'base', cost: 1 }), { outcome: 'unavailable' });
    await assert.rejects(gate.providerCall('/flights'), /metering unavailable/i);
  });
  await check('support authentication rejects duplicate or attacker-authored receiver headers', async () => {
    const { senderAuthenticated } = load('convex/supportShared.ts');
    assert.equal(senderAuthenticated('attacker.invalid; dkim=pass header.d=gmail.com', 'gmail.com'), false);
    assert.equal(senderAuthenticated('mx.cloudflare.net; dkim=fail, attacker.invalid; dkim=pass header.d=gmail.com', 'gmail.com'), false);
    assert.equal(senderAuthenticated('mx.cloudflare.net; dkim=pass header.d=gmail.com', 'gmail.com'), true);
  });
  await check('CommonJS query-string decodes valid paths and withstands malicious percent runs', async () => {
    const qs = requireRepo('query-string'), decode = requireRepo('decode-uri-component');
    assert.equal(qs.parse('name=J%C3%B6rg&path=%2Ftrips').name, 'Jörg');
    assert.equal(qs.parse('path=%2Ftrips').path, '/trips');
    assert.equal(decode('%E2%82%AC%invalid'), '€%invalid');
    const attack = '%01'.repeat(100_000) + '%FF';
    const start = performance.now();
    assert.equal(qs.parse('q=' + attack).q.length, 100_003);
    assert(performance.now() - start < 3000, 'malformed query took over 3 seconds');
  });
  console.log(`${passed} security regression checks passed. Fixtures only; no production traffic.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
