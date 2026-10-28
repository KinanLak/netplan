import { describe, expect, it } from "bun:test";
import { sameNetBoxInstance } from "./netbox";

describe("sameNetBoxInstance", () => {
  const settings = {
    site: { id: 7, name: "Siège" },
    roles: [{ id: 4, name: "Workstation", type: "pc" as const }],
  };

  it("recognises the configured site and roles under their ids", () => {
    expect(
      sameNetBoxInstance(settings, { id: 7, name: "Siège" }, new Set([4, 9])),
    ).toBe(true);
  });

  it("calls anything else another instance", () => {
    expect(sameNetBoxInstance(settings, null, new Set([4]))).toBe(false);
    expect(
      sameNetBoxInstance(settings, { id: 7, name: "Lyon" }, new Set([4])),
    ).toBe(false);
    expect(
      sameNetBoxInstance(settings, { id: 7, name: "Siège" }, new Set([5])),
    ).toBe(false);
    expect(
      sameNetBoxInstance(
        { site: null, roles: [] },
        { id: 7, name: "Siège" },
        new Set(),
      ),
    ).toBe(false);
  });
});
