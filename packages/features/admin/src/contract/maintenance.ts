import { baseContract } from "@smog/rpc/contract";
import { maintenanceSetInputSchema, maintenanceSettingSchema } from "../schema";
import type { AdminProcedures } from "./audit-map";

/**
 * `admin.maintenance.*`: the maintenance setting (A-26, P-11, ruling 9).
 * The KV key `maintenance` is the one the site's gate and `bun run
 * maintenance` use (`maintenanceSettingSchema`).
 */
export const maintenanceSlice = {
  maintenance: {
    /**
     * The stored setting, read from KV with no cache (so the admin sees
     * their own write); off with the first version when nothing is stored.
     */
    get: baseContract.output(maintenanceSettingSchema),
    /**
     * Turns maintenance on (keeping `bypassVersion`) or off (a new
     * `bypassVersion`: every bypass cookie dies), writes KV, then the audit
     * entry (ruling 5: a failed entry is logged and rethrown). Asking for
     * the stored state changes nothing and writes no entry. The site's
     * isolates follow within about a minute (their 30 s cache plus KV
     * propagation). Answers the new setting.
     */
    set: baseContract
      .input(maintenanceSetInputSchema)
      .output(maintenanceSettingSchema),
  },
};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {
  "maintenance.get": "read",
  "maintenance.set": { audit: ["maintenance.enable", "maintenance.disable"] },
} as const satisfies AdminProcedures<typeof maintenanceSlice>;
