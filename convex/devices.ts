import { v } from "convex/values";
import { readerQuery } from "./lib/functions";
import { placedDevicesOf } from "./mapDocument";
import { placedDevice } from "./mapValidators";

export const listForFloor = readerQuery({
  args: { floorId: v.string() },
  returns: v.array(placedDevice),
  handler: async (ctx, { floorId }) => await placedDevicesOf(ctx, floorId),
});
