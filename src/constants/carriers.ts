/** Operating-carrier facts, re-exported from convex/carriersShared.ts.
 *
 * The table itself lives under convex/ because both runtimes need it: the app
 * screens and the flight-status route on one side, and the Convex poll chain's
 * normalizer (convex/flightNormalize.ts) on the other. Convex bundles only
 * what sits inside convex/, so shared pure logic has to live there and be
 * imported outward — the same arrangement as lookupShared.ts. App code keeps
 * importing it from here. */

export {
  CARRIERS,
  carrierCodeForName,
  carrierFor,
  operatingBrand,
} from '../../convex/carriersShared';
