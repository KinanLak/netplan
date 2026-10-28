import { v } from "convex/values";

/** `IntegrationKind` from `src/sites/integrations.ts`. */
export const integrationKind = v.union(
  v.literal("netbox"),
  v.literal("librenms"),
);

/** `EncryptedSecret` from `convex/lib/secrets.ts`. */
export const encryptedSecret = v.object({
  keyId: v.string(),
  iv: v.string(),
  ciphertext: v.string(),
});

/** What "Tester la connexion" answered. */
export const connectionResult = v.object({
  ok: v.boolean(),
  message: v.string(),
});

/** `SaveResult` from `convex/integrations.ts`. */
export const saveResult = v.object({
  ok: v.boolean(),
  message: v.string(),
  confirmOtherInstance: v.optional(v.number()),
});

export const connectionCheck = v.object({
  ok: v.boolean(),
  message: v.string(),
  at: v.number(),
});

/** How one polled LibreNMS device fared in a cycle (ADR 0026). */
export const switchResult = v.object({
  /** Its name in LibreNMS. */
  name: v.string(),
  /** False when it made the step fail: unread, or no discovery started. */
  ok: v.boolean(),
  /** What went wrong or looks off, each a phrase after its name. */
  notes: v.array(v.string()),
  /** LibreNMS no longer has it: the switch mapping needs a look. */
  missing: v.optional(v.boolean()),
  /**
   * How its MAC table's freshness rule fell back (ADR 0038): `undated`, no
   * timestamps, so the whole table counts; `stale`, the discovery refreshed
   * nothing, so none of it does. Infrastructure noise, not a remark.
   */
  macTable: v.optional(v.union(v.literal("undated"), v.literal("stale"))),
});

/** What one source answered during a collection cycle. */
export const cycleStep = v.object({
  source: integrationKind,
  ok: v.boolean(),
  message: v.string(),
  /** LibreNMS only: each polled device, in the order they were read. */
  switches: v.optional(v.array(switchResult)),
});

export const cycleRun = v.object({
  startedAt: v.number(),
  finishedAt: v.number(),
  manual: v.boolean(),
  steps: v.array(cycleStep),
});

/** What a cycle keeps of a LibreNMS forwarding table (`FdbTable`). */
export const fdbTable = v.object({
  newest: v.number(),
  staleUpTo: v.optional(v.number()),
  unrefreshed: v.optional(v.boolean()),
});

/**
 * LibreNMS's Ethernet port names for a switch with default names, from the
 * LibreNMS device it alone stands for, on the LibreNMS at `baseUrl`
 * (ADR 0038).
 */
export const portNameOffer = v.object({
  baseUrl: v.string(),
  switchId: v.string(),
  librenmsDeviceId: v.number(),
  names: v.array(v.string()),
});

/** A switch's last successful LibreNMS read (`SwitchRead`, ADR 0025). */
export const switchRead = v.object({
  switchId: v.string(),
  readAt: v.number(),
  /** Set once the statuses resting on the read were removed. */
  expired: v.optional(v.literal(true)),
});

export const runningCycle = v.object({
  cycleId: v.string(),
  startedAt: v.number(),
  /** Past this, the cycle is taken for dead and another may start. */
  leaseUntil: v.number(),
  manual: v.boolean(),
});

const netboxRoleType = v.union(
  v.literal("switch"),
  v.literal("patch-panel"),
  v.literal("wall-port"),
  v.literal("pc"),
  v.literal("endpoint"),
);

/** `NetBoxSettings` from `src/sites/netbox.ts`. */
export const netboxSettings = v.object({
  site: v.union(v.null(), v.object({ id: v.number(), name: v.string() })),
  roles: v.array(
    v.object({ id: v.number(), name: v.string(), type: netboxRoleType }),
  ),
  /** Whether each cycle pushes observed locations to NetBox (ADR 0027). */
  push: v.optional(v.boolean()),
});

/** `UnmappedRole` from `src/sites/netboxImport.ts`. */
export const unmappedRole = v.object({
  id: v.number(),
  name: v.string(),
  devices: v.number(),
});

/** `PushedValues` from `src/sites/netboxPush.ts`. */
export const pushedValues = v.object({
  site: v.string(),
  floor: v.union(v.null(), v.string()),
  socket: v.union(v.null(), v.string()),
  switchPort: v.string(),
  /**
   * In rows sent before ADR 0040 only, which wrote when the device was last
   * seen; never read or written now, kept so those rows still validate.
   */
  lastSeen: v.optional(v.number()),
});

/** How the last push run to NetBox ended. */
export const pushRun = v.object({
  startedAt: v.number(),
  finishedAt: v.number(),
  /** Devices NetBox accepted. */
  sent: v.number(),
  /** Devices NetBox refused, each with its message on its push row. */
  refused: v.number(),
  /** Why the run stopped early: NetBox unreachable, no token. */
  error: v.optional(v.string()),
});

export const runningPush = v.object({
  runId: v.string(),
  leaseUntil: v.number(),
});

/** `LibreNMSSettings` from `src/sites/librenms.ts`. */
export const librenmsSettings = v.object({
  switches: v.array(
    v.object({
      switchId: v.string(),
      device: v.union(v.null(), v.object({ id: v.number(), name: v.string() })),
    }),
  ),
});

/** `ImportedPort` from `src/sites/netboxImport.ts`. */
export const importedPort = v.object({
  deviceExternalId: v.string(),
  externalId: v.string(),
  kind: v.union(v.literal("interface"), v.literal("front"), v.literal("rear")),
  name: v.string(),
  rearExternalId: v.optional(v.string()),
});

/** `ImportedCable` from `src/sites/netboxImport.ts`. */
export const importedCable = v.object({
  externalId: v.string(),
  a: v.string(),
  b: v.string(),
});

/** `ImportedDevice` from `src/sites/netboxImport.ts`. */
export const importedDevice = v.object({
  externalId: v.string(),
  url: v.optional(v.string()),
  type: netboxRoleType,
  name: v.string(),
  serial: v.optional(v.string()),
  macs: v.array(v.string()),
  model: v.optional(v.string()),
  ip: v.optional(v.string()),
});
