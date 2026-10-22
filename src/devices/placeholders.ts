// Values vendors and tools write where the real one was never filled in. They
// identify nothing and say nothing, so Netplan treats them as empty. Imported
// by `convex/`, so relative imports only.
const PLACEHOLDERS = new Set([
  "0",
  "00000000",
  "0123456789",
  "123456789",
  "1234567890",
  "chassis serial number",
  "default string",
  "n/a",
  "na",
  "none",
  "not applicable",
  "not specified",
  "null",
  "system serial number",
  "to be filled by o.e.m.",
  "undefined",
  "unknown",
]);

export const isPlaceholder = (value: string): boolean =>
  PLACEHOLDERS.has(value.trim().toLowerCase());

/** The value, or `undefined` when it is empty or a placeholder. */
export const meaningful = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === "" || isPlaceholder(value)
    ? undefined
    : value;
