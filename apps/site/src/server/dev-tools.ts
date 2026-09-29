import type { Environment } from "@smog/config/env/worker";

/** `/dev/*` routes exist everywhere except production. */
export function devToolsEnabled(environment: Environment): boolean {
  return environment !== "production";
}
