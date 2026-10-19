// Checks a real LibreNMS against what a collection cycle expects of it, with
// the cycle's own requests and readers. Reads `LIBRENMS_URL` and
// `LIBRENMS_TOKEN` from the environment and prints counts and formats only,
// never the address, the token, a name or a MAC address.
//
//   bun scripts/check-librenms.ts                       the API and its devices
//   bun scripts/check-librenms.ts --device 12 [--device 13]   switches as a cycle reads them
//   bun scripts/check-librenms.ts --device 12 --discover      and one discovery
//   bun scripts/check-librenms.ts --insecure ...              accepting any certificate
//
// `--discover` asks LibreNMS to discover each device once, as a cycle does:
// leave five minutes between two runs on the same site. `--insecure` is the
// script's "Ignorer les erreurs de certificat TLS" (ADR 0028), for a
// LibreNMS whose certificate does not match its address.
import { parseArgs } from "node:util";
import { defaultFetch, pause, SOURCE_RETRY } from "../convex/lib/httpRetry";
import type { Fetch } from "../convex/lib/httpRetry";
import { PROBE_RETRY, sourceGet } from "../convex/lib/integrationProbe";
import type { Source, SourceAnswer } from "../convex/lib/integrationProbe";
import { librenmsId } from "../src/sites/librenms";
import { readLastDiscovered } from "../src/sites/librenmsCycle";
import { discoveryChecks, switchChecks } from "./lib/librenmsCheck";
import type { Check } from "./lib/librenmsCheck";

// As long as a cycle waits for a discovery, polling as often.
const DISCOVERY_WAIT_MS = 2 * 60_000;
const DISCOVERY_POLL_MS = 10_000;

const { values } = parseArgs({
  options: {
    device: { type: "string", multiple: true, default: [] },
    discover: { type: "boolean", default: false },
    insecure: { type: "boolean", default: false },
  },
});

const baseUrl = process.env.LIBRENMS_URL?.replace(/\/+$/, "");
const token = process.env.LIBRENMS_TOKEN;
if (!baseUrl || !token) {
  console.error("LIBRENMS_URL and LIBRENMS_TOKEN must be set.");
  process.exit(2);
}
const parsed = values.device.map((value) => librenmsId(value));
if (parsed.some((id) => id === null)) {
  console.error("--device takes a LibreNMS device id.");
  process.exit(2);
}
// Once each, as a cycle polls a stack's shared device: a repeated id would
// ask for a second discovery at once.
const ids = [...new Set(parsed)];

// Bun's own option, limited to this script's requests.
const insecureFetch: Fetch = (url, init) =>
  fetch(url, { ...init, tls: { rejectUnauthorized: false } });
const source: Source = {
  kind: "librenms",
  baseUrl,
  token,
  fetch: values.insecure ? insecureFetch : defaultFetch,
};
const read = (path: string) => sourceGet(source, path, SOURCE_RETRY);
const readOnce = (path: string) => sourceGet(source, path, PROBE_RETRY);

const reported: Array<Check> = [];
const report = (title: string, checks: Array<Check>) => {
  console.log(`\n${title}`);
  for (const { level, message } of checks) {
    console.log(`  ${level.toUpperCase().padEnd(4)} ${message}`);
  }
  reported.push(...checks);
};
const answerOf = (what: string, answer: SourceAnswer): Array<Check> =>
  answer.ok ? [] : [{ level: "fail", message: `${what}: ${answer.message}` }];

const system = await read("/api/v0/system");
report(
  "API",
  system.ok
    ? [{ level: "ok", message: "The token reads /api/v0/system." }]
    : answerOf("/api/v0/system", system),
);
if (!system.ok) process.exit(1);

const list = await read("/api/v0/devices");
const listed =
  list.ok && typeof list.body === "object" && list.body !== null
    ? (list.body as Record<string, unknown>).devices
    : undefined;
report(
  "Devices",
  !list.ok
    ? answerOf("/api/v0/devices", list)
    : Array.isArray(listed)
      ? [
          {
            level: "ok",
            message: `${listed.length} devices listed, ${
              listed.filter(
                (item: unknown) =>
                  typeof item === "object" &&
                  item !== null &&
                  librenmsId((item as Record<string, unknown>).device_id) !==
                    null,
              ).length
            } with an id an admin can map a switch to.`,
          },
        ]
      : [{ level: "fail", message: "The answer lists no devices." }],
);

const readSwitch = async (id: number) => {
  const [device, ports, fdb] = await Promise.all([
    read(`/api/v0/devices/${id}`),
    read(
      `/api/v0/devices/${id}/ports?columns=port_id,ifIndex,ifName,ifDescr,ifType,ifOperStatus`,
    ),
    read(`/api/v0/devices/${id}/fdb`),
  ]);
  const failures = [
    ...answerOf("device", device),
    ...answerOf("ports", ports),
    ...answerOf("fdb", fdb),
  ];
  return !device.ok || !ports.ok || !fdb.ok
    ? { ok: false as const, failures }
    : {
        ok: true as const,
        device: device.body,
        ports: ports.body,
        fdb: fdb.body,
      };
};

for (const [index, id] of ids.entries()) {
  if (id === null) continue;
  // Numbered rather than named, so that the output can be shared.
  const title = `Switch ${index + 1}`;
  const before = await readSwitch(id);
  if (!before.ok) {
    report(title, before.failures);
    continue;
  }
  report(title, switchChecks(before));
  if (!values.discover) continue;

  // One attempt, as a cycle makes: a retry could ask for a second discovery.
  const asked = await sourceGet(source, `/api/v0/devices/${id}/discover`, {
    ...PROBE_RETRY,
    attempts: 1,
  });
  if (!asked.ok && asked.status !== undefined && asked.status < 500) {
    report(`${title}, discovery`, answerOf("discover", asked));
    continue;
  }
  const last = readLastDiscovered(before.device);
  const deadline = Date.now() + DISCOVERY_WAIT_MS;
  let finished = false;
  while (!finished && Date.now() + DISCOVERY_POLL_MS <= deadline) {
    await pause(DISCOVERY_POLL_MS);
    const now = await readOnce(`/api/v0/devices/${id}`);
    const at = now.ok ? readLastDiscovered(now.body) : null;
    finished = at !== null && at !== last;
  }
  const after = finished ? await readSwitch(id) : null;
  report(
    `${title}, discovery`,
    after && !after.ok
      ? after.failures
      : [
          ...answerOf("discover", asked),
          ...discoveryChecks({ before, after }),
          ...(after ? switchChecks(after) : []),
        ],
  );
}

process.exit(reported.some(({ level }) => level === "fail") ? 1 : 0);
