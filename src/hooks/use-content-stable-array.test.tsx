import { describe, expect, it } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useContentStableArray } from "./use-content-stable-array";

describe("useContentStableArray", () => {
  it("keeps the previous identity for content-equal arrays", () => {
    const items = [1, 2, 3];
    const { result, rerender } = renderHook(
      ({ value }: { value: Array<number> }) => useContentStableArray(value),
      { initialProps: { value: items } },
    );

    const first = result.current;
    rerender({ value: [...items] });

    expect(result.current).toBe(first);
  });

  it("adopts the new array when content changes", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: Array<number> }) => useContentStableArray(value),
      { initialProps: { value: [1, 2, 3] } },
    );

    rerender({ value: [1, 2, 3, 4] });

    expect(result.current).toEqual([1, 2, 3, 4]);
  });
});
