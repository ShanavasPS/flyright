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
    scheduler: { runAfter: async (...args) => { scheduled.push(args); return `task:${scheduled.length}`; }, cancel: async () => {} },
  };
  ctx.runMutation = ctx.runAction = async (ref, args) => {
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
    await assert.rejects(photos.push.handler(s.ctx, { rows: [photo] }), /Upload this photo again/);
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
    for (let i = 1; i < 30; i++) await photos.generateUploadUrl.handler(s.ctx, {});
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
