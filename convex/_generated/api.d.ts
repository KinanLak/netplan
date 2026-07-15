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
import type * as connector from "../connector.js";
import type * as devices from "../devices.js";
import type * as floors from "../floors.js";
import type * as librenms from "../librenms.js";
import type * as librenmsModel from "../librenmsModel.js";
import type * as links from "../links.js";
import type * as mapDocument from "../mapDocument.js";
import type * as mapOperations from "../mapOperations.js";
import type * as mapValidators from "../mapValidators.js";
import type * as netbox from "../netbox.js";
import type * as netboxModel from "../netboxModel.js";
import type * as presences from "../presences.js";
import type * as topology from "../topology.js";
import type * as walls from "../walls.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_test/modules": typeof _test_modules;
  buildings: typeof buildings;
  connector: typeof connector;
  devices: typeof devices;
  floors: typeof floors;
  librenms: typeof librenms;
  librenmsModel: typeof librenmsModel;
  links: typeof links;
  mapDocument: typeof mapDocument;
  mapOperations: typeof mapOperations;
  mapValidators: typeof mapValidators;
  netbox: typeof netbox;
  netboxModel: typeof netboxModel;
  presences: typeof presences;
  topology: typeof topology;
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
