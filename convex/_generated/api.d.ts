/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _test_cabling from "../_test/cabling.js";
import type * as _test_fetch from "../_test/fetch.js";
import type * as _test_modules from "../_test/modules.js";
import type * as auth from "../auth.js";
import type * as authSettings from "../authSettings.js";
import type * as bootstrap from "../bootstrap.js";
import type * as buildings from "../buildings.js";
import type * as cables from "../cables.js";
import type * as collection from "../collection.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as devices from "../devices.js";
import type * as floorOverlays from "../floorOverlays.js";
import type * as floors from "../floors.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as importReviews from "../importReviews.js";
import type * as integrations from "../integrations.js";
import type * as lib_authRoles from "../lib/authRoles.js";
import type * as lib_cycles from "../lib/cycles.js";
import type * as lib_deviceMacs from "../lib/deviceMacs.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_httpRetry from "../lib/httpRetry.js";
import type * as lib_ignoredMacs from "../lib/ignoredMacs.js";
import type * as lib_imageHeader from "../lib/imageHeader.js";
import type * as lib_integrationProbe from "../lib/integrationProbe.js";
import type * as lib_keycloak from "../lib/keycloak.js";
import type * as lib_mailTemplates from "../lib/mailTemplates.js";
import type * as lib_netboxApi from "../lib/netboxApi.js";
import type * as lib_overlayFiles from "../lib/overlayFiles.js";
import type * as lib_ports from "../lib/ports.js";
import type * as lib_presence from "../lib/presence.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as lib_smtp from "../lib/smtp.js";
import type * as lib_statuses from "../lib/statuses.js";
import type * as lib_structure from "../lib/structure.js";
import type * as lib_userAccounts from "../lib/userAccounts.js";
import type * as librenms from "../librenms.js";
import type * as librenmsCycle from "../librenmsCycle.js";
import type * as mail from "../mail.js";
import type * as mapDocument from "../mapDocument.js";
import type * as mapOperations from "../mapOperations.js";
import type * as mapValidators from "../mapValidators.js";
import type * as netbox from "../netbox.js";
import type * as netboxImport from "../netboxImport.js";
import type * as presences from "../presences.js";
import type * as siteValidators from "../siteValidators.js";
import type * as sites from "../sites.js";
import type * as unknownMacs from "../unknownMacs.js";
import type * as users from "../users.js";
import type * as walls from "../walls.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_test/cabling": typeof _test_cabling;
  "_test/fetch": typeof _test_fetch;
  "_test/modules": typeof _test_modules;
  auth: typeof auth;
  authSettings: typeof authSettings;
  bootstrap: typeof bootstrap;
  buildings: typeof buildings;
  cables: typeof cables;
  collection: typeof collection;
  crons: typeof crons;
  dev: typeof dev;
  devices: typeof devices;
  floorOverlays: typeof floorOverlays;
  floors: typeof floors;
  health: typeof health;
  http: typeof http;
  importReviews: typeof importReviews;
  integrations: typeof integrations;
  "lib/authRoles": typeof lib_authRoles;
  "lib/cycles": typeof lib_cycles;
  "lib/deviceMacs": typeof lib_deviceMacs;
  "lib/functions": typeof lib_functions;
  "lib/httpRetry": typeof lib_httpRetry;
  "lib/ignoredMacs": typeof lib_ignoredMacs;
  "lib/imageHeader": typeof lib_imageHeader;
  "lib/integrationProbe": typeof lib_integrationProbe;
  "lib/keycloak": typeof lib_keycloak;
  "lib/mailTemplates": typeof lib_mailTemplates;
  "lib/netboxApi": typeof lib_netboxApi;
  "lib/overlayFiles": typeof lib_overlayFiles;
  "lib/ports": typeof lib_ports;
  "lib/presence": typeof lib_presence;
  "lib/roles": typeof lib_roles;
  "lib/secrets": typeof lib_secrets;
  "lib/smtp": typeof lib_smtp;
  "lib/statuses": typeof lib_statuses;
  "lib/structure": typeof lib_structure;
  "lib/userAccounts": typeof lib_userAccounts;
  librenms: typeof librenms;
  librenmsCycle: typeof librenmsCycle;
  mail: typeof mail;
  mapDocument: typeof mapDocument;
  mapOperations: typeof mapOperations;
  mapValidators: typeof mapValidators;
  netbox: typeof netbox;
  netboxImport: typeof netboxImport;
  presences: typeof presences;
  siteValidators: typeof siteValidators;
  sites: typeof sites;
  unknownMacs: typeof unknownMacs;
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
