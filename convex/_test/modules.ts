// Module map consumed by convex-test. `import.meta.glob` is Vite-only, so we
// list each public Convex module explicitly. Keep this in sync when adding a
// new file under `convex/`. The `_generated` placeholder is required so
// convex-test can locate its modules root via `findModulesRoot`.
export const modules: Record<string, () => Promise<Record<string, any>>> = {
  "./_generated/api.ts": () => import("../_generated/api.js"),
  "./auth.ts": () => import("../auth"),
  "./bootstrap.ts": () => import("../bootstrap"),
  "./buildings.ts": () => import("../buildings"),
  "./dev.ts": () => import("../dev"),
  "./devices.ts": () => import("../devices"),
  "./floorOverlays.ts": () => import("../floorOverlays"),
  "./floors.ts": () => import("../floors"),
  "./http.ts": () => import("../http"),
  "./links.ts": () => import("../links"),
  "./mail.ts": () => import("../mail"),
  "./mapDocument.ts": () => import("../mapDocument"),
  "./mapOperations.ts": () => import("../mapOperations"),
  "./mapValidators.ts": () => import("../mapValidators"),
  "./presences.ts": () => import("../presences"),
  "./schema.ts": () => import("../schema"),
  "./sites.ts": () => import("../sites"),
  "./users.ts": () => import("../users"),
  "./walls.ts": () => import("../walls"),
};
