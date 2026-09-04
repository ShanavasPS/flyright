/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as carriersShared from "../carriersShared.js";
import type * as circle from "../circle.js";
import type * as circleInternal from "../circleInternal.js";
import type * as circleShared from "../circleShared.js";
import type * as crons from "../crons.js";
import type * as entitlementShared from "../entitlementShared.js";
import type * as entitlements from "../entitlements.js";
import type * as flightData from "../flightData.js";
import type * as flightNormalize from "../flightNormalize.js";
import type * as http from "../http.js";
import type * as journeys from "../journeys.js";
import type * as live from "../live.js";
import type * as liveHelpers from "../liveHelpers.js";
import type * as liveInternal from "../liveInternal.js";
import type * as liveShared from "../liveShared.js";
import type * as lookupShared from "../lookupShared.js";
import type * as lookups from "../lookups.js";
import type * as onesignal from "../onesignal.js";
import type * as photos from "../photos.js";
import type * as provider from "../provider.js";
import type * as providerFetch from "../providerFetch.js";
import type * as providerShared from "../providerShared.js";
import type * as support from "../support.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  carriersShared: typeof carriersShared;
  circle: typeof circle;
  circleInternal: typeof circleInternal;
  circleShared: typeof circleShared;
  crons: typeof crons;
  entitlementShared: typeof entitlementShared;
  entitlements: typeof entitlements;
  flightData: typeof flightData;
  flightNormalize: typeof flightNormalize;
  http: typeof http;
  journeys: typeof journeys;
  live: typeof live;
  liveHelpers: typeof liveHelpers;
  liveInternal: typeof liveInternal;
  liveShared: typeof liveShared;
  lookupShared: typeof lookupShared;
  lookups: typeof lookups;
  onesignal: typeof onesignal;
  photos: typeof photos;
  provider: typeof provider;
  providerFetch: typeof providerFetch;
  providerShared: typeof providerShared;
  support: typeof support;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
