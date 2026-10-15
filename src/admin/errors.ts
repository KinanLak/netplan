import { ConvexError } from "convex/values";
import { isForbidden } from "@/lib/login";

/**
 * What the admin reads when a change is refused. Admin functions refuse with
 * a French sentence; anything else is not theirs to fix.
 */
export function adminErrorMessage(error: unknown): string {
  if (isForbidden(error)) return "Action réservée aux administrateurs.";
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return "La modification a échoué. Réessayez.";
}
