// What `check-librenms` judges in a LibreNMS's answers: whether the cycle's
// readers understand them, and whether a discovery refreshes the forwarding
// table as the cycle assumes (ADR 0022). Messages carry counts and the shape
// of values, never a name or a MAC address.
import {
  ethernetNames,
  FDB_FRESH_MS,
  freshFdb,
  readLastDiscovered,
  readLibreNMSFdb,
  readLibreNMSPorts,
  readLibreNMSTime,
} from "../../src/sites/librenmsCycle";

export type Check = { level: "ok" | "warn" | "fail"; message: string };

/**
 * A value with its digits masked, to show a format without its data; an
 * address masks its hex letters too.
 */
export const shapeOf = (value: unknown, masked = /\d/g): string =>
  typeof value === "string"
    ? value.replace(masked, "9")
    : value === undefined || value === null
      ? "(none)"
      : typeof value;

const rawEntries = (body: unknown): Array<Record<string, unknown>> => {
  const value =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).ports_fdb
      : undefined;
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null,
  );
};

const minutes = (ms: number) => `${Math.round(ms / 60_000)} min`;

/** The newest entry time of a forwarding table, in LibreNMS's clock. */
export const newestEntry = (fdb: unknown): number | null => {
  const times = readLibreNMSFdb(fdb).flatMap(({ updatedAt }) =>
    updatedAt === null ? [] : [updatedAt],
  );
  return times.length === 0 ? null : Math.max(...times);
};

