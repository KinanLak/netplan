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

export default crons;
