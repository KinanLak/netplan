import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "scan integration schedules",
  { minutes: 1 },
  internal.integrationOrchestration.scanDue,
  {},
);

crons.interval(
  "reconcile computer map projections",
  { minutes: 1 },
  internal.computerProjection.sweep,
  {},
);

crons.daily(
  "delete unused calque files",
  { hourUTC: 3, minuteUTC: 17 },
  internal.floorOverlays.deleteReleasedFiles,
  {},
);

export default crons;
