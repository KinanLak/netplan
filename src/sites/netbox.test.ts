import { describe, expect, it } from "bun:test";
import { sameNetBoxInstance } from "./netbox";

describe("sameNetBoxInstance", () => {
  const settings = {
    site: { id: 7, name: "Siège" },
    roles: [{ id: 4, name: "Workstation", type: "pc" as const }],
  };
  const none = { sampled: 0, matched: 0 };

  it("recognises the configured site under its id and name", () => {
    expect(sameNetBoxInstance(settings, { id: 7, name: "Siège" }, none)).toBe(
      true,
    );
  });

  it("recognises a renamed site by most of the linked devices it still has", () => {
    const renamed = { id: 7, name: "Siège social" };
    expect(
      sameNetBoxInstance(settings, renamed, { sampled: 10, matched: 9 }),
    ).toBe(true);
    expect(
      sameNetBoxInstance(settings, renamed, { sampled: 10, matched: 5 }),
    ).toBe(false);
    expect(sameNetBoxInstance(settings, renamed, none)).toBe(false);
  });

  it("calls anything else another instance", () => {
    expect(sameNetBoxInstance(settings, null, none)).toBe(false);
    expect(
      sameNetBoxInstance(
        settings,
        { id: 8, name: "Siège" },
        {
          sampled: 10,
          matched: 10,
        },
      ),
    ).toBe(false);
    expect(
      sameNetBoxInstance(
        { site: null, roles: [] },
        { id: 7, name: "Siège" },
        none,
      ),
    ).toBe(false);
  });
});
