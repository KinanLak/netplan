// What `netbox-custom-fields` does to a NetBox: create each custom field of
// the location push (ADR 0027) that is missing, and report one that exists
// with another shape rather than change it, since a person made it.
import { PUSH_FIELDS } from "../../src/sites/netboxPush";

type Raw = Record<string, unknown>;
type Field = (typeof PUSH_FIELDS)[number];

export const DEVICE_OBJECT_TYPE = "dcim.device";

/** The body NetBox 4 takes to create a field. */
export const fieldBody = (field: Field) => ({
  name: field.name,
  label: field.label,
  type: field.type,
  object_types: [DEVICE_OBJECT_TYPE],
  description: field.description,
  group_name: "Netplan",
  required: false,
  // Netplan writes them; a person editing one would be overwritten.
  ui_editable: "no",
});

const typeOf = (item: Raw): unknown =>
  typeof item.type === "object" && item.type !== null
    ? (item.type as Raw).value
    : item.type;

export type FieldPlan = {
  create: Array<Field>;
  ready: Array<string>;
  /** A field of that name that the push cannot write, and why. */
  wrong: Array<{ name: string; problem: string }>;
};

export function planFields(existing: ReadonlyArray<Raw>): FieldPlan {
  const plan: FieldPlan = { create: [], ready: [], wrong: [] };
  for (const field of PUSH_FIELDS) {
    const found = existing.find((item) => item.name === field.name);
    if (!found) {
      plan.create.push(field);
      continue;
    }
    const type = typeOf(found);
    const objectTypes = Array.isArray(found.object_types)
      ? found.object_types
      : [];
    if (type !== field.type) {
      plan.wrong.push({
        name: field.name,
        problem: `is a ${String(type)} field, not ${field.type}`,
      });
    } else if (!objectTypes.includes(DEVICE_OBJECT_TYPE)) {
      plan.wrong.push({
        name: field.name,
        problem: `does not apply to ${DEVICE_OBJECT_TYPE}`,
      });
    } else {
      plan.ready.push(field.name);
    }
  }
  return plan;
}
