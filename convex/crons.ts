import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Each site's cadence decides whether its cycle is due (ADR 0023).
crons.interval(
  "start due collection cycles",
  { minutes: 1 },
  internal.collection.startDue,
  {},
);

crons.daily(
  "delete unused calque files",
  { hourUTC: 3, minuteUTC: 17 },
  internal.floorOverlays.deleteReleasedFiles,
  {},
);

export default crons;
