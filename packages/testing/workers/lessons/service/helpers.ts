/**
 * Test helpers: real Better Auth sessions over the test D1 (a learner, a
 * teacher, a translator, an admin), the teacher router with its real guards
 * and the audit readers.
 */
import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { type Auth, createAuth } from "@smog/auth";
import type { User } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { DirectEmailOutbox, MemoryEmailSender } from "@smog/email";
import {
  createLessonsRouter,
  createTeacherRouter,
} from "../../../../features/lessons/src/server/index";
import { makeRpcContext } from "../../../support/rpc/fixtures";

const SITE_URL = "http://localhost:5173";
export const TEST_SECRET = "lessons-test-secret-at-least-32-characters";
const PASSWORD = "correct horse battery";

export function testDb(): Db {
  return createDb(env.DB);
}

function testAuth(): Auth {
  return createAuth({
    baseURL: SITE_URL,
    db: testDb(),
    env: {
      BETTER_AUTH_SECRET: TEST_SECRET,
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

export type TestRole = "admin" | "teacher" | "translator" | "user";

/** A verified account holding `roles` (none for a plain learner), signed in through Better Auth. */
export async function signedUp(
  ...roles: readonly Exclude<TestRole, "user">[]
): Promise<Authed> {
  const auth = testAuth();
  const email = `${crypto.randomUUID()}@example.test`;
  await auth.api.signUpEmail({
    body: {
      email,
      name: `Test ${roles.join("+") || "user"}`,
      password: PASSWORD,
    },
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
  await Promise.all(
    roles.map((role) =>
      env.DB.prepare(
        "INSERT INTO user_role (user_id, role, granted_at) VALUES (?, ?, ?)"
      )
        .bind(row.id, role, Date.now())
        .run()
    )
  );
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

/** The request context of `as`; `db` swaps the database (a recording one for the plan tests). */
export async function contextAs(as: Authed | null, db: Db = testDb()) {
  const rpcEnv = {
    BETTER_AUTH_SECRET: TEST_SECRET,
    MEDIA: env.MEDIA,
    SITE_URL,
  };
  if (!as) {
    return makeRpcContext({ db, env: rpcEnv, kv: env.KV });
  }
  const headers = new Headers({ cookie: as.cookie, origin: SITE_URL });
  return makeRpcContext({
    auth: as.auth,
    db,
    env: rpcEnv,
    kv: env.KV,
    request: new Request(`${SITE_URL}/api/rpc/teacher`, {
      headers,
      method: "POST",
    }),
    session: await as.auth.api.getSession({ headers }),
  });
}

const router = createTeacherRouter();

type AnyProcedure = Parameters<typeof call>[0];

function procedureAt(path: string): AnyProcedure {
  const node = (router as unknown as Record<string, unknown>)[path];
  if (!node) {
    throw new Error(`[test] No teacher procedure at ${path}`);
  }
  return node as AnyProcedure;
}

/** Calls `teacher.<path>` as `as` (one request: the session is read now). */
export async function callAs<T = unknown>(
  as: Authed | null,
  path: string,
  input?: unknown
): Promise<T> {
  return (await call(procedureAt(path), input, {
    context: await contextAs(as),
    // As `/api/rpc` routes it: the guard reads the path.
    path: ["teacher", path],
  })) as T;
}

const lessonsRouter = createLessonsRouter();

/** Calls `lessons.<path>` as `as` (one request: the session is read now). */
export async function lessonsAs<T = unknown>(
  as: Authed | null,
  path: string,
  input?: unknown
): Promise<T> {
  const node = (lessonsRouter as unknown as Record<string, unknown>)[path];
  if (!node) {
    throw new Error(`[test] No lessons procedure at ${path}`);
  }
  return (await call(node as AnyProcedure, input, {
    context: await contextAs(as),
    path: ["lessons", path],
  })) as T;
}

/** What a failed call threw: the oRPC error code (and its data). */
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

/** Inserts a gesture (named `name`) and returns its id. */
export async function addGesture(
  name: string,
  { published = false }: { published?: boolean } = {}
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO gesture (id, slug, name, sort_name, playback_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pb', ?, 1, 1)"
  )
    .bind(
      id,
      `${name.toLowerCase()}-${id.slice(0, 6)}`,
      name,
      name.toLowerCase(),
      published ? 1 : null
    )
    .run();
  return id;
}

/** Removes every teaching row between tests (the gestures cascade). */
export async function resetTeacherData(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM lesson"),
    env.DB.prepare("DELETE FROM gesture_teacher_info"),
    env.DB.prepare("DELETE FROM gesture"),
  ]);
}
