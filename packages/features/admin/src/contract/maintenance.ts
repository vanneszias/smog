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
     * The stored setting, read from KV past any isolate cache with KV's
     * shortest edge cache (30 s; KV is eventually consistent, so a change
     * made elsewhere may take up to about a minute more to show); off with
     * the first version when nothing is stored.
     */
    get: baseContract.output(maintenanceSettingSchema),
    /**
     * Turns maintenance on (keeping `bypassVersion`) or off (a new
     * `bypassVersion`: every bypass cookie dies), writes KV, then the audit
     * entry (ruling 5: a failed entry is logged, the previous KV value is
     * put back, and the error rethrown). Asking for the stored state
     * changes nothing and writes no entry (the kind's `noop`). Visitors
     * follow within about 2 minutes (the gate's 30 s isolate cache, KV's
     * 30 s edge cache and up to a minute of KV propagation). Answers the
     * new setting.
     */
    set: baseContract
      .input(maintenanceSetInputSchema)
      .output(maintenanceSettingSchema),
  },
};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {
  "maintenance.get": "read",
  "maintenance.set": {
    audit: ["maintenance.enable", "maintenance.disable"],
    noop: "asking for the stored state changes nothing",
  },
} as const satisfies AdminProcedures<typeof maintenanceSlice>;
