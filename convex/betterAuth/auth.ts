// Static instance read only by `auth generate` to write ./schema.ts. Never
// import it at runtime: it builds better-auth without a Convex context.
import { createAuth } from "../auth";

// oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-argument
export const auth = createAuth({} as any);
