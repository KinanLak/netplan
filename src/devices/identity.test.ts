import { describe, expect, it } from "bun:test";
import { identityEditError, isIpAddress } from "./identity";

describe("isIpAddress", () => {
  it("takes IPv4 and IPv6 addresses in their usual notations", () => {
    for (const address of [
      "192.0.2.11",
      "0.0.0.0",
      "255.255.255.255",
      "2001:db8::1",
      "::1",
      "fe80::1ff:fe23:4567:890a",
      "::ffff:192.0.2.1",
    ]) {
      expect(isIpAddress(address)).toBe(true);
    }
  });

  it("refuses what only looks like one", () => {
    for (const value of [
      "999.1.1",
      "192.0.2",
      "256.1.1.1",
      "192.0.2.11/24",
      "2001:db8:::1",
      "1:2:3:4:5:6:7:8:9",
      "pc-1",
      "",
    ]) {
      expect(isIpAddress(value)).toBe(false);
    }
  });
});

describe("identityEditError", () => {
  it("names an IP address it refuses, and leaves a cleared one alone", () => {
    expect(identityEditError({ ip: "999.1.1" })).toBe(
      "« 999.1.1 » n'est pas une adresse IP.",
    );
    expect(identityEditError({ ip: "192.0.2.11" })).toBeNull();
    expect(identityEditError({ ip: null })).toBeNull();
  });
});
