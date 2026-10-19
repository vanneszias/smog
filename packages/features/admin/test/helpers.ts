/**
 * Shared test helpers for every admin area: real Better Auth sessions over
 * the test D1, the admin router with its real deps, procedure lookup by
 * path, and `expectAudit`. Areas add their own fixtures in their own test
 * files (or a `test/<area>-helpers.ts`), not here.
 */
import { env } from "cloudflare:workers";
import { isContractProcedure } from "@orpc/contract";
import { call } from "@orpc/server";
import { type Auth, createAuth } from "@smog/auth";
import type { Category, Gesture, Role, User } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { makeCategory, makeGesture, makeUser } from "@smog/db/testing";
import { DirectEmailOutbox, MemoryEmailSender } from "@smog/email";
import { makeRpcContext } from "@smog/rpc/testing";
import { expect } from "vitest";
import { ADMIN_PROCEDURE_KINDS, adminContract } from "../src/contract";
import { auditDataSchema, type WritableAuditAction } from "../src/schema";
import { createAdminRouter } from "../src/server";
import { adminDeps } from "./deps";
import { TEST_MUX_ENV } from "./mux-fake";
import { RECORDING_QUEUES, TEST_MOLLIE_ENV } from "./sponsorship-fakes";

export const SITE_URL = "http://localhost:5173";

/**
 * The rpc env: the Mux and Mollie fakes' URLs and credentials, and queues
 * that record what was enqueued.
 */
const TEST_ENV = { ...TEST_MUX_ENV, ...TEST_MOLLIE_ENV, ...RECORDING_QUEUES };
const PASSWORD = "correct horse battery";

export function testDb(): Db {
  return createDb(env.DB);
}

/** A Better Auth instance over the test D1, configured as the site's (dev). */
function testAuth(): Auth {
  return createAuth({
    baseURL: SITE_URL,
    db: testDb(),
    env: {
      BETTER_AUTH_SECRET: "admin-test-secret-at-least-32-characters",
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
  /** The session cookie header (`name=value; …`). */
  cookie: string;
  user: User;
}

/**
 * A verified account with a password and the given role, signed in through
 * Better Auth (a real session row and a signed cookie). The role is read
 * from D1 on every request, as in production.
 */
export async function signedUp(
  role: Role = "user",
  name = role === "admin" ? "Ada Admin" : "Uma User"
): Promise<Authed> {
  const auth = testAuth();
  const email = `${crypto.randomUUID()}@smog.test`;
  await auth.api.signUpEmail({ body: { email, name, password: PASSWORD } });
  await env.DB.prepare(
    "UPDATE user SET email_verified = 1, role = ? WHERE email = ?"
  )
    .bind(role, email)
    .run();
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const row = await testDb().query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });
  if (!row) {
    throw new Error("[test] Failed to sign up a user");
  }
  return { auth, cookie, user: row };
}

/**
 * The rpc context of one request by `as` (a guest when `null`): the session
 * is read from D1 now, as `loadSession` does per request, with the test D1
 * and KV.
 */
export async function contextAs(as: Authed | null) {
  if (!as) {
    return makeRpcContext({ db: testDb(), env: TEST_ENV, kv: env.KV });
  }
  const headers = new Headers({ cookie: as.cookie, origin: SITE_URL });
  return makeRpcContext({
    auth: as.auth,
    db: testDb(),
    // The Mux and Mollie fakes (`test/mux-fake.ts`,
    // `test/sponsorship-fakes.ts`); `test/deps.ts` injects their fetches.
    env: TEST_ENV,
    kv: env.KV,
    request: new Request(`${SITE_URL}/api/rpc/admin`, {
      headers,
      method: "POST",
    }),
    session: await as.auth.api.getSession({ headers }),
  });
}

const adminRouter = createAdminRouter(adminDeps);

/** Every procedure path of the admin contract (`"audit.list"`, …), sorted. */
export function adminProcedurePaths(
  node: unknown = adminContract,
  path: string[] = []
): string[] {
  if (isContractProcedure(node)) {
    return [path.join(".")];
  }
  return Object.entries(node as Record<string, unknown>)
    .flatMap(([key, child]) => adminProcedurePaths(child, [...path, key]))
    .sort();
}

type AnyProcedure = Parameters<typeof call>[0];

/** The admin router's procedure at `path` (relative to `admin`). */
export function procedureAt(path: string): AnyProcedure {
  let node: unknown = adminRouter;
  for (const key of path.split(".")) {
    node = (node as Record<string, unknown>)[key];
  }
  if (!node) {
    throw new Error(`[test] No admin procedure at ${path}`);
  }
  return node as AnyProcedure;
}

/** Calls `admin.<path>` as `as` (one request: the session is read now). */
export async function callAs<T = unknown>(
  as: Authed | null,
  path: string,
  input?: unknown
): Promise<T> {
  return (await call(procedureAt(path), input, {
    context: await contextAs(as),
    // As `/api/rpc` routes it: `adminProcedure`'s guard reads the path.
    path: ["admin", ...path.split(".")],
  })) as T;
}

/** The audit actions a mutation is mapped to (throws for reads and exempt ones). */
function mappedActions(procedure: string): readonly WritableAuditAction[] {
  const kind = ADMIN_PROCEDURE_KINDS[procedure];
  if (kind && typeof kind === "object" && "audit" in kind) {
    return typeof kind.audit === "string" ? [kind.audit] : kind.audit;
  }
  throw new Error(`[test] ${procedure} is not a mapped admin mutation`);
}

/**
 * What the auth test's admin calls work on: rows created once per test
 * file. An area's input function may create its own rows too.
 */
export interface Fixtures {
  admin: Authed;
  category: Category;
  gesture: Gesture;
  /** A plain account, the target of user actions. */
  user: User;
}

export async function seedFixtures(admin: Authed): Promise<Fixtures> {
  const db = testDb();
  return {
    admin,
    category: await makeCategory(db, { name: "Fixture category" }),
    gesture: await makeGesture(db, { name: "Fixture gesture" }),
    user: await makeUser(db, { name: "Fixture user" }),
  };
}

/** The newest audit row id so far: `expectAudit` looks at rows after it. */
export async function auditMark(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT coalesce(max(rowid), 0) AS mark FROM audit_log"
  ).first<{ mark: number }>();
  return row?.mark ?? 0;
}

