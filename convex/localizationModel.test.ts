import { describe, expect, it } from "bun:test";
import {
  localizationEventKinds,
  socketConflictReason,
} from "./localizationModel";

describe("localization event classification", () => {
  it("does not turn a repeated socket conflict into a moved event", () => {
    const previous = {
      state: "socket_conflict" as const,
      lastPresentCycleId: "cycle:previous",
      expiredAt: undefined,
      consecutiveAbsences: 0,
      lastConfirmedSocketExternalId: "socket:old",
    };
    const decision = {
      present: true,
      state: "socket_conflict" as const,
      selected: {
        computerExternalId: "computer:1",
        socketExternalId: "socket:new",
        switchExternalId: "switch:1",
        switchPort: "Gi1/0/1",
        observedAt: 1,
      },
    };

    expect(localizationEventKinds(previous, decision)).toEqual([]);
    expect(
      localizationEventKinds({ ...previous, state: "online" }, decision),
    ).toEqual(["socket_conflict"]);
  });

  it("records both return and movement when a computer returns elsewhere", () => {
    expect(
      localizationEventKinds(
        {
          state: "missing",
          lastPresentCycleId: "cycle:previous",
          expiredAt: undefined,
          consecutiveAbsences: 1,
          lastConfirmedSocketExternalId: "socket:old",
        },
        {
          present: true,
          state: "online",
          selected: {
            computerExternalId: "computer:1",
            socketExternalId: "socket:new",
            switchExternalId: "switch:1",
            switchPort: "Gi1/0/2",
            observedAt: 2,
          },
        },
      ),
    ).toEqual(["returned", "moved"]);
  });

  it("distinguishes a tied socket claim from an older occupant", () => {
    expect(socketConflictReason(100, 100, 2)).toBe("socket_presence_time_tie");
    expect(socketConflictReason(90, 100, 2)).toBe(
      "socket_occupied_by_newer_presence",
    );
  });
});
