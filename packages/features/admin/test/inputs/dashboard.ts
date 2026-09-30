import type { ProcedureInputs } from "./index";

/**
 * A valid input for each `admin.dashboard` procedure (`undefined` for none), so
 * the auth test's calls pass input validation and reach the guard.
 */
export const DASHBOARD_INPUTS: ProcedureInputs = {
  dashboard: undefined,
};
