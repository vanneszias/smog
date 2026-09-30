import { baseContract } from "@smog/rpc/contract";
import {
  auditActorsSchema,
  auditListInputSchema,
  auditPageSchema,
} from "../schema";
import type { AdminProcedures } from "./audit-map";

/** `admin.audit.*` (A-24): the audit log viewer. */
export const auditSlice = {
  audit: {
    /** The accounts with audit entries (id and name), for the actor filter. */
    actors: baseContract.output(auditActorsSchema),
    /**
     * Entries newest first, a keyset page (`created_at, id`) at a time,
     * filtered by action, target, actor and a time range. `data` is parsed
     * with its action's schema when it has one.
     */
    list: baseContract.input(auditListInputSchema).output(auditPageSchema),
  },
};

export const ADMIN_PROCEDURES = {
  "audit.actors": "read",
  "audit.list": "read",
} as const satisfies AdminProcedures<typeof auditSlice>;
