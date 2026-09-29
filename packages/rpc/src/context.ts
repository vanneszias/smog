import type { Auth, SessionWithUser } from "@smog/auth";
import type { Locale } from "@smog/config/constants";
import type { WorkerEnv } from "@smog/config/env/worker";
import type { Db } from "@smog/db/client";

/** The Workers Rate Limiting API (`ratelimits` binding in wrangler). */
export interface RateLimiter {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
}

/** The rate-limit bindings of the site Worker (spec §7). */
export const RATE_LIMIT_BINDINGS = [
  "RL_API",
  "RL_SPONSOR",
  "RL_AUTH",
  "RL_ANALYTICS",
] as const;

export type RateLimitBinding = (typeof RATE_LIMIT_BINDINGS)[number];

/** Validated vars and secrets plus the bindings the middleware uses. */
export type RpcEnv = WorkerEnv & Record<RateLimitBinding, RateLimiter>;

/** The per-request context every procedure receives (built once per request). */
export interface RpcContext {
  auth: Auth;
  db: Db;
  env: RpcEnv;
  /** `cf-connecting-ip` (`unknown` when absent, e.g. in tests). */
  ip: string;
  /** The `KV` binding: cache version keys and small settings. */
  kv: KVNamespace;
  locale: Locale;
  request: Request;
  session: SessionWithUser | null;
  waitUntil: (promise: Promise<unknown>) => void;
}
