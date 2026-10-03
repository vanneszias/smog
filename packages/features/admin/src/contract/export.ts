import { baseContract } from "@smog/rpc/contract";
import {
  sponsorshipInvalidStateDataSchema,
  sponsorshipsCsvInputSchema,
  sponsorshipsCsvSchema,
} from "../schema";
import type { AdminProcedures } from "./audit-map";

/** `INVALID_STATE tooMany`: more than 50,000 rows; narrow the date range. */
const EXPORT_ERRORS = {
  INVALID_STATE: { data: sponsorshipInvalidStateDataSchema, status: 409 },
} as const;

/**
 * `admin.export.*`: the CSV export (A-09, ruling 14). Admin only and
 * audited (`export.sponsorships_csv` with the filters and the row count).
 */
export const exportSlice = {
  export: {
    /**
     * The sponsorships as CSV: the 18 columns in the old order, every field
     * quoted, cells that a spreadsheet would read as a formula prefixed
     * with `'`. Filtered by status and creation date (epoch ms,
     * inclusive), oldest first, read in keyset pages of 500 with no 10,000
     * row cap (bug 11); over 50,000 rows is `INVALID_STATE tooMany`.
     */
    sponsorshipsCsv: baseContract
      .errors(EXPORT_ERRORS)
      .input(sponsorshipsCsvInputSchema)
      .output(sponsorshipsCsvSchema),
  },
};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {
  "export.sponsorshipsCsv": { audit: "export.sponsorships_csv" },
} as const satisfies AdminProcedures<typeof exportSlice>;
