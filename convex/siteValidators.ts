import { v } from "convex/values";

/** `SiteCadence` from `src/sites/settings.ts`. */
export const siteCadence = v.object({
  businessIntervalMinutes: v.number(),
  otherIntervalMinutes: v.number(),
  businessStartMinute: v.number(),
  businessEndMinute: v.number(),
  businessDays: v.array(v.number()),
});
