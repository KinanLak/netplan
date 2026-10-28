import { ConvexError } from "convex/values";
import { isForbidden } from "@/lib/login";

const RESERVED_TO = {
  editor: "Action réservée aux éditeurs.",
  admin: "Action réservée aux administrateurs.",
} as const;

/**
 * What a user reads when the server refuses a call (ADR 0026): the server's
 * own French sentence, the refusal of their role, or anything else as a
 * failure that is not theirs to fix.
 */
export function failureMessage(
  error: unknown,
  reservedTo: keyof typeof RESERVED_TO,
): string {
  if (isForbidden(error)) return RESERVED_TO[reservedTo];
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return "La modification a échoué.";
}
