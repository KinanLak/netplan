import { describe, expect, it } from "bun:test";
import {
  classifyFdbTimestamp,
  normalizedFdbIdentitySet,
  summarizeFdbFreshness,
} from "./librenmsFreshness";

const bounds = {
  externalId: "4",
  triggerStartedAt: Date.parse("2026-07-20T10:00:00Z"),
  discoveryCompletedAt: Date.parse("2026-07-20T10:01:00Z"),
  serverObservedAt: Date.parse("2026-07-20T10:01:30Z"),
};

describe("LibreNMS FDB freshness", () => {
  it("accepts only timestamps produced inside the switch attempt", () => {
    expect(classifyFdbTimestamp("2026-07-20T10:00:00Z", bounds)).toMatchObject({
      fresh: true,
      reason: "fresh",
    });
    expect(classifyFdbTimestamp("2026-07-20T09:59:59Z", bounds)).toMatchObject({
      fresh: false,
      reason: "before_trigger",
    });
    expect(classifyFdbTimestamp("2026-07-20T10:02:01Z", bounds)).toMatchObject({
      fresh: false,
      reason: "after_discovery",
    });
  });

  it("rejects missing, malformed, and future timestamps", () => {
    expect(classifyFdbTimestamp(undefined, bounds).reason).toBe(
      "missing_timestamp",
    );
    expect(classifyFdbTimestamp("not-a-date", bounds).reason).toBe(
      "invalid_timestamp",
    );
    expect(classifyFdbTimestamp("2026-07-20T10:00:30", bounds).reason).toBe(
      "invalid_timestamp",
    );
    expect(classifyFdbTimestamp("2026-07-20 10:00:30", bounds).reason).toBe(
      "invalid_timestamp",
    );
    expect(
      classifyFdbTimestamp("2026-07-20T12:00:30+02:00", bounds),
    ).toMatchObject({ fresh: true, reason: "fresh" });
    expect(
      classifyFdbTimestamp("2026-07-20T10:01:31Z", {
        ...bounds,
        discoveryCompletedAt: Date.parse("2026-07-20T10:02:00Z"),
      }).reason,
    ).toBe("future_server_time");
  });

  it("uses the successful retry bounds independently per switch", () => {
    const rows = [
      { deviceId: 4, updatedAt: "2026-07-20T10:00:30Z" },
      { deviceId: 5, updatedAt: "2026-07-20T10:00:30Z" },
    ];
    const result = summarizeFdbFreshness(rows, [
      bounds,
      {
        ...bounds,
        externalId: "5",
        triggerStartedAt: bounds.discoveryCompletedAt,
      },
    ]);
    expect(result.fresh).toEqual([rows[0]]);
    expect(result.reasons.get("fresh")).toBe(1);
    expect(result.reasons.get("before_trigger")).toBe(1);
  });

  it("normalizes and sorts complete FDB row identities deterministically", () => {
    expect(
      normalizedFdbIdentitySet([
        {
          deviceId: "4",
          portId: 11,
          macAddress: "aa:bb:cc:dd:ee:ff",
          updatedAt: "2026-07-20T12:00:00+02:00",
        },
        {
          deviceId: 4,
          portId: 10,
          macAddress: "001122334455",
          updatedAt: "2026-07-20T10:00:00Z",
        },
      ]),
    ).toEqual([
      ["4", "10", "001122334455", Date.parse("2026-07-20T10:00:00Z")].join(
        "\0",
      ),
      ["4", "11", "AABBCCDDEEFF", Date.parse("2026-07-20T10:00:00Z")].join(
        "\0",
      ),
    ]);
  });
});
