/** The cabin a trip is flown in: Economy, Premium economy, Business or
 * First. Stored on the journey as the key (`journeys.cabin`), typed on the
 * add-flight form or the trip's details editor, or read off a boarding pass
 * or a booking document. Unknown stays null — a letter or a word that
 * doesn't name a cabin plainly is not guessed at. */

export const CABINS = ['economy', 'premium', 'business', 'first'] as const;
export type CabinClass = (typeof CABINS)[number];

export const CABIN_LABELS: Record<CabinClass, string> = {
  economy: 'Economy',
  premium: 'Premium economy',
  business: 'Business',
  first: 'First',
};

export function isCabin(value: unknown): value is CabinClass {
  return typeof value === 'string' && (CABINS as readonly string[]).includes(value);
}

/** "Business" for a stored key, null for anything else. */
export function cabinLabel(value: string | null | undefined): string | null {
  return isCabin(value) ? CABIN_LABELS[value] : null;
}

/** A boarding pass's compartment letter (BCBP field 71). The standard means
 * the cabin — F, J/C, W, Y — but many airlines print the fare's booking
 * class there, so only letters that mean one cabin on the big carriers are
 * read; the ones that differ between airlines (P, R, E, N, G, T) stay null. */
const COMPARTMENTS: Record<string, CabinClass> = {
  F: 'first', A: 'first',
  J: 'business', C: 'business', D: 'business', I: 'business', Z: 'business',
  W: 'premium',
  Y: 'economy', B: 'economy', M: 'economy', H: 'economy', K: 'economy', L: 'economy',
  Q: 'economy', V: 'economy', X: 'economy', S: 'economy', O: 'economy', U: 'economy',
};

export function cabinFromCompartment(letter: string | null | undefined): CabinClass | null {
  return COMPARTMENTS[letter?.trim().toUpperCase() ?? ''] ?? null;
}

/** The cabin a booking page names for a leg ("Class: Economy", "Cabin
 * BUSINESS", "Premium Economy Class", "First class"). Null when the text
 * names none, or names more than one — that is a table of several legs, and
 * the cabin can't be pinned to this one. */
export function cabinFromText(text: string): CabinClass | null {
  const found = new Set<CabinClass>();
  const words = /\b(premium\s+economy|economy|business|first)(\s+class)?\b|\b(?:class|cabin)\s*:?\s*(premium\s+economy|economy|business|first)\b/gi;
  for (const m of text.matchAll(words)) {
    const word = (m[1] ?? m[3] ?? '').toLowerCase().replace(/\s+/g, ' ');
    // "First" and "Business" are ordinary words too ("first bag", "business
    // days"); they name a cabin only with "class" after them or a Class /
    // Cabin label before. "Economy" names nothing else.
    if ((word === 'first' || word === 'business') && !m[2] && !m[3]) continue;
    found.add(word === 'premium economy' ? 'premium' : (word as CabinClass));
  }
  return found.size === 1 ? [...found][0]! : null;
}
