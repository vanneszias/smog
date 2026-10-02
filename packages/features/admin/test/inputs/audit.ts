import type { ProcedureInputs } from "./index";

/**
 * For each `admin.audit` procedure, a function from the fixtures to an
 * input the admin call succeeds with (a mutation then proves it built its
 * audit entry).
 */
export const AUDIT_INPUTS: ProcedureInputs = {
  "audit.actors": () => undefined,
  "audit.list": () => ({}),
};
