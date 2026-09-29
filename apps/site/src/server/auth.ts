import { env, waitUntil } from "cloudflare:workers";
import { type Auth, type AuthEnv, createAuth, parseAuthEnv } from "@smog/auth";
import { parseWorkerVars, type WorkerVars } from "@smog/config/env/worker";
import { createDb } from "@smog/db/client";
import { createEmailSender, type EmailSender } from "@smog/email";

interface SiteEnv {
  auth: AuthEnv;
  db: D1Database;
  kv: KVNamespace;
  vars: WorkerVars;
}

let cached: SiteEnv | undefined;

function required<T>(binding: T | undefined, name: string): T {
  if (!binding) {
    throw new Error(`[site] Failed to start: the ${name} binding is missing`);
  }
  return binding;
}

/** Vars, secrets and bindings, validated once per isolate. */
export function siteEnv(): SiteEnv {
  cached ??= {
    auth: parseAuthEnv(env),
    db: required(env.DB, "DB"),
    kv: required(env.KV, "KV"),
    vars: parseWorkerVars(env),
  };
  return cached;
}

/** dev → the KV dev mailbox; staging/production → the `EMAIL` binding. */
function getEmailSender(): EmailSender {
  const { kv, vars } = siteEnv();
  return createEmailSender({
    binding: env.EMAIL,
    environment: vars.ENVIRONMENT,
    kv,
  });
}

let auth: Auth | undefined;

/**
 * The Better Auth instance, built once per isolate: its env, bindings and
 * `waitUntil` do not change between requests, and it keeps no per-request
 * state (sessions are read from D1 on every call).
 */
export function getAuth(): Auth {
  if (!auth) {
    const { auth: authEnv, db, vars } = siteEnv();
    auth = createAuth({
      baseURL: vars.SITE_URL,
      db: createDb(db),
      email: getEmailSender(),
      env: authEnv,
      waitUntil,
    });
  }
  return auth;
}
