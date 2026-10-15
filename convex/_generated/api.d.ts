/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _test_fetch from "../_test/fetch.js";
import type * as _test_modules from "../_test/modules.js";
import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as buildings from "../buildings.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as devices from "../devices.js";
import type * as floorOverlays from "../floorOverlays.js";
import type * as floors from "../floors.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as lib_authRoles from "../lib/authRoles.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_httpRetry from "../lib/httpRetry.js";
import type * as lib_imageHeader from "../lib/imageHeader.js";
import type * as lib_integrationProbe from "../lib/integrationProbe.js";
import type * as lib_mailTemplates from "../lib/mailTemplates.js";
import type * as lib_overlayFiles from "../lib/overlayFiles.js";
import type * as lib_presence from "../lib/presence.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as lib_smtp from "../lib/smtp.js";
import type * as links from "../links.js";
import type * as mail from "../mail.js";
import type * as mapDocument from "../mapDocument.js";
import type * as mapOperations from "../mapOperations.js";
import type * as mapValidators from "../mapValidators.js";
import type * as presences from "../presences.js";
import type * as siteValidators from "../siteValidators.js";
import type * as sites from "../sites.js";
import type * as users from "../users.js";
import type * as walls from "../walls.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_test/fetch": typeof _test_fetch;
  "_test/modules": typeof _test_modules;
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  buildings: typeof buildings;
  crons: typeof crons;
  dev: typeof dev;
  devices: typeof devices;
  floorOverlays: typeof floorOverlays;
  floors: typeof floors;
  http: typeof http;
  integrations: typeof integrations;
  "lib/authRoles": typeof lib_authRoles;
  "lib/functions": typeof lib_functions;
  "lib/httpRetry": typeof lib_httpRetry;
  "lib/imageHeader": typeof lib_imageHeader;
  "lib/integrationProbe": typeof lib_integrationProbe;
  "lib/mailTemplates": typeof lib_mailTemplates;
  "lib/overlayFiles": typeof lib_overlayFiles;
  "lib/presence": typeof lib_presence;
  "lib/roles": typeof lib_roles;
  "lib/secrets": typeof lib_secrets;
  "lib/smtp": typeof lib_smtp;
  links: typeof links;
  mail: typeof mail;
  mapDocument: typeof mapDocument;
  mapOperations: typeof mapOperations;
  mapValidators: typeof mapValidators;
  presences: typeof presences;
  siteValidators: typeof siteValidators;
  sites: typeof sites;
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
