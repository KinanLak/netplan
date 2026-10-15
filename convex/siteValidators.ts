import { v } from "convex/values";

/** `SiteCadence` from `src/sites/settings.ts`. */
export const siteCadence = v.object({
  businessIntervalMinutes: v.number(),
  otherIntervalMinutes: v.number(),
  businessStartMinute: v.number(),
  businessEndMinute: v.number(),
  businessDays: v.array(v.number()),
});

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

export const connectionCheck = v.object({
  ok: v.boolean(),
  message: v.string(),
  at: v.number(),
});
