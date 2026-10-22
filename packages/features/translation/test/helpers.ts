/**
 * Test helpers: real Better Auth sessions over the test D1 (a learner, a
 * translator, an admin), the translation router with its real guards, and
 * the audit and KV readers.
 */
import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { type Auth, createAuth } from "@smog/auth";
import type { User } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { DirectEmailOutbox, MemoryEmailSender } from "@smog/email";
import { I18N_VERSION_KEY, resetCatalogueCache } from "@smog/i18n/server";
import { makeRpcContext } from "@smog/rpc/testing";
import { createTranslationRouter } from "../src/server";

export const SITE_URL = "http://localhost:5173";
const PASSWORD = "correct horse battery";

export function testDb(): Db {
  return createDb(env.DB);
}

function testAuth(): Auth {
  return createAuth({
    baseURL: SITE_URL,
    db: testDb(),
    env: {
      BETTER_AUTH_SECRET: "translation-test-secret-at-least-32-chars",
      ENVIRONMENT: "dev",
      SITE_URL,
    },
    outbox: new DirectEmailOutbox(new MemoryEmailSender(), {
      EMAIL_FROM: "SMOG & Co <noreply@smog.vlaanderen>",
      EMAIL_REPLY_TO: "info@smog.vlaanderen",
      SITE_URL,
    }),
  });
}

export interface Authed {
  auth: Auth;
  cookie: string;
  user: User;
}

export type TestRole = "admin" | "translator" | "user";

/** A verified account holding `role` (no row for a plain learner), signed in through Better Auth. */
export async function signedUp(role: TestRole = "user"): Promise<Authed> {
  const auth = testAuth();
  const email = `${crypto.randomUUID()}@smog.test`;
  await auth.api.signUpEmail({
    body: { email, name: `Test ${role}`, password: PASSWORD },
  });
  await env.DB.prepare("UPDATE user SET email_verified = 1 WHERE email = ?")
    .bind(email)
    .run();
  const row = await testDb().query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });
  if (!row) {
    throw new Error("[test] Failed to sign up a user");
  }
  if (role !== "user") {
    await env.DB.prepare(
      "INSERT INTO user_role (user_id, role, granted_at) VALUES (?, ?, ?)"
    )
      .bind(row.id, role, Date.now())
      .run();
  }
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { auth, cookie, user: row };
}

export async function contextAs(as: Authed | null) {
  if (!as) {
    return makeRpcContext({ db: testDb(), env: {}, kv: env.KV });
  }
  const headers = new Headers({ cookie: as.cookie, origin: SITE_URL });
  return makeRpcContext({
    auth: as.auth,
    db: testDb(),
    env: {},
    kv: env.KV,
    request: new Request(`${SITE_URL}/api/rpc/translation`, {
      headers,
      method: "POST",
    }),
    session: await as.auth.api.getSession({ headers }),
  });
}

const router = createTranslationRouter();

type AnyProcedure = Parameters<typeof call>[0];

function procedureAt(path: string): AnyProcedure {
  let node: unknown = router;
  for (const key of path.split(".")) {
    node = (node as Record<string, unknown>)[key];
  }
  if (!node) {
    throw new Error(`[test] No translation procedure at ${path}`);
  }
  return node as AnyProcedure;
}

/** Calls `translation.<path>` as `as` (one request: the session is read now). */
export async function callAs<T = unknown>(
  as: Authed | null,
  path: string,
  input?: unknown
): Promise<T> {
  return (await call(procedureAt(path), input, {
    context: await contextAs(as),
    // As `/api/rpc` routes it: the guard reads the path.
    path: ["translation", ...path.split(".")],
  })) as T;
}

/** What a failed call threw: the oRPC error code (and its status). */
export async function failureOf(
  promise: Promise<unknown>
): Promise<{ code: string; data: unknown }> {
  try {
    await promise;
  } catch (error) {
    const { code, data } = error as { code?: string; data?: unknown };
    return { code: code ?? "UNKNOWN", data };
  }
  throw new Error("[test] The call did not fail");
}

export interface StoredAudit {
  action: string;
  actorId: string | null;
  data: unknown;
  targetId: string | null;
  targetType: string;
}

/** The newest audit row id so far: rows after it belong to the call under test. */
export async function auditMark(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT coalesce(max(rowid), 0) AS mark FROM audit_log"
  ).first<{ mark: number }>();
  return row?.mark ?? 0;
}

export async function auditRowsSince(mark: number): Promise<StoredAudit[]> {
  const { results } = await env.DB.prepare(
    "SELECT action, actor_id AS actorId, target_type AS targetType, target_id AS targetId, data FROM audit_log WHERE rowid > ? ORDER BY rowid"
  )
    .bind(mark)
    .all<Omit<StoredAudit, "data"> & { data: string }>();
  return results.map((row) => ({ ...row, data: JSON.parse(row.data) }));
}

/** The KV version of the runtime catalogue (a write bumps it). */
export async function i18nVersion(): Promise<string | null> {
  return await env.KV.get(I18N_VERSION_KEY);
}

/** Forgets the isolate's catalogue cache and removes the stored strings and added languages between tests. */
export async function resetTranslationData(): Promise<void> {
  resetCatalogueCache();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ui_string"),
    env.DB.prepare(
      "DELETE FROM language WHERE code NOT IN ('nl', 'en', 'fr')"
    ),
    env.DB.prepare(
      "UPDATE language SET enabled = 1 WHERE code IN ('nl', 'en', 'fr')"
    ),
  ]);
}

/** Adds an enabled language through the admin procedure. */
export async function addLanguage(
  admin: Authed,
  code: string,
  name: string,
  intlTag: string
): Promise<void> {
  await callAs(admin, "languages.create", { code, intlTag, name });
}
