import { AUDIT_INPUTS } from "./audit";
import { CATEGORIES_INPUTS } from "./categories";
import { DASHBOARD_INPUTS } from "./dashboard";
import { EMAILS_INPUTS } from "./emails";
import { GESTURES_INPUTS } from "./gestures";
import { MAINTENANCE_INPUTS } from "./maintenance";
import { MUX_INPUTS } from "./mux";
import { USERS_INPUTS } from "./users";

/** Procedure path (relative to `admin`) → a valid input. */
export type ProcedureInputs = Record<string, unknown>;

/**
 * A valid input for every admin procedure, one file per area. The auth
 * test fails for a procedure that has none here.
 */
export const ADMIN_INPUTS: ProcedureInputs = {
  ...DASHBOARD_INPUTS,
  ...AUDIT_INPUTS,
  ...GESTURES_INPUTS,
  ...CATEGORIES_INPUTS,
  ...MUX_INPUTS,
  ...USERS_INPUTS,
  ...MAINTENANCE_INPUTS,
  ...EMAILS_INPUTS,
};
