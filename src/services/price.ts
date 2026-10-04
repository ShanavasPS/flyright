/** A ticket price as typed in the trip details editor: "412", "412 EUR",
 * "€412.50", "1 234,50 SEK", "$736.44". The currency is the ISO code typed
 * or the one a symbol stands for, else `fallback` (the trip's stored
 * currency, else the phone's). Null when there is no amount. */

const SYMBOLS: Record<string, string> = { '€': 'EUR', '£': 'GBP', $: 'USD', '₹': 'INR', '¥': 'JPY', kr: 'SEK' };

export function parsePrice(text: string, fallback: string | null): { amount: number; currency: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const code = /\b([A-Za-z]{3})\b/.exec(trimmed)?.[1]?.toUpperCase();
  const symbol = Object.keys(SYMBOLS).find((s) => trimmed.includes(s));
  const currency = code ?? (symbol ? SYMBOLS[symbol] : null) ?? fallback;
  if (!currency) return null;
  const digits = trimmed.replace(/[^\d.,]/g, '');
  if (!/\d/.test(digits)) return null;
  // The last separator followed by one or two digits is the decimal point;
  // every other one groups thousands ("1.234,50", "1,234.50", "1 234").
  const decimal = /[.,](\d{1,2})$/.exec(digits);
  const whole = (decimal ? digits.slice(0, decimal.index) : digits).replace(/[.,]/g, '');
  const amount = Number(`${whole || '0'}${decimal ? `.${decimal[1]}` : ''}`);
  return Number.isFinite(amount) && amount > 0 && amount < 1_000_000 ? { amount, currency } : null;
}

/** The stored price as the editor shows it: "412 EUR", "412.5 EUR". */
export function priceText(amount: number | null, currency: string | null): string {
  return amount != null && currency ? `${amount} ${currency}` : '';
}
