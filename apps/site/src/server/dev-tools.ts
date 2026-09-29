import type { Environment } from "@smog/config/env/worker";

/**
 * `/dev/*` routes exist in `dev` only. This fails closed: the mailbox holds
 * sign-in links and codes, and staging sends real email anyway.
 */
export function devToolsEnabled(environment: Environment): boolean {
  return environment === "dev";
}

/**
 * The OpenAPI spec and reference UI (`/api/openapi/*`) exist in dev and
 * staging (spec §7), never in production. Separate from `devToolsEnabled`,
 * which is dev only.
 */
export function apiDocsEnabled(environment: Environment): boolean {
  return environment !== "production";
}