/** One switch's device, ports and forwarding table, as a cycle reads them. */
export function switchChecks({
  device,
  ports,
  fdb,
}: {
  device: unknown;
  ports: unknown;
  fdb: unknown;
}): Array<Check> {
  const checks: Array<Check> = [];
  const lastDiscovered = readLastDiscovered(device);
  const discoveredAt = readLibreNMSTime(lastDiscovered);
  // A cycle sees a discovery finish when this text changes, whatever its
  // format; only the comparison with the table below needs it as a date.
  checks.push(
    lastDiscovered === null
      ? {
          level: "warn",
          message:
            "No last_discovered: a cycle cannot tell when a discovery finished, waits the full two minutes, then reads the table anyway.",
        }
      : discoveredAt === null
        ? {
            level: "warn",
            message: `last_discovered is not a date this script reads (${shapeOf(lastDiscovered)}): a cycle still sees a discovery finish, but the table cannot be compared with it below.`,
          }
        : {
            level: "ok",
            message: `last_discovered reads (${shapeOf(lastDiscovered)}).`,
          },
  );

  const portList = readLibreNMSPorts(ports);
  const named = portList.filter(({ names }) => names.length > 0).length;
  checks.push(
    portList.length === 0
      ? { level: "fail", message: "No port read." }
      : {
          level: "ok",
          message: `${portList.length} ports read, ${named} with a name to match.`,
        },
  );
  const ethernet = ethernetNames(portList).length;
  checks.push(
    ethernet === 0
      ? {
          level: "warn",
          message:
            "No port reads as Ethernet with an ifIndex: a manual switch keeps its default port names.",
        }
      : {
          level: "ok",
          message: `${ethernet} Ethernet ports, whose names a manual switch would take.`,
        },
  );

  const raw = rawEntries(fdb);
  const entries = readLibreNMSFdb(fdb);
  // LibreNMS's port 0 is "no port": a MAC address it learnt on an interface
  // it does not list, such as a port channel. A cycle skips them, rightly.
  const noPort = raw.filter(({ port_id }) => Number(port_id) === 0).length;
  if (noPort > 0) {
    checks.push({
      level: "ok",
      message: `${noPort} forwarding entries on no port (port_id 0), which a cycle skips.`,
    });
  }
  const unreadable = raw.filter(
    (item) =>
      Number(item.port_id) !== 0 &&
      readLibreNMSFdb({ ports_fdb: [item] }).length === 0,
  );
  const example = unreadable.at(0);
  if (example) {
    checks.push({
      level: "fail",
      message: `${unreadable.length} of ${raw.length} forwarding entries unreadable, such as port_id ${shapeOf(example.port_id)}, mac_address ${shapeOf(example.mac_address, /[\da-f]/gi)}.`,
    });
  }
  if (entries.length === 0) {
    checks.push({ level: "warn", message: "The forwarding table is empty." });
    return checks;
  }
  checks.push({
    level: "ok",
    message: `${entries.length} forwarding entries read.`,
  });

  const known = new Set(portList.map(({ id }) => id));
  const onKnownPorts = entries.filter(({ portId }) => known.has(portId)).length;
  checks.push(
    onKnownPorts === entries.length
      ? { level: "ok", message: "Every entry is on a port read." }
      : {
          level: "warn",
          message: `${entries.length - onKnownPorts} entries on ports the port list does not have.`,
        },
  );

  const timed = entries.filter(({ updatedAt }) => updatedAt !== null).length;
  const shapes = [
    ...new Set(raw.map(({ updated_at }) => shapeOf(updated_at))),
  ].slice(0, 3);
  if (timed === 0) {
    checks.push({
      level: "warn",
      message: `No entry has a readable updated_at (${shapes.join(", ")}): every entry counts as seen, however old.`,
    });
    return checks;
  }
  checks.push(
    timed === entries.length
      ? {
          level: "ok",
          message: `Every updated_at reads (${shapes.join(", ")}).`,
        }
      : {
          level: "warn",
          message: `${entries.length - timed} entries without a readable updated_at are never seen (${shapes.join(", ")}).`,
        },
  );

  const { fresh, table } = freshFdb(entries, undefined, "finished");
  checks.push({
    level: fresh.length > 0 ? "ok" : "warn",
    message: `${fresh.length} of ${entries.length} entries are within ${minutes(FDB_FRESH_MS)} of the newest: a cycle counts them as seen if the discovery before it moved the newest entry, which --discover tells.`,
  });
  if (table && discoveredAt !== null) {
    const gap = discoveredAt - table.newest;
    checks.push(
      Math.abs(gap) <= FDB_FRESH_MS
        ? {
            level: "ok",
            message:
              "The newest entry dates from the last discovery, as it does when discoveries refresh the table.",
          }
        : {
            // A cycle compares entries with each other, never with this
            // date: the gap matters only if discoveries leave the table as
            // it was, which --discover tells.
            level: "warn",
            message: `The newest entry is ${minutes(Math.abs(gap))} ${gap > 0 ? "older" : "newer"} than the last discovery: either discoveries do not refresh the table, or the two dates come from different clocks or time zones. Run with --discover to tell.`,
          },
    );
  }
  return checks;
}

/** What one discovery changed, read before and after it. */
export function discoveryChecks({
  before,
  after,
}: {
  before: { device: unknown; fdb: unknown };
  after: { device: unknown; fdb: unknown } | null;
}): Array<Check> {
  if (!after) {
    return [
      {
        level: "fail",
        message:
          "The discovery did not finish in time: a cycle would note it and read the old table.",
      },
    ];
  }
  const checks: Array<Check> = [
    { level: "ok", message: "The discovery finished in time." },
  ];
  const was = newestEntry(before.fdb);
  const is = newestEntry(after.fdb);
  if (is === null) {
    checks.push(
      readLibreNMSFdb(after.fdb).length === 0
        ? { level: "warn", message: "The table is empty after it." }
        : {
            level: "warn",
            message:
              "Whether it refreshed the table cannot be told: no entry has a readable updated_at, so a cycle keeps every entry, however old.",
          },
    );
    return checks;
  }
  checks.push(
    was === null || is > was
      ? {
          level: "ok",
          message: `It refreshed the table: ${readLibreNMSFdb(after.fdb).length} entries, the newest moved.`,
        }
      : {
          level: "warn",
          message:
            "It refreshed no entry: a cycle would see nothing on this switch until one does.",
        },
  );
  return checks;
}
