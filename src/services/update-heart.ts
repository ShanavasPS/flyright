/**
 * A heart flipped in whatever a query holds, for the optimistic update in
 * hooks/use-react-to-update. The same update can sit in several shapes — a
 * feed post, a trip's list, the pass's `update.latest` — so this walks the
 * value and flips every object that IS that update (an `updateId` with a
 * `reacted` flag and a `reactions` count). Untouched branches keep their
 * identity, so nothing else re-renders.
 */
export function flipHeart<T>(value: T, updateId: string): T {
  return walk(value, updateId) as T;
}

function walk(value: unknown, updateId: string): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = walk(item, updateId);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  if (!value || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  if (obj.updateId === updateId && typeof obj.reacted === 'boolean' && typeof obj.reactions === 'number') {
    const reacted = !obj.reacted;
    return { ...obj, reacted, reactions: Math.max(0, obj.reactions + (reacted ? 1 : -1)) };
  }
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(obj)) {
    const next = walk(item, updateId);
    if (next !== item) changed = true;
    out[key] = next;
  }
  return changed ? out : value;
}
