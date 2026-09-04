/** What makes this trip notable inside the traveler's own journal — pure and
 * testable. The detail card used to say "You flew 13,400 km from Dubai to
 * Los Angeles", which the hero already shows in big type; these facts put the
 * trip in the context of everything else the person has flown instead:
 * "Your longest flight", "3rd time in Japan", "5th flight with Finnair". */

import { countryName, getAirport } from '@/services/airports';
import type { JourneyRow } from '@/services/journeys';
import { airlineOf } from '@/services/timeline';

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Destination country of a row: the airport dataset first, the stored
 * country code as the fallback for codes the dataset doesn't know. */
function destinationCountry(row: JourneyRow): string {
  return getAirport(row.toCode)?.country ?? row.toCountry;
}

function originCountry(row: JourneyRow): string {
  return getAirport(row.fromCode)?.country ?? row.fromCountry;
}

/** Up to three short facts about `trip` relative to `all` (the viewer's
 * journal, which may or may not include `trip` itself — it's matched by id).
 * Order is by how much each one says: the distance record first, then the
 * destination-country tally, then the airline tally, then the ticket price. */
export function tripFacts(trip: JourneyRow, all: JourneyRow[], limit = 3): string[] {
  const others = all.filter((row) => row.id !== trip.id && !row.deletedAt);
  const facts: string[] = [];

  // Distance record. Only meaningful once there's a journal to rank inside.
  if (others.length >= 2) {
    if (others.every((row) => row.distanceKm < trip.distanceKm)) facts.push('Your longest flight');
    else if (others.every((row) => row.distanceKm > trip.distanceKm))
      facts.push('Your shortest flight');
  }

  // Nth visit to the destination country, counted in departure order so an
  // old trip added later still reads as the earlier visit it was. Domestic
  // legs say nothing here.
  const country = destinationCountry(trip);
  if (country && country !== originCountry(trip)) {
    const earlier = others.filter(
      (row) =>
        destinationCountry(row) === country && row.scheduledDeparture <= trip.scheduledDeparture,
    ).length;
    const name = countryName(country);
    facts.push(earlier === 0 ? `First time in ${name}` : `${ordinal(earlier + 1)} time in ${name}`);
  }

  // Nth flight with this airline — placeholder carriers ("Flight") don't count.
  const airline = airlineOf(trip);
  if (airline) {
    const earlier = others.filter(
      (row) =>
        airlineOf(row)?.toLowerCase() === airline.toLowerCase() &&
        row.scheduledDeparture <= trip.scheduledDeparture,
    ).length;
    if (earlier > 0) facts.push(`${ordinal(earlier + 1)} flight with ${airline}`);
  }

  if (trip.ticketPriceAmount != null && trip.ticketPriceCurrency) {
    facts.push(`Ticket ${formatMoney(trip.ticketPriceAmount, trip.ticketPriceCurrency)}`);
  }

  return facts.slice(0, limit);
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
