import { describe, expect, it } from "bun:test";
import { keptPage } from "@/hooks/use-kept-paginated-query";

describe("keptPage", () => {
  const previous = { status: "CanLoadMore", results: ["a", "b"] };

  it("keeps the last rows while a new first page loads, under the true status", () => {
    expect(
      keptPage(previous, { status: "LoadingFirstPage", results: [] }),
    ).toEqual({ status: "LoadingFirstPage", results: ["a", "b"] });
  });

  it("shows the new answer once it arrives, even when empty", () => {
    expect(keptPage(previous, { status: "Exhausted", results: [] })).toEqual({
      status: "Exhausted",
      results: [],
    });
  });
});
