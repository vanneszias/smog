/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminLogs from "../adminLogs.js";
import type * as categories from "../categories.js";
import type * as cron from "../cron.js";
import type * as favorites from "../favorites.js";
import type * as gdpr from "../gdpr.js";
import type * as gdprCron from "../gdprCron.js";
import type * as gestures from "../gestures.js";
import type * as sponsorships from "../sponsorships.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminLogs: typeof adminLogs;
  categories: typeof categories;
  cron: typeof cron;
  favorites: typeof favorites;
  gdpr: typeof gdpr;
  gdprCron: typeof gdprCron;
  gestures: typeof gestures;
  sponsorships: typeof sponsorships;
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
