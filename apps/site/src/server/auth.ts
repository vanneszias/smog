import { env, waitUntil } from "cloudflare:workers";
import { type Auth, type AuthEnv, createAuth, parseAuthEnv } from "@smog/auth";
import {
  parseWorkerEnv,
  parseWorkerVars,
  type WorkerEnv,
  type WorkerVars,
} from "@smog/config/env/worker";
import { createDb } from "@smog/db/client";
import {
  createEmailSender,
  DirectEmailOutbox,
  type EmailDeliveryEnv,
  type EmailOutbox,
  type EmailSender,
} from "@smog/email";
import { QueueEmailOutbox } from "@smog/jobs";
import {
  RATE_LIMIT_BINDINGS,
  type RateLimitBinding,
  type RateLimiter,
} from "@smog/rpc";

export interface SiteEnv {
  auth: AuthEnv;
  db: D1Database;
  kv: KVNamespace;
  rateLimits: Record<RateLimitBinding, RateLimiter>;
  vars: WorkerVars;
  /** Vars and secrets together (the rpc context's `env`). */
  worker: WorkerEnv;
}

let cached: SiteEnv | undefined;

function required<T>(binding: T | undefined, name: string): T {
  if (!binding) {
    throw new Error(`[site] Failed to start: the ${name} binding is missing`);
  }
  return binding;
}

function rateLimits(): Record<RateLimitBinding, RateLimiter> {
  return Object.fromEntries(
    RATE_LIMIT_BINDINGS.map((name) => [name, required(env[name], name)])
  ) as Record<RateLimitBinding, RateLimiter>;
}

/** Vars, secrets and bindings, validated once per isolate. */
export function siteEnv(): SiteEnv {
  cached ??= {
    auth: parseAuthEnv(env),
    db: required(env.DB, "DB"),
    kv: required(env.KV, "KV"),
    rateLimits: rateLimits(),
    vars: parseWorkerVars(env),
    worker: parseWorkerEnv(env),
  };
  return cached;
}

/**
 * dev → the KV dev mailbox; staging/production → the `EMAIL` binding.
 * The email consumer sends through it (and the outbox's fallback).
 */
export function getEmailSender(): EmailSender {
  const { kv, vars } = siteEnv();
  return createEmailSender({
    binding: env.EMAIL,
    environment: vars.ENVIRONMENT,
    kv,
  });
}

/** `From`, `Reply-To` and the site (the header logo) of every email. */
export function emailDeliveryEnv(): EmailDeliveryEnv {
  const { vars } = siteEnv();
  return {
    EMAIL_FROM: vars.EMAIL_FROM,
    EMAIL_REPLY_TO: vars.EMAIL_REPLY_TO,
    SITE_URL: vars.SITE_URL,
  };
}

/**
 * Where the site's emails go (phase 6 ruling 8): `EMAIL_QUEUE`, which the
 * email consumer (`worker/email-queue.ts`) renders and sends from. Every
 * env binds it; without it (a broken config) emails are rendered and sent
 * inline, as before the queue, and that is logged.
 */
function getEmailOutbox(): EmailOutbox {
  if (env.EMAIL_QUEUE) {
    return new QueueEmailOutbox(env.EMAIL_QUEUE);
  }
  console.warn(
    "[site] The EMAIL_QUEUE binding is missing: emails are sent inline (DirectEmailOutbox)"
  );
  return new DirectEmailOutbox(getEmailSender(), emailDeliveryEnv());
}

const instances: { open?: Auth; signInOnly?: Auth } = {};

/**
 * The Better Auth instance, built once per isolate: its env, bindings and
 * `waitUntil` do not change between requests, and it keeps no per-request
 * state (sessions are read from D1 on every call). `signInOnly` is the
 * second instance, for the admin sign-in routes during maintenance
 * (`createAuth({ signInOnly })`: nothing creates a user).
 */
export function getAuth({
  signInOnly = false,
}: {
  signInOnly?: boolean;
} = {}): Auth {
  const key = signInOnly ? "signInOnly" : "open";
  let auth = instances[key];
  if (!auth) {
    const { auth: authEnv, db, vars } = siteEnv();
    auth = createAuth({
      baseURL: vars.SITE_URL,
      db: createDb(db),
      env: authEnv,
      outbox: getEmailOutbox(),
      signInOnly,
      waitUntil,
    });
    instances[key] = auth;
  }
  return auth;
}
