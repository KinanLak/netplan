import { describe, expect, it } from "bun:test";
import {
  FIRST_CONNECTION_MS,
  OFFLINE_LINE_DELAY_MS,
  advanceClock,
  isUp,
  offlineLine,
} from "./connection";
import type { ConnectionClock } from "./connection";

const socket = (isWebSocketConnected: boolean, hasEverConnected = true) =>
  ({ isWebSocketConnected, hasEverConnected }) as ConnectionClock["state"];

const up: ConnectionClock = {
  state: socket(true),
  online: true,
  since: 0,
  now: 0,
};

const lostFor = (elapsed: number) => {
  const lost = advanceClock(up, { state: socket(false) }, 1_000);
  return offlineLine({ ...lost, now: 1_000 + elapsed });
};

describe("advanceClock", () => {
  it("counts the browser losing its network at once, with the socket still open", () => {
    const offline = advanceClock(up, { online: false }, 1_000);
    expect(isUp(offline)).toBe(false);
    expect(offline.since).toBe(1_000);
  });

  it("keeps the time of the first loss when the socket closes afterwards", () => {
    const offline = advanceClock(up, { online: false }, 1_000);
    const closed = advanceClock(offline, { state: socket(false) }, 50_000);
    expect(closed.since).toBe(1_000);
    expect(closed.now).toBe(50_000);
  });

  it("is up again only once both the network and the socket are back", () => {
    let clock = advanceClock(up, { online: false }, 1_000);
    clock = advanceClock(clock, { state: socket(false) }, 2_000);
    clock = advanceClock(clock, { online: true }, 3_000);
    expect(isUp(clock)).toBe(false);
    clock = advanceClock(clock, { state: socket(true) }, 4_000);
    expect(isUp(clock)).toBe(true);
    expect(clock.since).toBe(4_000);
  });
});

describe("offlineLine", () => {
  it("says nothing about a socket that reconnects at once", () => {
    expect(lostFor(500)).toEqual({
      shown: false,
      changesIn: OFFLINE_LINE_DELAY_MS - 500,
    });
  });

  it("shows once the connection has stayed down", () => {
    expect(lostFor(OFFLINE_LINE_DELAY_MS)).toEqual({
      shown: true,
      changesIn: null,
    });
  });

  it("gives the first connection longer", () => {
    const opening = (elapsed: number) =>
      offlineLine({
        state: socket(false, false),
        online: true,
        since: 0,
        now: elapsed,
      }).shown;
    expect(opening(FIRST_CONNECTION_MS - 1)).toBe(false);
    expect(opening(FIRST_CONNECTION_MS)).toBe(true);
  });

  it("hides whatever the time once the connection is back", () => {
    expect(offlineLine({ ...up, now: 10 * FIRST_CONNECTION_MS })).toEqual({
      shown: false,
      changesIn: null,
    });
  });
});
