/** The short name of a Pro plan from its store product id, for Settings and
 * Manage subscription. Store ids carry prefixes, suffixes and Android base
 * plans (`flyright_pro_monthly`, `flyright_pro_monthly:monthly`,
 * `flyright_pro_lifetime_web_v2`), so the plan is read from the words in it;
 * a grant made in RevenueCat (`rc_promo_…`) is "Complimentary", and an id
 * that names no plan is just "Pro" — never the raw id. */
export function planLabel(productId: string): string {
  const id = productId.toLowerCase();
  if (id.startsWith('rc_promo')) return 'Complimentary';
  if (id.includes('lifetime')) return 'Lifetime';
  if (/year|annual/.test(id)) return 'Yearly';
  if (id.includes('month')) return 'Monthly';
  return 'Pro';
}
