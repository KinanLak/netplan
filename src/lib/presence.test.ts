import { describe, expect, it } from "bun:test";
import type { FloorId } from "@/types/map";
import { activePresences, sortPresences } from "./presence";
import type { RawPresence, SelfPresence } from "./presence";

const raw = (over: Partial<RawPresence>): RawPresence => ({
  sessionId: "s",
  clientId: "c",
  displayName: "Name",
  colorHue: 100,
  floorId: "floor:a",
  updatedAt: 1_000,
  ...over,
});

const self: SelfPresence = {
  sessionId: "self-session",
  clientId: "client:self",
  displayName: "Moi",
  colorHue: 42,
  floorId: "floor:a" as FloorId,
};

describe("activePresences", () => {
  it("drops rows older than the stale cutoff", () => {
    const result = activePresences(
      [
        raw({ clientId: "fresh", updatedAt: 9_000 }),
        raw({ clientId: "stale", updatedAt: 3_000 }),
      ],
      null,
      10_000,
      5_000,
    );
    expect(result.map((p) => p.clientId)).toEqual(["fresh"]);
  });

  it("keeps the latest row per client", () => {
    const result = activePresences(
      [
        raw({ clientId: "bob", colorHue: 2, updatedAt: 9_500 }),
        raw({ clientId: "bob", colorHue: 1, updatedAt: 9_000 }),
      ],
      null,
      10_000,
      5_000,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.colorHue).toBe(2);
  });

  it("injects self with fresh data on its current floor", () => {
    const result = activePresences([], self, 10_000, 5_000);
    const me = result.find((p) => p.clientId === "client:self");
    expect(me).toBeDefined();
    expect(me?.isSelf).toBe(true);
    expect(me?.floorId).toBe("floor:a");
    expect(me?.updatedAt).toBe(10_000);
  });

  it("overrides a stale self row from the server with the current floor", () => {
    const result = activePresences(
      [raw({ clientId: "client:self", floorId: "floor:old", updatedAt: 0 })],
      self,
      10_000,
      5_000,
    );
    const me = result.find((p) => p.clientId === "client:self");
    expect(me?.floorId).toBe("floor:a");
    expect(me?.isSelf).toBe(true);
  });

  it("flags other clients as not self", () => {
    const result = activePresences(
      [raw({ clientId: "client:other", updatedAt: 9_000 })],
      self,
      10_000,
      5_000,
    );
    expect(result.find((p) => p.clientId === "client:other")?.isSelf).toBe(
      false,
    );
  });

  it("does not inject self when it has no floor", () => {
    const result = activePresences([], { ...self, floorId: null }, 10_000);
    expect(result).toHaveLength(0);
  });
});

describe("sortPresences", () => {
  it("puts self first then sorts others by name", () => {
    const sorted = sortPresences([
      { ...raw({ clientId: "c", displayName: "Charlie" }), isSelf: false },
      { ...raw({ clientId: "me", displayName: "Moi" }), isSelf: true },
      { ...raw({ clientId: "a", displayName: "Alice" }), isSelf: false },
    ]);
    expect(sorted.map((p) => p.displayName)).toEqual([
      "Moi",
      "Alice",
      "Charlie",
    ]);
  });
});
