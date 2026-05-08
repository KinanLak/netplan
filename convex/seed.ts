import { internalMutation } from "./_generated/server";

export const seedDefault = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("buildings").first();
    if (existing !== null) return;

    const buildingId = await ctx.db.insert("buildings", {
      name: "Bâtiment Principal",
      order: 0,
    });

    await ctx.db.insert("floors", {
      buildingId,
      name: "RDC",
      order: 0,
    });
    await ctx.db.insert("floors", {
      buildingId,
      name: "Étage 1",
      order: 1,
    });
  },
});
