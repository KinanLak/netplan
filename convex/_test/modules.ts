// Module map consumed by convex-test. `import.meta.glob` is Vite-only, so we
// list each public Convex module explicitly. Keep this in sync when adding a
// new file under `convex/`. The `_generated` placeholder is required so
// convex-test can locate its modules root via `findModulesRoot`.
// Node actions (`"use node"`) stay out: Convex bundles this file for its own
// runtime, which cannot resolve their Node imports. A test that runs one adds
// it to `testBackend`.
export const modules: Record<string, () => Promise<Record<string, any>>> = {
  "./_generated/api.ts": () => import("../_generated/api.js"),
  "./auth.ts": () => import("../auth"),
  "./authSettings.ts": () => import("../authSettings"),
  "./bootstrap.ts": () => import("../bootstrap"),
  "./buildings.ts": () => import("../buildings"),
  "./cables.ts": () => import("../cables"),
  "./collection.ts": () => import("../collection"),
  "./dev.ts": () => import("../dev"),
  "./devices.ts": () => import("../devices"),
  "./floorOverlays.ts": () => import("../floorOverlays"),
  "./floors.ts": () => import("../floors"),
  "./http.ts": () => import("../http"),
  "./importReviews.ts": () => import("../importReviews"),
  "./integrations.ts": () => import("../integrations"),
  "./librenms.ts": () => import("../librenms"),
  "./librenmsCycle.ts": () => import("../librenmsCycle"),
  "./mapDocument.ts": () => import("../mapDocument"),
  "./mapOperations.ts": () => import("../mapOperations"),
  "./mapValidators.ts": () => import("../mapValidators"),
  "./netbox.ts": () => import("../netbox"),
  "./netboxImport.ts": () => import("../netboxImport"),
  "./presences.ts": () => import("../presences"),
  "./schema.ts": () => import("../schema"),
  "./sites.ts": () => import("../sites"),
  "./users.ts": () => import("../users"),
  "./walls.ts": () => import("../walls"),
};
