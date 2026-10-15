// Static instance read only by the better-auth CLI to write ./schema.ts
// (`bunx auth@<better-auth version> generate`; not a dependency, its lodash
// carries a high advisory). Never import it at runtime: it builds better-auth
// without a Convex context.
import { createAuth } from "../auth";

// oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-argument
export const auth = createAuth({} as any);
