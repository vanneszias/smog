import { env } from "cloudflare:workers";
import { parseWorkerVars } from "@smog/config/env/worker";
import { createServerFn } from "@tanstack/react-start";
import { devToolsEnabled } from "./dev-tools";

/** Whether the `/dev/*` pages exist in this Worker's environment. */
export const getDevToolsEnabled = createServerFn().handler((): boolean => {
  try {
    return devToolsEnabled(parseWorkerVars(env).ENVIRONMENT);
  } catch (error) {
    console.error("[dev-tools] Failed to read worker vars:", error);
    throw error;
  }
});
