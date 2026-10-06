/** What EAS Observe may see of a route. Its expo-router integration exports
 * every navigation's URL and params, and ours carry share and invite tokens,
 * Clerk ids, flight + date + route, imported file names and paths, and
 * notification copy. Any param listed as private is dropped and the sample's
 * URL replaced by `urlHidden: true`; the route name (`/journey/[id]`) stays,
 * so per-route timings are unaffected.
 *
 * Every param a screen reads must be classified here — observe-config.test
 * scans the useLocalSearchParams generics and fails on a new, unlisted one.
 * When unsure, it is private: the cost is one hidden URL. */

export const PRIVATE_ROUTE_PARAMS = [
  // Bearer tokens and ids: share/invite links, people, trips, rows.
  'token',
  'id',
  'journeyId',
  // A trip whose boarding pass fills the membership form (B5).
  'fromJourney',
  'journeyKey',
  'editId',
  'memberId',
  'ownerId',
  'userId',
  'updateId',
  'photoId',
  // A trip on Flights and its flights (trip-photo).
  'group',
  'journeys',
  'cityJourneys',
  'groupLabel',
  // A trip's facts.
  'flight',
  'date',
  'from',
  'to',
  'pnr',
  'seat',
  'cabin',
  'depTime',
  'arrTime',
  'delay',
  // A lounge names the airport the traveller leaves from (lounge sheet).
  'lounge',
  // Names, files and copy written about the traveller.
  'name',
  // Where a home base is: where the traveller lives.
  'city',
  'country',
  'handle',
  'uri',
  'path',
  'title',
  'subtitle',
  'label',
  // Return paths embed the ids above.
  'next',
] as const;

/** UI switches with no personal content — kept in the exported URL. */
export const PUBLIC_ROUTE_PARAMS = [
  'action',
  'close',
  'demo',
  'exit',
  'feature',
  'field',
  'focus',
  'kind',
  'manual',
  'model',
  'offering',
  'packageId',
  'scan',
  'step',
  'tab',
  'target',
  'via',
  // A calendar year being read (Places › Days); the country beside it stays private.
  'year',
] as const;
