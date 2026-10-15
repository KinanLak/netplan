import { v } from "convex/values";
import { readerQuery } from "./lib/functions";

/** The signed-in user, as the app shows them. */
export const me = readerQuery({
  args: {},
  returns: v.object({ id: v.string(), name: v.string(), role: v.string() }),
  handler: (ctx) =>
    Promise.resolve({
      id: ctx.user.id,
      name: ctx.user.name,
      role: ctx.user.role,
    }),
});
