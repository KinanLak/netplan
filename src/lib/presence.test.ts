import { describe, expect, it } from "bun:test";
import type { FloorId } from "@/types/map";
import { activePresences, sortPresences } from "./presence";
import type { RawPresence, SelfPresence } from "./presence";

const raw = (over: Partial<RawPresence>): RawPresence => ({
  clientId: "c",
  userId: "u",
  displayName: "Name",
  colorHue: 100,
  floorId: "floor:a",
  updatedAt: 1_000,
  ...over,
});

const self: SelfPresence = {
  clientId: "client:self",
  userId: "user:self",
  displayName: "Moi",
  colorHue: 42,
  floorId: "floor:a" as FloorId,
};

describe("activePresences", () => {
  it("drops rows older than the stale cutoff", () => {
    const result = activePresences(
      [
        raw({ userId: "fresh", updatedAt: 9_000 }),
        raw({ userId: "stale", updatedAt: 3_000 }),
      ],
      null,
      10_000,
      5_000,
    );
    expect(result.map((p) => p.userId)).toEqual(["fresh"]);
  });

  it("keeps the latest row per user, whichever tab it came from", () => {
    const result = activePresences(
      [
        raw({
          userId: "bob",
          clientId: "tab-1",
          floorId: "floor:b",
          updatedAt: 9_500,
        }),
        raw({ userId: "bob", clientId: "tab-2", updatedAt: 9_000 }),
      ],
      null,
      10_000,
      5_000,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.floorId).toBe("floor:b");
  });

  it("injects self with fresh data on its current floor", () => {
    const result = activePresences([], self, 10_000, 5_000);
    const me = result.find((p) => p.userId === "user:self");
    expect(me).toBeDefined();
    expect(me?.isSelf).toBe(true);
    expect(me?.floorId).toBe("floor:a");
    expect(me?.updatedAt).toBe(10_000);
  });

  it("shows the user on this page's floor even when another of their tabs spoke last", () => {
    const result = activePresences(
      [
        raw({
          userId: "user:self",
          clientId: "client:other-tab",
          floorId: "floor:old",
          updatedAt: 9_900,
        }),
      ],
      self,
      10_000,
      5_000,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.floorId).toBe("floor:a");
    expect(result[0]?.isSelf).toBe(true);
  });

  it("flags other users as not self", () => {
    const result = activePresences(
      [raw({ userId: "user:other", updatedAt: 9_000 })],
      self,
      10_000,
      5_000,
    );
    expect(result.find((p) => p.userId === "user:other")?.isSelf).toBe(false);
  });

  it("does not inject self when it has no floor", () => {
    const result = activePresences([], { ...self, floorId: null }, 10_000);
    expect(result).toHaveLength(0);
  });
});

describe("sortPresences", () => {
  it("puts self first then sorts others by name", () => {
    const sorted = sortPresences([
      { ...raw({ userId: "c", displayName: "Charlie" }), isSelf: false },
      { ...raw({ userId: "me", displayName: "Moi" }), isSelf: true },
      { ...raw({ userId: "a", displayName: "Alice" }), isSelf: false },
    ]);
    expect(sorted.map((p) => p.displayName)).toEqual([
      "Moi",
      "Alice",
      "Charlie",
    ]);
  });
});
