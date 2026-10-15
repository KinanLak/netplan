import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "delete unused calque files",
  { hourUTC: 3, minuteUTC: 17 },
  internal.floorOverlays.deleteReleasedFiles,
  {},
);

export default crons;
