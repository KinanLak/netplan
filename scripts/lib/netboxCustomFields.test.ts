import { describe, expect, it } from "bun:test";
import { fieldBody, planFields } from "./netboxCustomFields";
import { PUSH_FIELDS } from "../../src/sites/netboxPush";

const existing = (
  name: string,
  type: string,
  objectTypes = ["dcim.device"],
) => ({
  name,
  type: { value: type, label: type },
  object_types: objectTypes,
});

describe("planFields", () => {
  it("creates every field of an empty NetBox", () => {
    const plan = planFields([]);
    expect(plan.create.map((field) => field.name)).toEqual(
      PUSH_FIELDS.map((field) => field.name),
    );
    expect(plan.wrong).toEqual([]);
  });

  it("keeps fields already there and reports those it cannot write", () => {
    const plan = planFields([
      existing("netplan_site", "text"),
      existing("netplan_floor", "integer"),
      existing("netplan_socket", "text", ["dcim.interface"]),
      // Written before ADR 0040: no longer the push's, and left as it is.
      existing("netplan_last_seen", "datetime"),
    ]);
    expect(plan.ready).toEqual(["netplan_site"]);
    expect(plan.create.map((field) => field.name)).toEqual([
      "netplan_switch_port",
      "netplan_updated",
    ]);
    expect(plan.wrong).toEqual([
      { name: "netplan_floor", problem: "is a integer field, not text" },
      { name: "netplan_socket", problem: "does not apply to dcim.device" },
    ]);
  });
});

describe("fieldBody", () => {
  it("creates a device field people read but do not edit", () => {
    expect(fieldBody(PUSH_FIELDS[4])).toMatchObject({
      name: "netplan_updated",
      label: "Modifié par NetPlan le",
      type: "datetime",
      object_types: ["dcim.device"],
      required: false,
      ui_editable: "no",
    });
  });
});
