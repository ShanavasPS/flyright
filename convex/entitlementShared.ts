/** Pure RevenueCat-webhook → entitlement logic, kept free of Convex imports
 * so it can be unit-tested from the app's jest setup. */

export const ENTITLEMENT_PRO = 'Owed Pro';

/** Lifetime purchases carry no expiration — store one the comparison can't
 * age past. */
export const NEVER_EXPIRES = '9999-12-31T00:00:00.000Z';

/** The subset of an RC webhook event this module reads
 * (https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields). */
export interface RevenueCatEvent {
  type: string;
  cancel_reason?: string | null;
  app_user_id: string;
  aliases?: string[] | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

/** Events that (re)confirm the entitlement is held; `expiration_at_ms` on
 * them is the authoritative end. CANCELLATION only turns auto-renew off —
 * the entitlement runs to its expiration, which the event still carries. */
const GRANTING = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
  'CANCELLATION',
  'UNCANCELLATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_EXTENDED',
  'SUBSCRIPTION_PAUSED',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

export interface EntitlementChange {
  userIds: string[];
  proUntil: string | null;
}

/** What an RC event means for the Pro entitlement: which app_user_ids it
 * concerns and the new `proUntil`, or null when the event is irrelevant
 * (another entitlement, a TEST ping, a virtual-currency transaction). */
export function entitlementChange(event: RevenueCatEvent): EntitlementChange | null {
  const ids = new Set<string>([event.app_user_id, ...(event.aliases ?? [])].filter(Boolean));
  const mentionsPro = (event.entitlement_ids ?? []).includes(ENTITLEMENT_PRO);

  if (event.type === 'TRANSFER') {
    // The subscription moved to another RC subscriber; the receiving side
    // gets its own purchase/renewal event, so only revoke here.
    const from = (event.transferred_from ?? []).filter(Boolean);
    return from.length ? { userIds: from, proUntil: null } : null;
  }

  if (event.type === 'EXPIRATION') {
    if (!mentionsPro) return null;
    // Expired means expired even if the timestamp is missing.
    const at = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
    return { userIds: [...ids], proUntil: at };
  }

  if (event.type === 'CANCELLATION' && mentionsPro && (!event.expiration_at_ms || event.cancel_reason === 'CUSTOMER_SUPPORT')) {
    return { userIds: [...ids], proUntil: null };
  }

  if (GRANTING.has(event.type) && mentionsPro) {
    return {
      userIds: [...ids],
      proUntil: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : NEVER_EXPIRES,
    };
  }

  return null;
}

export const proActive = (proUntil: string | null | undefined, now = Date.now()): boolean =>
  proUntil != null && Date.parse(proUntil) > now;

/** The slice of RevenueCat's GET /v1/subscribers/{id} response this reads. */
export interface RevenueCatSubscriber {
  entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string }>;
  subscriptions?: Record<string, { is_sandbox?: boolean }>;
  non_subscriptions?: Record<string, { is_sandbox?: boolean }[]>;
}

/** proUntil from the subscriber snapshot — null when Pro was never held.
 * An expired entitlement stays listed with a past expires_date, which
 * proActive already treats as lapsed, so it's stored as-is. */
export function proUntilFromSubscriber(subscriber: RevenueCatSubscriber, allowSandbox = true): string | null {
  const pro = subscriber.entitlements?.[ENTITLEMENT_PRO];
  if (!pro) return null;
  if (!allowSandbox) {
    const product = pro.product_identifier;
    if (!product) return null;
    const subscription = subscriber.subscriptions?.[product];
    const purchases = subscriber.non_subscriptions?.[product] ?? [];
    if (subscription?.is_sandbox !== false && !purchases.some(p => p.is_sandbox === false)) return null;
  }
  if (pro.expires_date && !Number.isFinite(Date.parse(pro.expires_date))) return null;
  return pro.expires_date ?? NEVER_EXPIRES;
}
