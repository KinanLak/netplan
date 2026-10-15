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
import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as buildings from "../buildings.js";
import type * as computerPresentation from "../computerPresentation.js";
import type * as computerProjection from "../computerProjection.js";
import type * as connector from "../connector.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as devices from "../devices.js";
import type * as floors from "../floors.js";
import type * as http from "../http.js";
import type * as integrationModel from "../integrationModel.js";
import type * as integrationOrchestration from "../integrationOrchestration.js";
import type * as integrationSchedule from "../integrationSchedule.js";
import type * as integrations from "../integrations.js";
import type * as lib_authRoles from "../lib/authRoles.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_roles from "../lib/roles.js";
import type * as librenms from "../librenms.js";
import type * as librenmsFreshness from "../librenmsFreshness.js";
import type * as librenmsModel from "../librenmsModel.js";
import type * as librenmsTransport from "../librenmsTransport.js";
import type * as librenmsUrl from "../librenmsUrl.js";
import type * as links from "../links.js";
import type * as localizationModel from "../localizationModel.js";
import type * as localizationOrchestration from "../localizationOrchestration.js";
import type * as mapDocument from "../mapDocument.js";
import type * as mapOperations from "../mapOperations.js";
import type * as mapValidators from "../mapValidators.js";
import type * as netbox from "../netbox.js";
import type * as netboxModel from "../netboxModel.js";
import type * as netboxOrchestration from "../netboxOrchestration.js";
import type * as presences from "../presences.js";
import type * as sites from "../sites.js";
import type * as topology from "../topology.js";
import type * as users from "../users.js";
import type * as walls from "../walls.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_test/modules": typeof _test_modules;
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  buildings: typeof buildings;
  computerPresentation: typeof computerPresentation;
  computerProjection: typeof computerProjection;
  connector: typeof connector;
  crons: typeof crons;
  dev: typeof dev;
  devices: typeof devices;
  floors: typeof floors;
  http: typeof http;
  integrationModel: typeof integrationModel;
  integrationOrchestration: typeof integrationOrchestration;
  integrationSchedule: typeof integrationSchedule;
  integrations: typeof integrations;
  "lib/authRoles": typeof lib_authRoles;
  "lib/functions": typeof lib_functions;
  "lib/roles": typeof lib_roles;
  librenms: typeof librenms;
  librenmsFreshness: typeof librenmsFreshness;
  librenmsModel: typeof librenmsModel;
  librenmsTransport: typeof librenmsTransport;
  librenmsUrl: typeof librenmsUrl;
  links: typeof links;
  localizationModel: typeof localizationModel;
  localizationOrchestration: typeof localizationOrchestration;
  mapDocument: typeof mapDocument;
  mapOperations: typeof mapOperations;
  mapValidators: typeof mapValidators;
  netbox: typeof netbox;
  netboxModel: typeof netboxModel;
  netboxOrchestration: typeof netboxOrchestration;
  presences: typeof presences;
  sites: typeof sites;
  topology: typeof topology;
  users: typeof users;
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

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
