// Module map consumed by convex-test. `import.meta.glob` is Vite-only, so we
// list each public Convex module explicitly. Keep this in sync when adding a
// new file under `convex/`. The `_generated` placeholder is required so
// convex-test can locate its modules root via `findModulesRoot`.
export const modules: Record<string, () => Promise<Record<string, any>>> = {
  "./_generated/api.ts": () => import("../_generated/api.js"),
  "./buildings.ts": () => import("../buildings"),
  "./connector.ts": () => import("../connector"),
  "./devices.ts": () => import("../devices"),
  "./floors.ts": () => import("../floors"),
  "./librenms.ts": () => import("../librenms"),
  "./librenmsModel.ts": () => import("../librenmsModel"),
  "./links.ts": () => import("../links"),
  "./mapDocument.ts": () => import("../mapDocument"),
  "./mapOperations.ts": () => import("../mapOperations"),
  "./mapValidators.ts": () => import("../mapValidators"),
  "./netbox.ts": () => import("../netbox"),
  "./netboxModel.ts": () => import("../netboxModel"),
  "./presences.ts": () => import("../presences"),
  "./schema.ts": () => import("../schema"),
  "./topology.ts": () => import("../topology"),
  "./walls.ts": () => import("../walls"),
};
