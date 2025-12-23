import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Clean up inactive guest accounts monthly
crons.monthly(
  "cleanup-inactive-guests",
  { day: 1, hourUTC: 2, minuteUTC: 0 },
  internal.gdprCron.cleanupInactiveGuests
);

// Clean up old admin logs on the 1st of every January (simulating yearly)
crons.monthly(
  "cleanup-old-admin-logs",
  { day: 1, hourUTC: 3, minuteUTC: 0 },
  internal.gdprCron.cleanupOldAdminLogs
);

export default crons;
