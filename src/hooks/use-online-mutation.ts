import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import { useConnectionStore } from "@/store/useConnectionStore";

/** What a change made without a connection answers (ADR 0037). */
export const OFFLINE_REFUSAL =
  "Hors connexion : la modification n'a pas été envoyée.";

/**
 * `useMutation` for a change the user makes: refused at once while the page
 * is offline, instead of waiting in Convex's queue to land minutes later on
 * data someone else may have changed. The refusal is a French `ConvexError`,
 * so the caller's usual failure message shows it.
 */
export function useOnlineMutation<
  Mutation extends FunctionReference<"mutation">,
>(
  mutation: Mutation,
): (
  ...args: OptionalRestArgs<Mutation>
) => Promise<FunctionReturnType<Mutation>> {
  const mutate = useMutation(mutation);
  return (...args) =>
    useConnectionStore.getState().isMapFrozen
      ? Promise.reject(new ConvexError(OFFLINE_REFUSAL))
      : mutate(...args);
}
