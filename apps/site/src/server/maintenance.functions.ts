import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import {
  BYPASS_COOKIE,
  type BypassStatus,
  bypassCookieStatus,
} from "../worker/maintenance";

/**
 * Whether this browser's `smog_mx` bypass cookie gets it past maintenance
 * now, and until when (the settings page's bypass card). The cookie is
 * HttpOnly, so only the server can read it; it is verified with the gate's
 * own check against a fresh KV read. It says nothing about anyone else.
 */
export const getMaintenanceBypassStatus = createServerFn().handler(
  async (): Promise<BypassStatus> => {
    try {
      return await bypassCookieStatus(getCookie(BYPASS_COOKIE));
    } catch (error) {
      console.error(
        "[maintenance] Failed to read the bypass cookie status:",
        error
      );
      throw error;
    }
  }
);
