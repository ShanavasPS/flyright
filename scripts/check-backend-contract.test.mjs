import test from 'node:test';
import assert from 'node:assert/strict';
import { checkContract, collectReferences, referencesInSource } from './check-backend-contract.mjs';

const url = 'https://example.convex.cloud';
const ref = new Map([['followerActivities:mine', ['src/components/follower-activity-sync.tsx']]]);
const fn = { identifier: 'followerActivities.js:mine', visibility: { kind: 'public' } };

test('blocks the exact undeployed signed-in startup query that broke 1.0.34', () => {
  assert.throws(() => checkContract(ref, { url, functions: [] }, url), /followerActivities:mine/);
  assert.equal(checkContract(ref, { url, functions: [fn] }, url).checked, 1);
});
test('an internal function or a reachable but wrong deployment does not pass', () => {
  assert.throws(() => checkContract(ref, { url, functions: [{ ...fn, visibility: { kind: 'internal' } }] }, url), /missing/);
  assert.throws(() => checkContract(ref, { url, functions: [fn] }, 'https://production.convex.cloud'), /deployment/);
});
test('reads renamed imports, nested modules and string access without matching comments', () => {
  assert.deepEqual(referencesInSource(`
    import { api as backend } from '../convex/_generated/api';
    // backend.fake.missing is not a real reference
    useQuery(backend.followerActivities.mine, {});
    useQuery(backend['nested']['photos'].list, {});
    type Result = ReturnType<typeof backend.circle.list>;
  `), ['followerActivities:mine', 'nested/photos:list']);
});
test('unresolved dynamic references fail instead of silently losing coverage', () => {
  assert.throws(() => referencesInSource(`import { api } from '../convex/_generated/api'; useQuery(api[module].list);`), /statically/);
});
test('the actual app startup and photo sync dependencies remain covered', () => {
  const actual = collectReferences();
  for (const name of ['followerActivities:mine', 'journeys:list', 'photos:list', 'photos:generateUploadUrl', 'photos:push']) assert.ok(actual.has(name), name);
});