interface StoredAudit {
  action: string;
  actorId: string | null;
  data: unknown;
  targetId: string | null;
  targetType: string;
}

/** The audit rows written after `mark`, oldest first. */
export async function auditRowsSince(mark: number): Promise<StoredAudit[]> {
  const { results } = await env.DB.prepare(
    "SELECT action, actor_id AS actorId, target_type AS targetType, target_id AS targetId, data FROM audit_log WHERE rowid > ? ORDER BY rowid"
  )
    .bind(mark)
    .all<Omit<StoredAudit, "data"> & { data: string }>();
  return results.map((row) => ({ ...row, data: JSON.parse(row.data) }));
}

export interface ExpectedAudit {
  /** Required for a one-of kind: the action this call wrote. */
  action?: WritableAuditAction;
  actorId: string;
  /** When given, the stored `data` must equal it. */
  data?: unknown;
  /** From `auditMark()` before the call. */
  mark: number;
  targetId: string | null;
  targetType: string;
}

/**
 * Asserts that `procedure` (an `admin.*` path) wrote exactly one audit
 * entry for the target since `mark`: its mapped action (`expected.action`
 * for a one-of kind), the actor, and
 * `data` that its action's schema accepts (and equal to `data` when
 * given). `adminProcedure` already fails a mutation that built no entry;
 * this checks what was stored.
 */
export async function expectAudit(
  procedure: string,
  expected: ExpectedAudit
): Promise<void> {
  const actions = mappedActions(procedure);
  const [only] = actions;
  const action = expected.action ?? (actions.length === 1 ? only : undefined);
  if (!(action && actions.includes(action))) {
    throw new Error(`[test] ${procedure}: pass one of ${actions.join(", ")}`);
  }
  const rows = (await auditRowsSince(expected.mark)).filter(
    (stored) =>
      stored.targetType === expected.targetType &&
      stored.targetId === expected.targetId
  );
  expect(rows, `${procedure}: one audit entry for the target`).toHaveLength(1);
  const [row] = rows;
  expect(row).toMatchObject({ action, actorId: expected.actorId });
  expect(auditDataSchema(action)?.safeParse(row?.data).success).toBe(true);
  if ("data" in expected) {
    expect(row?.data).toEqual(expected.data);
  }
}
