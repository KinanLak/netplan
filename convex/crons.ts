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

// History is kept 30 days (ADR 0027).
crons.daily(
  "purge history older than 30 days",
  { hourUTC: 3, minuteUTC: 41 },
  internal.history.purge,
  {},
);

// A device absent from NetBox goes after 30 days off the plan (ADR 0034).
crons.daily(
  "purge devices absent from NetBox",
  { hourUTC: 3, minuteUTC: 53 },
  internal.netboxImport.purgeAbsent,
  {},
);

crons.hourly(
  "purge ended sign-in windows",
  { minuteUTC: 23 },
  internal.signInAttempts.purge,
  {},
);

export default crons;
