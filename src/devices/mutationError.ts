import { ConvexError } from "convex/values";
import { isForbidden } from "@/lib/login";

/** What to tell an Éditeur when a device mutation fails, in French. */
export function deviceMutationError(error: unknown): string {
  if (isForbidden(error)) return "Action réservée aux éditeurs.";
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return "La modification a échoué. Réessayez.";
}
