import { env } from "cloudflare:workers";
import { type Auth, type AuthEnv, createAuth, parseAuthEnv } from "@smog/auth";
import {
  parseWorkerBindings,
  parseWorkerEnv,
  parseWorkerVars,
  type WorkerEnv,
  type WorkerVars,
} from "@smog/config/env/worker";
import { createDb } from "@smog/db/client";
import {
  createEmailSender,
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

/** The queue and R2 bindings, validated (`parseWorkerBindings`). */
export type SiteBindings = ReturnType<typeof parseWorkerBindings<Env>>;

export interface SiteEnv {
  auth: AuthEnv;
  /** `EMAIL_QUEUE`, `EVENTS_QUEUE` and `MEDIA` (fix wave, jobs M-4). */
  bindings: SiteBindings;
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
    bindings: parseWorkerBindings(env),
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
 * env binds it, and `siteEnv()` refuses to start without it.
 */
function getEmailOutbox(): EmailOutbox {
  return new QueueEmailOutbox(siteEnv().bindings.EMAIL_QUEUE);
}

const instances: { open?: Auth; signInOnly?: Auth } = {};

/**
 * The Better Auth instance, built once per isolate: its env, bindings and
 * outbox do not change between requests, and it keeps no per-request
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
    });
    instances[key] = auth;
  }
  return auth;
}
