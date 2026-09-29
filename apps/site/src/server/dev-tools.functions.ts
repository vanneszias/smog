import { env } from "cloudflare:workers";
import { parseWorkerVars } from "@smog/config/env/worker";
import { createServerFn } from "@tanstack/react-start";
import { devUiEnabled } from "./dev-tools";

/** Whether `/dev/ui` exists in this Worker's environment (dev and staging). */
export const getDevUiEnabled = createServerFn().handler((): boolean => {
  try {
    return devUiEnabled(parseWorkerVars(env).ENVIRONMENT);
  } catch (error) {
    console.error("[dev-tools] Failed to read worker vars:", error);
    throw error;
  }
});
