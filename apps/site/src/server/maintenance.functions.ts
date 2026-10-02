import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { type BypassStatus, bypassStatusFor } from "../worker/maintenance";

/**
 * Whether this browser's `smog_mx` bypass cookie gets it past maintenance
 * now, and until when (the settings page's bypass card). The cookie is
 * HttpOnly, so only the server can read it. Admins only: anyone else gets
 * `{ active: false }` (`bypassStatusFor`).
 */
export const getMaintenanceBypassStatus = createServerFn().handler(
  async (): Promise<BypassStatus> => {
    try {
      return await bypassStatusFor(getRequest());
    } catch (error) {
      console.error(
        "[maintenance] Failed to read the bypass cookie status:",
        error
      );
      throw error;
    }
  }
);
