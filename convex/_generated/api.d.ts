/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _test_modules from "../_test/modules.js";
import type * as buildings from "../buildings.js";
import type * as devices from "../devices.js";
import type * as floors from "../floors.js";
import type * as links from "../links.js";
import type * as presences from "../presences.js";
import type * as seed from "../seed.js";
import type * as walls from "../walls.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_test/modules": typeof _test_modules;
  buildings: typeof buildings;
  devices: typeof devices;
  floors: typeof floors;
  links: typeof links;
  presences: typeof presences;
  seed: typeof seed;
  walls: typeof walls;
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
