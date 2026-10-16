// Creates on a NetBox the custom fields the location push writes (ADR 0027),
// those that are missing. Reads `NETBOX_URL` and `NETBOX_TOKEN` from the
// environment; the token must be allowed to add custom fields, which the
// site's own token, which only changes devices, need not be.
//
//   bun scripts/netbox-custom-fields.ts           create what is missing
//   bun scripts/netbox-custom-fields.ts --check   only say what is missing
//
// A field that exists with another type is reported and left as it is.
import { parseArgs } from "node:util";
import { fetchWithRetry, SOURCE_RETRY } from "../convex/lib/httpRetry";
import { authHeaders } from "../convex/lib/integrationProbe";
import { netboxList } from "../convex/lib/netboxApi";
import { fieldBody, planFields } from "./lib/netboxCustomFields";

const { values } = parseArgs({
  options: { check: { type: "boolean", default: false } },
});

const baseUrl = process.env.NETBOX_URL?.replace(/\/+$/, "");
const token = process.env.NETBOX_TOKEN;
if (!baseUrl || !token) {
  console.error("Set NETBOX_URL and NETBOX_TOKEN.");
  process.exit(2);
}

const listed = await netboxList(
  baseUrl,
  token,
  "/api/extras/custom-fields/?name__isw=netplan_",
  SOURCE_RETRY,
);
if (!listed.ok) {
  console.error(`Cannot list the custom fields: ${listed.message}`);
  process.exit(1);
}

const plan = planFields(listed.items);
for (const name of plan.ready) console.log(`ok       ${name}`);
for (const { name, problem } of plan.wrong) {
  console.log(`wrong    ${name} ${problem}: fix or remove it in NetBox`);
}

let failed = plan.wrong.length > 0;
for (const field of plan.create) {
  if (values.check) {
    console.log(`missing  ${field.name}`);
    failed = true;
    continue;
  }
  const response = await fetchWithRetry(
    `${baseUrl}/api/extras/custom-fields/`,
    {
      method: "POST",
      headers: {
        ...authHeaders("netbox", token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fieldBody(field)),
      redirect: "manual",
    },
    SOURCE_RETRY,
  );
  if (response.ok) {
    console.log(`created  ${field.name}`);
  } else {
    // NetBox's answer names the refused attribute, never the token.
    console.log(
      `failed   ${field.name}: ${response.status} ${await response.text()}`,
    );
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
