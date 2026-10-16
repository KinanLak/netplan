import { describe, expect, it } from "bun:test";
import {
  customFields,
  LAST_SEEN_REFRESH_MS,
  pushDue,
  pushRetryAt,
  pushValues,
} from "./netboxPush";

const AT = Date.parse("2026-10-16T09:30:12.345Z");

const place = {
  switchName: "sw-a",
  portName: "Gi1/0/3",
  socketName: "B-01",
  floorName: "Rez-de-chaussée",
  buildingName: "Bâtiment A",
};

const values = pushValues("Siège", place, AT);

describe("pushValues", () => {
  it("names the floor with its building and the port with its switch", () => {
    expect(values).toEqual({
      site: "Siège",
      floor: "Bâtiment A · Rez-de-chaussée",
      socket: "B-01",
      switchPort: "sw-a · Gi1/0/3",
      lastSeen: AT,
    });
  });

  it("clears the socket and floor of a port that reaches no socket", () => {
    const edge = pushValues(
      "Siège",
      { switchName: "sw-a", portName: "Gi1/0/9" },
      AT,
    );
    expect(edge.floor).toBeNull();
    expect(edge.socket).toBeNull();
  });
});

describe("customFields", () => {
  it("writes the last sighting to the second, in UTC", () => {
    expect(customFields(values)).toEqual({
      netplan_site: "Siège",
      netplan_floor: "Bâtiment A · Rez-de-chaussée",
      netplan_socket: "B-01",
      netplan_switch_port: "sw-a · Gi1/0/3",
      netplan_last_seen: "2026-10-16T09:30:12Z",
    });
  });
});

describe("pushDue", () => {
  const sent = { values, at: AT };
  const later = { ...values, lastSeen: AT + 5 * 60_000 };

  it("sends a device never sent", () => {
    expect(pushDue(values, null, false, AT)).toBe(true);
  });

  it("sends a new socket at once", () => {
    const moved = pushValues("Siège", { ...place, socketName: "B-02" }, AT);
    expect(pushDue(moved, sent, false, AT + 1)).toBe(true);
  });

  it("does not resend what NetBox already shows", () => {
    expect(pushDue(values, sent, true, AT + LAST_SEEN_REFRESH_MS * 2)).toBe(
      false,
    );
  });

  it("holds an online device's newer sighting for six hours", () => {
    expect(pushDue(later, sent, false, AT + LAST_SEEN_REFRESH_MS - 1)).toBe(
      false,
    );
    expect(pushDue(later, sent, false, AT + LAST_SEEN_REFRESH_MS)).toBe(true);
  });

  it("sends an offline device's last sighting at once", () => {
    expect(pushDue(later, sent, true, AT + 10 * 60_000)).toBe(true);
  });
});

describe("pushRetryAt", () => {
  it("waits one minute, doubling to one hour", () => {
    expect(pushRetryAt(1, 0)).toBe(60_000);
    expect(pushRetryAt(2, 0)).toBe(120_000);
    expect(pushRetryAt(6, 0)).toBe(32 * 60_000);
    expect(pushRetryAt(7, 0)).toBe(60 * 60_000);
    expect(pushRetryAt(30, 0)).toBe(60 * 60_000);
  });
});
