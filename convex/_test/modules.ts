// Module map consumed by convex-test. `import.meta.glob` is Vite-only, so we
// list each public Convex module explicitly. Keep this in sync when adding a
// new file under `convex/`. The `_generated` placeholder is required so
// convex-test can locate its modules root via `findModulesRoot`.
export const modules: Record<string, () => Promise<unknown>> = {
  "./_generated/api.ts": () => import("../_generated/api.js"),
  "./buildings.ts": () => import("../buildings"),
  "./devices.ts": () => import("../devices"),
  "./floors.ts": () => import("../floors"),
  "./links.ts": () => import("../links"),
  "./schema.ts": () => import("../schema"),
  "./seed.ts": () => import("../seed"),
  "./walls.ts": () => import("../walls"),
};
