import { LOCALES } from "@smog/config/constants";
import { EMAIL_TEMPLATE_IDS } from "@smog/email/samples";
import { baseContract } from "@smog/rpc/contract";
import { z } from "zod";
import { emailPreviewSchema, emailTemplateSummarySchema } from "../schema";
import type { AdminProcedures } from "./audit-map";

/**
 * `admin.emails.*`: the email previews (A-25, W-07). Each renders the real
 * templates (`renderEmail`) with `EMAIL_SAMPLES`; nothing is sent. A
 * template registered with a sample appears here on its own.
 */
export const emailsSlice = {
  emails: {
    /** Every registered template with its sample subject in nl, en and fr. */
    list: baseContract.output(z.array(emailTemplateSummarySchema)),
    /**
     * One template rendered from its sample in `locale`: subject, HTML and
     * plain text. An unknown template or locale is `VALIDATION`.
     */
    preview: baseContract
      .input(
        z.object({
          locale: z.enum(LOCALES),
          template: z.enum(EMAIL_TEMPLATE_IDS),
        })
      )
      .output(emailPreviewSchema),
  },
};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {
  "emails.list": "read",
  "emails.preview": "read",
} as const satisfies AdminProcedures<typeof emailsSlice>;
