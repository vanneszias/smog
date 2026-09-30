import type { ProcedureInputs } from "./index";

/**
 * A valid input for each `admin.audit` procedure (`undefined` for none), so
 * the auth test's calls pass input validation and reach the guard.
 */
export const AUDIT_INPUTS: ProcedureInputs = {
  "audit.actors": undefined,
  "audit.list": {},
};
