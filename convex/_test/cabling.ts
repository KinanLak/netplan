import type { MutationCtx } from "../_generated/server";
import { cableRow, portRow } from "../lib/ports";
import { defaultPorts } from "../../src/devices/ports";
import type { DeviceId } from "../../src/types/map";

/**
 * Gives two PCs their one interface each and a cable between them, as rows:
 * the devices themselves are the test's to insert.
 */
export const insertCabledPcs = async (
  ctx: MutationCtx,
  siteId: string,
  aId: string,
  bId: string,
) => {
  const [a] = defaultPorts(aId as DeviceId, "pc");
  const [b] = defaultPorts(bId as DeviceId, "pc");
  await ctx.db.insert("ports", portRow(siteId, a));
  await ctx.db.insert("ports", portRow(siteId, b));
  await ctx.db.insert(
    "cables",
    cableRow(
      siteId,
      {
        id: `cable:${aId}:${bId}`,
        a: { deviceId: aId, portId: a.id },
        b: { deviceId: bId, portId: b.id },
      },
      0,
      "test",
    ),
  );
};
