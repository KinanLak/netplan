import { describe, expect, it } from "bun:test";
import {
  BANNER_DELAY_MS,
  FIRST_CONNECTION_MS,
  OFFLINE_GRACE_MS,
  connectionPhase,
} from "./connection";

const lost = (elapsed: number) =>
  connectionPhase({
    connected: false,
    hasEverConnected: true,
    since: 1_000,
    now: 1_000 + elapsed,
  });

describe("connectionPhase", () => {
  it("says nothing about a short drop", () => {
    expect(lost(500)).toEqual({
      phase: "connected",
      changesIn: BANNER_DELAY_MS - 500,
    });
  });

  it("lets editing go on during the grace, then freezes the map", () => {
    expect(lost(BANNER_DELAY_MS)).toEqual({
      phase: "grace",
      changesIn: OFFLINE_GRACE_MS - BANNER_DELAY_MS,
    });
    expect(lost(OFFLINE_GRACE_MS)).toEqual({
      phase: "frozen",
      changesIn: null,
    });
  });

  it("says the server cannot be reached when the first connection does not come", () => {
    const first = (elapsed: number) =>
      connectionPhase({
        connected: false,
        hasEverConnected: false,
        since: 0,
        now: elapsed,
      }).phase;
    expect(first(FIRST_CONNECTION_MS - 1)).toBe("connected");
    expect(first(FIRST_CONNECTION_MS)).toBe("unreachable");
  });

  it("is connected whatever the time once the socket is back", () => {
    expect(
      connectionPhase({
        connected: true,
        hasEverConnected: true,
        since: 0,
        now: OFFLINE_GRACE_MS * 10,
      }),
    ).toEqual({ phase: "connected", changesIn: null });
  });
});
