import { action } from './_generated/server';
import { internal } from './_generated/api';
import { HOUR } from './abuse';

declare const process: { env: Record<string, string | undefined> };

/** Opaque bearer aliases: public Clerk IDs never identify a push recipient.
 * Use a dedicated 32-byte secret, shared only by the token endpoint and sender.
 * Rotating it revokes all registered aliases and requires clients to rebind. */
export async function pushAlias(userId: string): Promise<string | null> {
  const secret = process.env.PUSH_IDENTITY_SECRET;
  if (!secret || secret.length < 43) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`flyright-push-v1:${userId}`));
  return 'push_' + Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('');
}

export const mine = action({
  args: {},
  handler: async (ctx): Promise<string | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    await ctx.runMutation(internal.abuse.consume, { key: `push-identity:${identity.subject}`, maximum: 60, window: HOUR });
    return pushAlias(identity.subject);
  },
});
