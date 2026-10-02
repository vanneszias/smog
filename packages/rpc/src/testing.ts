import type { Auth, Role, SessionWithUser } from "@smog/auth";
import type { Db } from "@smog/db/client";
import type { RateLimiter, RpcContext, RpcEnv } from "./context";

const allow: RateLimiter = {
  limit: () => Promise.resolve({ success: true }),
};

const ENV: RpcEnv = {
  BETTER_AUTH_SECRET: "rpc-test-secret-at-least-32-characters",
  EMAIL_FROM: "SMOG & Co <noreply@smog.vlaanderen>",
  EMAIL_REPLY_TO: "info@smog.vlaanderen",
  ENVIRONMENT: "dev",
  MUX_API_URL: "https://api.mux.com",
  OPENPANEL_API_URL: "https://analytics.zias.be/api",
  RENDER_MODE: "fake",
  RL_ANALYTICS: allow,
  RL_API: allow,
  RL_AUTH: allow,
  RL_SPONSOR: allow,
  SITE_URL: "http://localhost:5173",
};

type ContextOverrides = Partial<Omit<RpcContext, "env">> & {
  env?: Partial<RpcEnv>;
};

/**
 * An rpc context for tests; `db`, `auth` and `kv` are stubs unless
 * overridden (pass the test Worker's `env.DB` / `env.KV` for real ones).
 */
export function makeRpcContext(overrides: ContextOverrides = {}): RpcContext {
  const { env, ...rest } = overrides;
  return {
    auth: {} as Auth,
    db: {} as Db,
    env: { ...ENV, ...env },
    ip: "192.0.2.1",
    kv: {} as KVNamespace,
    locale: "nl",
    request: new Request("http://localhost:5173/api/rpc/test"),
    session: null,
    waitUntil: () => undefined,
    ...rest,
  };
}

/** A session with only the fields the middleware reads. */
export function makeSession(role: Role): SessionWithUser {
  return {
    session: { id: "session-1", userId: "user-1" },
    user: {
      email: "a@smog.test",
      id: "user-1",
      image: null,
      name: "A",
      role,
    },
  } as SessionWithUser;
}
