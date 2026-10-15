const HEX_DIGITS = /^[0-9a-f]{12}$/;

/**
 * The canonical form of a MAC address, `aa:bb:cc:dd:ee:ff`, from any of the
 * notations tools print (`AA-BB-CC-DD-EE-FF`, `aabb.ccdd.eeff`, bare hex), or
 * `null` when the text is not one.
 */
export function normalizeMac(text: string): string | null {
  const digits = text
    .trim()
    .toLowerCase()
    .replaceAll(/[\s:.-]/g, "");
  if (!HEX_DIGITS.test(digits)) return null;
  return digits.match(/../g)?.join(":") ?? null;
}

/** Whether the text is already a MAC address in its canonical form. */
export const isCanonicalMac = (text: string): boolean =>
  normalizeMac(text) === text;
