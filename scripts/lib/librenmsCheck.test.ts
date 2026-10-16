import { describe, expect, test } from "bun:test";
import { discoveryChecks, shapeOf, switchChecks } from "./librenmsCheck";

const device = (lastDiscovered: string) => ({
  devices: [{ device_id: 7, last_discovered: lastDiscovered }],
});
const ports = {
  ports: [
    { port_id: 1, ifName: "Gi1/0/1" },
    { port_id: 2, ifName: "Gi1/0/2" },
  ],
};
const fdb = (...entries: Array<[number, string, string?]>) => ({
  ports_fdb: entries.map(([portId, mac, updatedAt]) => ({
    port_id: portId,
    mac_address: mac,
    updated_at: updatedAt,
  })),
});
const levels = (checks: Array<{ level: string; message: string }>) =>
  checks.map(({ level, message }) => `${level} ${message}`);

describe("shapeOf", () => {
  test("shows a format without its digits", () => {
    expect(shapeOf("2026-10-16 08:05:00")).toBe("9999-99-99 99:99:99");
    expect(shapeOf(null)).toBe("(none)");
    expect(shapeOf(12)).toBe("number");
    expect(shapeOf("02:aa:0f", /[\da-f]/gi)).toBe("99:99:99");
  });
});

describe("switchChecks", () => {
  test("a table a discovery just refreshed passes", () => {
    const checks = switchChecks({
      device: device("2026-10-16 08:05:30"),
      ports,
      fdb: fdb(
        [1, "02:aa:00:00:00:01", "2026-10-16 08:05:10"],
        [2, "02:aa:00:00:00:02", "2026-10-16 07:00:00"],
      ),
    });
    expect(checks.every(({ level }) => level === "ok")).toBe(true);
    expect(levels(checks)).toContain(
      "ok 1 of 2 entries are within 2 min of the newest, and would count as seen.",
    );
  });

  test("names what the readers cannot read, without the values", () => {
    const checks = switchChecks({
      device: { devices: [{}] },
      ports,
      fdb: fdb(
        [1, "02:aa:00:00:00:01", "16/10/2026 08:05"],
        [9, "zz:00:00:00:00:01", "16/10/2026 08:05"],
      ),
    });
    const text = levels(checks).join("\n");
    expect(text).toContain("warn last_discovered unreadable ((none))");
    expect(text).toContain(
      "fail 1 of 2 forwarding entries unreadable, such as port_id number, mac_address zz:99:99:99:99:99.",
    );
    expect(text).toContain(
      "warn No entry has a readable updated_at (99/99/9999 99:99)",
    );
    expect(text).not.toContain("02:aa");
  });

  test("an old table under a recent discovery is flagged", () => {
    const checks = switchChecks({
      device: device("2026-10-16 08:05:30"),
      ports,
      fdb: fdb([1, "02:aa:00:00:00:01", "2026-10-15 18:00:00"]),
    });
    expect(levels(checks)).toContain(
      "warn The newest entry is 846 min older than the last discovery: discoveries may not refresh the table, or the two clocks differ.",
    );
  });

  test("entries on unknown ports are counted", () => {
    const checks = switchChecks({
      device: device("2026-10-16 08:05:30"),
      ports,
      fdb: fdb([3, "02:aa:00:00:00:01", "2026-10-16 08:05:00"]),
    });
    expect(levels(checks)).toContain(
      "warn 1 entries on ports the port list does not have.",
    );
  });
});

describe("discoveryChecks", () => {
  const before = {
    device: device("2026-10-16 08:00:00"),
    fdb: fdb([1, "02:aa:00:00:00:01", "2026-10-16 08:00:00"]),
  };

  test("a discovery that moved the newest entry refreshed the table", () => {
    const after = {
      device: device("2026-10-16 08:05:30"),
      fdb: fdb([1, "02:aa:00:00:00:01", "2026-10-16 08:05:10"]),
    };
    expect(
      discoveryChecks({ before, after }).every(({ level }) => level === "ok"),
    ).toBe(true);
  });

  test("one that moved nothing, or did not finish, is flagged", () => {
    const after = { device: device("2026-10-16 08:05:30"), fdb: before.fdb };
    expect(discoveryChecks({ before, after }).at(-1)?.level).toBe("warn");
    expect(discoveryChecks({ before, after: null })).toEqual([
      expect.objectContaining({ level: "fail" }),
    ]);
  });
});
