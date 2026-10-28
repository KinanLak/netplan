// A device's identity (ADR 0022): the rules the drawer form and the server
// share. Imported by `convex/`, so relative imports only.

import { isCanonicalMac } from "./mac";
import type { IntegrationKind } from "../sites/integrations";

export type IdentityTextField = "name" | "hostname" | "serial" | "model" | "ip";
export type IdentityField = IdentityTextField | "type" | "macs" | "notes";

/**
 * The fields an integration owns on the devices it brings: the drawer shows
 * them read-only and the server refuses to change them. LibreNMS brings no
 * device yet; it would own what NetBox owns.
 */
export const SOURCE_OWNED_FIELDS: Record<
  IntegrationKind,
  ReadonlyArray<IdentityField>
> = {
  netbox: ["name", "type", "serial", "macs", "model", "ip"],
  librenms: ["name", "type", "serial", "macs", "model", "ip"],
};

export const isSourceOwned = (
  source: { integration: IntegrationKind } | undefined,
  field: IdentityField,
): boolean =>
  source !== undefined &&
  SOURCE_OWNED_FIELDS[source.integration].includes(field);

/** Whether the source that brought a device no longer returns it (ADR 0039). */
export const isAbsentFromSource = (
  source: { missingSince?: number } | undefined,
): boolean => source?.missingSince !== undefined;

/**
 * Whether a person may delete a device: a manual one, or one its source no
 * longer returns; any other would come back with the next sync (ADR 0039).
 */
export const isDeletable = (device: {
  source?: { missingSince?: number };
}): boolean => device.source === undefined || isAbsentFromSource(device.source);

/**
 * The binding a device a person brings back may carry (ADR 0039): only a
 * NetBox one NetBox no longer returns, as undoing its deletion sends, and
 * marked `staleId`, since nothing proves the id still names that device:
 * only the identity rules link it again. A forged binding can then do no
 * more than a manual device with the same MACs.
 */
export const restoredSource = <
  S extends { integration: IntegrationKind; missingSince?: number },
>(
  source: S | undefined,
): { source?: S & { staleId: true } } | { error: string } => {
  if (!source) return {};
  if (source.integration !== "netbox" || !isAbsentFromSource(source)) {
    return {
      error:
        "Cet équipement vient d'une intégration : il ne peut pas être créé.",
    };
  }
  return { source: { ...source, staleId: true } };
};

export const IDENTITY_TEXT_LIMITS: Record<IdentityTextField | "notes", number> =
  {
    // A name may be a hostname (B10), so it is as long as one may be.
    name: 253,
    // The longest DNS name.
    hostname: 253,
    serial: 120,
    model: 120,
    // The longest textual IPv6 address.
    ip: 45,
    notes: 2000,
  };

export const MAX_MACS_PER_DEVICE = 32;

export type MacListProblem = "too-many" | "duplicate" | "invalid";

export function macListProblem(
  macs: ReadonlyArray<string>,
): MacListProblem | null {
  if (macs.length > MAX_MACS_PER_DEVICE) return "too-many";
  if (new Set(macs).size !== macs.length) return "duplicate";
  if (!macs.every(isCanonicalMac)) return "invalid";
  return null;
}

/** How the drawer names each field, lowercase for use within a sentence. */
export const IDENTITY_FIELD_NAMES: Record<IdentityField, string> = {
  name: "nom",
  type: "type",
  hostname: "hostname",
  serial: "numéro de série",
  macs: "adresses MAC",
  model: "modèle",
  ip: "adresse IP",
  notes: "notes",
};

const MAC_PROBLEMS: Record<MacListProblem, string> = {
  "too-many": `Un équipement porte au plus ${MAX_MACS_PER_DEVICE} adresses MAC.`,
  duplicate: "Une adresse MAC est en double.",
  invalid: "Une adresse MAC n'est pas valide.",
};

export interface IdentityEdit {
  name?: string;
  hostname?: string | null;
  serial?: string | null;
  macs?: Array<string>;
  model?: string | null;
  ip?: string | null;
  notes?: string | null;
}

const OPTIONAL_TEXT_FIELDS = [
  "hostname",
  "serial",
  "model",
  "ip",
  "notes",
] as const;

/**
 * A device with a hostname is named after it, so the plan, the lists and the
 * network all say the same thing (B10, ADR 0029). A source that owns the
 * name keeps it.
 */
export function namedAfterHostname(
  edit: IdentityEdit,
  current: {
    hostname?: string | null;
    source?: { integration: IntegrationKind };
  },
): IdentityEdit {
  if (isSourceOwned(current.source, "name")) return edit;
  const hostname =
    edit.hostname !== undefined ? edit.hostname : (current.hostname ?? null);
  return hostname ? { ...edit, name: hostname } : edit;
}

/** Trims text; an emptied optional field is removed (`null`). */
export function normalizeIdentityEdit(edit: IdentityEdit): IdentityEdit {
  const normalized: IdentityEdit = { ...edit };
  if (edit.name !== undefined) normalized.name = edit.name.trim();
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = edit[field];
    if (typeof value === "string") normalized[field] = value.trim() || null;
  }
  return normalized;
}

const IPV4 =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** An IPv4 or IPv6 address, without a prefix length. */
export function isIpAddress(value: string): boolean {
  if (IPV4.test(value)) return true;
  if (!value.includes(":") || !/^[0-9a-f:.]+$/i.test(value)) return false;
  try {
    // The URL parser knows every IPv6 notation, the embedded IPv4 included.
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

export interface IdentityProblem {
  field: IdentityField;
  message: string;
}

/**
 * Why a normalized identity edit is refused, in French, and the field at
 * fault, so a form can show the reason under that field; or null.
 */
export function identityEditProblem(
  edit: IdentityEdit,
): IdentityProblem | null {
  if (edit.name !== undefined && edit.name.trim() === "") {
    return { field: "name", message: "Le nom est obligatoire." };
  }
  for (const field of Object.keys(IDENTITY_TEXT_LIMITS) as Array<
    keyof typeof IDENTITY_TEXT_LIMITS
  >) {
    const value = edit[field];
    const limit = IDENTITY_TEXT_LIMITS[field];
    if (typeof value === "string" && value.length > limit) {
      return {
        field,
        message: `Trop long : ${IDENTITY_FIELD_NAMES[field]} (${limit} caractères au plus).`,
      };
    }
  }
  if (typeof edit.ip === "string" && !isIpAddress(edit.ip)) {
    return { field: "ip", message: `« ${edit.ip} » n'est pas une adresse IP.` };
  }
  if (edit.macs) {
    const problem = macListProblem(edit.macs);
    if (problem) return { field: "macs", message: MAC_PROBLEMS[problem] };
  }
  return null;
}

/** A French reason a normalized identity edit is refused, or null. */
export function identityEditError(edit: IdentityEdit): string | null {
  return identityEditProblem(edit)?.message ?? null;
}
