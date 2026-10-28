import type { ProcedureInputs } from "./index";

/**
 * For each `admin.maintenance` procedure, a function from the fixtures to an
 * input the admin call succeeds with (a mutation then proves it built its
 * audit entry). The auth test's KV starts empty (off), so enabling is a
 * real change and writes `maintenance.enable`.
 */
export const MAINTENANCE_INPUTS: ProcedureInputs = {
  "maintenance.get": () => undefined,
  "maintenance.set": () => ({ enabled: true }),
};
