import type { ProcedureInputs } from "./index";

/**
 * For each `admin.emails` procedure, a function from the fixtures to an
 * input the admin call succeeds with. Both are reads.
 */
export const EMAILS_INPUTS: ProcedureInputs = {
  "emails.list": () => undefined,
  "emails.preview": () => ({ locale: "en", template: "auth/otp" }),
};
