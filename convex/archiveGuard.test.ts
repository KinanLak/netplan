import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Writes that touch no site: the calque file is placed by a map operation,
// which is guarded.
const NO_SITE = new Set(["floorOverlays:upload"]);

// Every Éditeur write refuses an archived site (ADR 0033). A new one must
// call `requireOpenSite` or `requireOpenBuilding`, or be listed above.
describe("the archive guard", () => {
  it("is on every editor mutation and action", () => {
    const missing: Array<string> = [];
    const dir = import.meta.dir;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const source = readFileSync(join(dir, file), "utf8");
      const found = source.matchAll(
        /export const (\w+) = editor(?:Mutation|Action)\(\{/g,
      );
      for (const match of found) {
        const next = source.indexOf("\nexport const", match.index + 1);
        const body = source.slice(match.index, next === -1 ? undefined : next);
        const name = `${file.replace(/\.ts$/, "")}:${match[1]}`;
        const guarded =
          /requireOpen(Site|Building)\(|fromUser: true/.test(body) ||
          NO_SITE.has(name);
        if (!guarded) missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });
});
