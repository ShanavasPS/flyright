/** A trip's baggage allowance, as the ticket's baggage chips show it
 * ("✓ Personal item", "✓ Carry-on 8 kg", "No checked bag"): stored on the
 * journey as JSON in `journeys.baggage`, typed in the trip details editor or
 * read off a booking document's baggage column ("Baggage: 2PC", "0PC") or a
 * boarding pass's free baggage allowance. Private: like the seat and the
 * price, it never leaves the traveller's own trip page. A part that isn't
 * known is left out — "not said" is different from "not included". */

export interface Baggage {
  /** A personal item under the seat: included or not. */
  personal?: boolean;
  /** A carry-on bag in the overhead bin, and its weight limit when given. */
  carryOn?: boolean;
  carryOnKg?: number;
  /** Checked bags: how many (0 = none included), and the weight of each —
   * or, on a weight-concept fare with no count, the total. */
  checked?: number;
  checkedKg?: number;
}

export function parseBaggage(json: string | null | undefined): Baggage | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const out: Baggage = {};
    if (typeof raw.personal === 'boolean') out.personal = raw.personal;
    if (typeof raw.carryOn === 'boolean') out.carryOn = raw.carryOn;
    if (typeof raw.carryOnKg === 'number' && raw.carryOnKg > 0) out.carryOnKg = raw.carryOnKg;
    if (typeof raw.checked === 'number' && raw.checked >= 0) out.checked = Math.round(raw.checked);
    if (typeof raw.checkedKg === 'number' && raw.checkedKg > 0) out.checkedKg = raw.checkedKg;
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** The stored form; null when nothing is known. */
export function serializeBaggage(baggage: Baggage | null | undefined): string | null {
  const clean = parseBaggage(baggage ? JSON.stringify(baggage) : null);
  return clean ? JSON.stringify(clean) : null;
}

/** Fills what `base` doesn't know from `extra` — an import or a scan adds to
 * what the traveller typed, never overrides it. */
export function mergeBaggage(base: Baggage | null, extra: Baggage | null): Baggage | null {
  if (!extra) return base;
  return { ...extra, ...(base ?? {}) };
}

export interface BaggageChip {
  key: 'personal' | 'carryOn' | 'checked';
  label: string;
  included: boolean;
}

/** The chips the ticket shows, in the design's order: what is included with
 * a tick, what isn't as a dashed "No …". */
export function baggageChips(baggage: Baggage | null): BaggageChip[] {
  if (!baggage) return [];
  const chips: BaggageChip[] = [];
  if (baggage.personal != null) {
    chips.push({ key: 'personal', label: baggage.personal ? 'Personal item' : 'No personal item', included: baggage.personal });
  }
  if (baggage.carryOn != null || baggage.carryOnKg) {
    const included = baggage.carryOn !== false;
    chips.push({
      key: 'carryOn',
      label: included ? (baggage.carryOnKg ? `Carry-on ${baggage.carryOnKg} kg` : 'Carry-on') : 'No carry-on',
      included,
    });
  }
  if (baggage.checked != null || baggage.checkedKg) {
    const count = baggage.checked;
    if (count === 0) {
      chips.push({ key: 'checked', label: 'No checked bag', included: false });
    } else {
      const kg = baggage.checkedKg;
      const label =
        count == null
          ? `${kg} kg checked`
          : kg
            ? `${count} × ${kg} kg checked`
            : `${count} checked ${count === 1 ? 'bag' : 'bags'}`;
      chips.push({ key: 'checked', label, included: true });
    }
  }
  return chips;
}

/** One line for small places ("2 checked bags · Carry-on 8 kg"). */
export function baggageLine(baggage: Baggage | null): string | null {
  const chips = baggageChips(baggage);
  return chips.length ? chips.map((c) => c.label).join(' · ') : null;
}

/** A boarding pass's free baggage allowance (BCBP item 118): "2PC" pieces,
 * "20K" kilos, "40L" pounds (kept as kilos, rounded). */
export function baggageFromAllowance(code: string | null | undefined): Baggage | null {
  const m = /^\s*(\d{1,3})\s*(PC|K|L)\s*$/i.exec(code ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toUpperCase();
  if (unit === 'PC') return n <= 9 ? { checked: n } : null;
  const kg = unit === 'K' ? n : Math.round(n * 0.4536);
  return kg > 0 && kg <= 100 ? { checkedKg: kg } : { checked: 0 };
}

/** What a booking page prints for one leg's baggage: the checked allowance
 * from a "Baggage: 2PC" label or a bare "0PC" in the row, a weight from
 * "30 kg checked baggage", the carry-on from "CARRY7KG" / "Cabin baggage
 * 7 kg". Null when it names nothing, or two different checked allowances
 * (a table of several legs). */
export function baggageFromText(text: string): Baggage | null {
  const out: Baggage = {};
  const pieces = new Set<number>();
  for (const m of text.matchAll(/\b(\d)\s?PCS?\b/gi)) {
    // "1 PC 32KG MAX" is one bag's size in a policy table, not the allowance;
    // "MAX 2PC" and a bare "2PC" are.
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 6);
    if (/^\s*\d{2}\s?KG/i.test(after)) continue;
    pieces.add(Number(m[1]));
  }
  for (const m of text.matchAll(/\b(\d)\s+(?:checked\s+)?(?:bags?|pieces?)\b(?=[^.\n]{0,20}\b(?:checked|check-in|hold))/gi)) {
    pieces.add(Number(m[1]));
  }
  if (pieces.size === 1) out.checked = [...pieces][0]!;
  else if (pieces.size > 1) return null;

  const weights = new Set<number>();
  for (const m of text.matchAll(/\b(\d{2})\s?kg\s+(?:checked|check-in|hold)\s+(?:baggage|bag)/gi)) weights.add(Number(m[1]));
  for (const m of text.matchAll(/\b(?:checked|check-in|hold)\s+(?:baggage|bag)\s*:?\s*(\d{2})\s?kg\b/gi)) weights.add(Number(m[1]));
  if (weights.size === 1 && out.checked !== 0) out.checkedKg = [...weights][0]!;

  const carry = /\bCARRY\s?(?:-?ON)?\s?(\d{1,2})\s?KG\b|\b(?:cabin|carry-on|hand)\s+(?:baggage|bag|luggage)\s*:?\s*(\d{1,2})\s?kg\b/i.exec(text);
  if (carry) {
    out.carryOn = true;
    out.carryOnKg = Number(carry[1] ?? carry[2]);
  }
  return Object.keys(out).length ? out : null;
}
