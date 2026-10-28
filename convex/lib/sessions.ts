import { components } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";

/**
 * Ends every session of a user and answers how many there were. Every
 * Convex function checks the session, so the user's open pages are sent to
 * the sign-in page at their next call.
 */
export async function endSessions(
  ctx: MutationCtx | ActionCtx,
  userId: string,
): Promise<number> {
  let ended = 0;
  // deleteMany removes one page per call.
  let cursor: string | null = null;
  for (;;) {
    const page: { isDone: boolean; continueCursor: string; count?: number } =
      await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
        input: {
          model: "session",
          where: [{ field: "userId", value: userId }],
        },
        paginationOpts: { numItems: 200, cursor },
      });
    ended += page.count ?? 0;
    if (page.isDone) return ended;
    cursor = page.continueCursor;
  }
}
