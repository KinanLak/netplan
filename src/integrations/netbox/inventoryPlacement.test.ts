import { describe, expect, it } from "bun:test";
import { rectanglesOverlap } from "@/lib/geometry";
import { layoutInventoryGrid } from "@/integrations/netbox/inventoryPlacement";

describe("NetBox bulk placement", () => {
  it("centers a compact grid without overlaps", () => {
    const result = layoutInventoryGrid({
      items: Array.from({ length: 12 }, (_, index) => ({
        id: `device:${index}`,
        size: { width: 80, height: 80 },
      })),
      center: { x: 500, y: 400 },
      isBlocked: () => false,
    });
    expect(result).toHaveLength(12);
    for (const item of result) {
      for (const other of result) {
        if (item.id === other.id) continue;
        expect(
          rectanglesOverlap(
            item.position,
            item.size,
            other.position,
            other.size,
          ),
        ).toBe(false);
      }
    }
  });

  it("skips blocked grid slots", () => {
    const result = layoutInventoryGrid({
      items: [{ id: "device:1", size: { width: 80, height: 80 } }],
      center: { x: 0, y: 0 },
      isBlocked: (_, position) => position.x < 100,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.position.x).toBeGreaterThanOrEqual(100);
  });

  it("returns no partial layout when an item cannot be placed", () => {
    const result = layoutInventoryGrid({
      items: [{ id: "device:1", size: { width: 80, height: 80 } }],
      center: { x: 0, y: 0 },
      isBlocked: () => true,
    });

    expect(result).toEqual([]);
  });
});
