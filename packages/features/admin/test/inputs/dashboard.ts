import type { ProcedureInputs } from "./index";

/**
 * For each `admin.dashboard` procedure, a function from the fixtures to an
 * input the admin call succeeds with (a mutation then proves it built its
 * audit entry).
 */
export const DASHBOARD_INPUTS: ProcedureInputs = {
  dashboard: () => undefined,
};
