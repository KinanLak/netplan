import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import type {
  PaginatedQueryArgs,
  PaginatedQueryReference,
  UsePaginatedQueryReturnType,
} from "convex/react";

/**
 * While a new first page loads, the last rows stay, under the true status:
 * the caller shows them, marked busy, but neither an empty message nor a
 * « more » button from the previous answer.
 */
export function keptPage<
  Answer extends { status: string; results: ReadonlyArray<unknown> },
>(kept: Answer, current: Answer): Answer {
  return current.status === "LoadingFirstPage"
    ? { ...current, results: kept.results }
    : current;
}

/**
 * `usePaginatedQuery` that keeps showing the last rows while new arguments
 * load: each keystroke of a search starts a new first page, and the list
 * would otherwise empty and refill under the user's eyes.
 */
export function useKeptPaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query>,
  options: { initialNumItems: number },
): UsePaginatedQueryReturnType<Query> {
  const current = usePaginatedQuery(query, args, options);
  const [kept, setKept] = useState(current);
  // Stored during render, as React advises for a value derived from the
  // previous render; `results` keeps its identity until the pages change.
  if (
    current.status !== "LoadingFirstPage" &&
    kept.results !== current.results
  ) {
    setKept(current);
  }
  return keptPage(kept, current);
}
