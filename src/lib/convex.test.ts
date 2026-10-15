import { describe, expect, it } from "bun:test";
import { getConvexClient } from "@/lib/convex";

describe("getConvexClient", () => {
  it("keeps one client while the URL is the same", () => {
    const first = getConvexClient("http://convex-a.test");
    expect(getConvexClient("http://convex-a.test")).toBe(first);
    expect(first.url).toBe("http://convex-a.test");
  });

  it("replaces the client when the URL changes", () => {
    const first = getConvexClient("http://convex-a.test");
    const second = getConvexClient("http://convex-b.test");
    expect(second).not.toBe(first);
    expect(second.url).toBe("http://convex-b.test");
  });
});
