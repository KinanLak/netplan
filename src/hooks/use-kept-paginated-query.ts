import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import type {
  PaginatedQueryArgs,
  PaginatedQueryReference,
  UsePaginatedQueryReturnType,
} from "convex/react";

/**
 * `usePaginatedQuery` that keeps showing the last answer while new
 * arguments load: each keystroke of a search starts a new first page, and
 * the list would otherwise empty and refill under the user's eyes.
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
    (kept.results !== current.results || kept.status !== current.status)
  ) {
    setKept(current);
  }
  // The kept `loadMore` would page the new query from the old cursor; the
  // current one does nothing until the first page arrives.
  return current.status === "LoadingFirstPage"
    ? { ...kept, loadMore: current.loadMore }
    : current;
}
