import { describe, expect, it } from "bun:test";
import { customFields, pushDue, pushRetryAt, pushValues } from "./netboxPush";

const AT = Date.parse("2026-10-16T09:30:12.345Z");

const place = {
  switchName: "sw-a",
  portName: "Gi1/0/3",
  socketName: "B-01",
  floorName: "Rez-de-chaussée",
  buildingName: "Bâtiment A",
};

const values = pushValues("Siège", place);

describe("pushValues", () => {
  it("names the floor with its building and the port with its switch", () => {
    expect(values).toEqual({
      site: "Siège",
      floor: "Bâtiment A · Rez-de-chaussée",
      socket: "B-01",
      switchPort: "sw-a · Gi1/0/3",
    });
  });

  it("clears the socket and floor of a port that reaches no socket", () => {
    const edge = pushValues("Siège", {
      switchName: "sw-a",
      portName: "Gi1/0/9",
    });
    expect(edge.floor).toBeNull();
    expect(edge.socket).toBeNull();
  });
});

describe("customFields", () => {
  it("stamps the location with when NetPlan sent it, to the second, in UTC", () => {
    expect(customFields(values, AT)).toEqual({
      netplan_site: "Siège",
      netplan_floor: "Bâtiment A · Rez-de-chaussée",
      netplan_socket: "B-01",
      netplan_switch_port: "sw-a · Gi1/0/3",
      netplan_updated: "2026-10-16T09:30:12Z",
    });
  });
});

describe("pushDue", () => {
  it("sends a device never sent", () => {
    expect(pushDue(values, null)).toBe(true);
  });

  it("sends a new socket or port", () => {
    expect(
      pushDue(pushValues("Siège", { ...place, socketName: "B-02" }), values),
    ).toBe(true);
    expect(
      pushDue(pushValues("Siège", { ...place, portName: "Gi1/0/4" }), values),
    ).toBe(true);
  });

  it("never resends a location NetBox already shows, however long ago it was sent", () => {
    expect(pushDue(pushValues("Siège", place), values)).toBe(false);
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
