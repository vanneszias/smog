import { ORPCError } from "@orpc/server";
import {
  account,
  auditLog,
  favorite,
  gesture,
  list,
  passkey,
  type Role,
  session,
  sponsorship,
  type User,
  user,
  userBanInForce,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { decodeCursorAs, encodeCursor, InvalidCursorError } from "@smog/utils";
import {
  and,
  count,
  desc,
  eq,
  gt,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  type AdminUser,
  type AdminUserDetail,
  type AdminUserListQuery,
  type AdminUserPage,
  USER_SPONSORSHIPS_MAX,
  type UserGuardReason,
} from "../schema";
import { auditStatement, writeAudit } from "./audit-writer";
import { type AdminDeps, adminProcedure } from "./procedure";
import { aliased } from "./sql";

const DAY_SECONDS = 24 * 60 * 60;

/** The keyset position of the last row of a page (newest first). */
interface UserPosition {
  createdAt: number;
  id: string;
}

function parseUserCursor(cursor: string): UserPosition {
  return decodeCursorAs(cursor, (key) => {
    const [createdAt, id] = key;
    return key.length === 2 &&
      typeof createdAt === "number" &&
      Number.isInteger(createdAt) &&
      typeof id === "string"
      ? { createdAt, id }
      : null;
  });
}

/**
 * Older than the position in `(created_at DESC, id DESC)` order, as a range
 * on the first key so SQLite seeks `user_created_at_idx`.
 */
function before(position: UserPosition): SQL | undefined {
  const at = new Date(position.createdAt);
  return and(
    lte(user.createdAt, at),
    or(lt(user.createdAt, at), lt(user.id, position.id))
  );
}

/** `banned` and an end that is unset or still ahead: a ban in force. */
function banInForce(now: Date): SQL {
  return userBanInForce(now);
}

/** The `banned` filter: a ban in force (`true`), none (`false`), or any. */
function banFilter(banned: boolean | undefined, now: Date): SQL | undefined {
  if (banned === undefined) {
    return;
  }
  return banned ? banInForce(now) : sql`NOT ${banInForce(now)}`;
}

/**
 * `q` in the email or the name, literal: `instr`, not `LIKE`, so `%` and
 * `_` are plain characters, and a long query works (D1 refuses `LIKE`
 * patterns over 50 bytes, shorter than many emails). Case is folded for
 * ASCII only (SQLite's `lower` on D1 has no ICU); a name is also matched as
 * typed, so `Émile` finds `Émile` (but `émile` does not; a normalised
 * search column would, see DECISIONS).
 */
function matches(q: string): SQL {
  const needle = q.toLowerCase();
  return sql`(instr(lower(${user.email}), ${needle}) > 0 OR instr(lower(${user.name}), ${needle}) > 0 OR instr(${user.name}, ${q}) > 0)`;
}

function isBannedNow(row: Pick<User, "banExpires" | "banned">): boolean {
  return (
    row.banned === true &&
    (row.banExpires === null || row.banExpires.getTime() > Date.now())
  );
}

function toAdminUser(row: User): AdminUser {
  const banned = isBannedNow(row);
  return {
    banExpires: banned ? (row.banExpires?.getTime() ?? null) : null,
    banned,
    banReason: banned ? row.banReason : null,
    createdAt: row.createdAt.getTime(),
    email: row.email,
    emailVerified: row.emailVerified,
    id: row.id,
    name: row.name,
    role: row.role,
  };
}

/** A page of accounts (`InvalidCursorError` for a foreign cursor). */
async function listUsers(
  db: Db,
  input: AdminUserListQuery
): Promise<AdminUserPage> {
  const { banned, cursor, limit, q, role } = input;
  const position = cursor === undefined ? null : parseUserCursor(cursor);
  const now = new Date();
  try {
    const rows = await db
      .select()
      .from(user)
      .where(
        and(
          role ? eq(user.role, role) : undefined,
          banFilter(banned, now),
          q ? matches(q) : undefined,
          position ? before(position) : undefined
        )
      )
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toAdminUser),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor([last.createdAt.getTime(), last.id])
          : null,
    };
  } catch (error) {
    console.error("[admin] Failed to list the users:", error);
    throw error;
  }
}

/** The sign-in methods: account providers, plus `passkey` when it has one. */
function signInMethods(
  providers: readonly { providerId: string }[],
  passkeys: number
): string[] {
  const methods = [...new Set(providers.map((row) => row.providerId))].sort();
  return passkeys > 0 ? [...methods, "passkey"] : methods;
}

/**
 * The sponsors whose email is the account's, once the account's email is
 * verified (compared case-insensitively: sponsors type their address), as
 * the account export does.
 */
function sponsorIdsOf(userId: string): SQL {
  return sql`SELECT us.id FROM sponsor AS us JOIN "user" AS uu ON lower(us.email) = lower(uu.email) WHERE uu.id = ${userId} AND uu.email_verified = 1`;
}

/** One account with its methods, counts and sponsorships, in one D1 batch (or `null`). */
async function getUser(db: Db, id: string): Promise<AdminUserDetail | null> {
  const now = new Date();
  try {
    const [rows, providers, passkeys, sessions, favorites, lists, sponsored] =
      await db.batch([
        db.select().from(user).where(eq(user.id, id)).limit(1),
        db
          .select({ providerId: account.providerId })
          .from(account)
          .where(eq(account.userId, id)),
        db.select({ n: count() }).from(passkey).where(eq(passkey.userId, id)),
        db
          .select({ n: count() })
          .from(session)
          .where(and(eq(session.userId, id), gt(session.expiresAt, now))),
        db.select({ n: count() }).from(favorite).where(eq(favorite.userId, id)),
        db.select({ n: count() }).from(list).where(eq(list.ownerId, id)),
        db
          .select({
            createdAt: sponsorship.createdAt,
            displayName: sponsorship.displayName,
            gestureId: aliased(gesture.id, "gesture_id_"),
            gestureName: gesture.name,
            gestureSlug: gesture.slug,
            id: aliased(sponsorship.id, "sponsorship_id_"),
            status: sponsorship.status,
          })
          .from(sponsorship)
          .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
          .where(sql`${sponsorship.sponsorId} IN (${sponsorIdsOf(id)})`)
          .orderBy(desc(sponsorship.createdAt), desc(sponsorship.id))
          .limit(USER_SPONSORSHIPS_MAX),
      ]);
    const [row] = rows;
    if (!row) {
      return null;
    }
    return {
      ...toAdminUser(row),
      favorites: favorites[0]?.n ?? 0,
      lists: lists[0]?.n ?? 0,
      methods: signInMethods(providers, passkeys[0]?.n ?? 0),
      sessions: sessions[0]?.n ?? 0,
      sponsorships: sponsored.map((item) => ({
        createdAt: item.createdAt.getTime(),
        displayName: item.displayName,
        gesture: {
          id: item.gestureId,
          name: item.gestureName,
          slug: item.gestureSlug,
        },
        id: item.id,
        status: item.status,
      })),
    };
  } catch (error) {
    console.error(`[admin] Failed to read the user ${id}:`, error);
    throw error;
  }
}

/** What the guards (ruling 7) look at, read before any change. */
export interface UserActionCheck {
  action: "ban" | "delete" | "setRole" | "unban";
  actorId: string;
  /**
   * The admins other than the target whose ban is not in force; read only
   * for a demotion.
   */
  otherAdmins: number;
  /** `setRole`: the role asked for. */
  role?: Role | undefined;
  target: { bannedNow: boolean; id: string; role: Role };
}

/**
 * Why the action is refused, or `null` when it may run (ruling 7): no
 * change to one's own account, no no-op, the last admin in good standing
 * stays one, a banned account is not promoted, and an admin is demoted
 * before a ban or a delete. The read is the fast path: migration 0007's
 * trigger makes the last-admin rule atomic for demotions.
 */
export function userActionRefusal(
  check: UserActionCheck
): UserGuardReason | null {
  const { action, target } = check;
  if (target.id === check.actorId) {
    return "self";
  }
  switch (action) {
    case "setRole":
      if (check.role === target.role) {
        return "unchanged";
      }
      if (check.role === "admin") {
        return target.bannedNow ? "targetBanned" : null;
      }
      return target.role === "admin" && check.otherAdmins < 1
        ? "lastAdmin"
        : null;
    case "ban":
      if (target.role === "admin") {
        return "adminTarget";
      }
      return target.bannedNow ? "alreadyBanned" : null;
    case "delete":
      return target.role === "admin" ? "adminTarget" : null;
    case "unban":
      return target.bannedNow ? null : "notBanned";
    default:
      return null;
  }
}

async function findUser(db: Db, id: string): Promise<User | undefined> {
  return await db.query.user.findFirst({ where: eq(user.id, id) });
}

/** The admins other than `targetId` whose ban is not in force. */
async function otherActiveAdmins(db: Db, targetId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(user)
    .where(
      and(
        eq(user.role, "admin"),
        sql`${user.id} <> ${targetId}`,
        sql`NOT ${banInForce(new Date())}`
      )
    );
  return row?.n ?? 0;
}

async function liveSessions(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())));
  return row?.n ?? 0;
}

/** The account after a change, as the table shows it. */
async function reread(db: Db, id: string): Promise<AdminUser> {
  const row = await findUser(db, id);
  if (!row) {
    throw new Error(`[admin] The user ${id} vanished after the change`);
  }
  return toAdminUser(row);
}

/** The typed errors a user write answers a Better Auth refusal with. */
interface UserErrors {
  FORBIDDEN: () => Error;
  INVALID_STATE: (options: { data: { reason: UserGuardReason } }) => Error;
  NOT_FOUND: () => Error;
}

/** Whether `error` (or a cause) is migration 0007's `last_admin` abort. */
function isLastAdminAbort(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current.message.includes("last_admin")) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/** Better Auth's `APIError` status and code (better-call), if it is one. */
function apiErrorOf(
  error: unknown
): { code: string | undefined; status: number } | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const { body, statusCode } = error as {
    body?: unknown;
    statusCode?: unknown;
  };
  if (typeof statusCode !== "number") {
    return null;
  }
  const code =
    typeof body === "object" && body !== null && "code" in body
      ? String((body as { code: unknown }).code)
      : undefined;
  return { code, status: statusCode };
}

/**
 * The typed answer for a failed Better Auth admin call (I-2): the
 * last-admin trigger is `INVALID_STATE lastAdmin`; a 403 (the actor lost
 * the role meanwhile) `FORBIDDEN`; a 404 (the target is gone) `NOT_FOUND`;
 * Better Auth's own self checks (`YOU_CANNOT_*`) `INVALID_STATE self`;
 * another 400 `BAD_REQUEST`. Anything else is not a refusal.
 */
function authRefusal(errors: UserErrors, error: unknown): Error | null {
  if (isLastAdminAbort(error)) {
    return errors.INVALID_STATE({ data: { reason: "lastAdmin" } });
  }
  const api = apiErrorOf(error);
  switch (api?.status) {
    case 403:
      return errors.FORBIDDEN();
    case 404:
      return errors.NOT_FOUND();
    case 400:
      return api.code?.startsWith("YOU_CANNOT_")
        ? errors.INVALID_STATE({ data: { reason: "self" } })
        : new ORPCError("BAD_REQUEST", { cause: error });
    default:
      return null;
  }
}

/**
 * Runs a Better Auth admin call. A failure is logged, then answered with
 * its typed refusal when it is one, else rethrown.
 */
async function authCall<T>(
  label: string,
  errors: UserErrors,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[admin] Failed to ${label}:`, error);
    throw authRefusal(errors, error) ?? error;
  }
}

/** Epoch milliseconds of a date Better Auth returns (a `Date` or a string). */
function epochOf(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const ms = new Date(value as Date | string | number).getTime();
  return Number.isNaN(ms) ? null : ms;
}

const sameEmail = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The `users` slice of the admin router (Task 5). Reads come from D1; each
 * write reads the target, runs the guards, calls `auth.api` with the
 * request's headers, then writes its audit entry with `writeAudit` (ruling
 * 5: the change first; a failed entry is logged and rethrown).
 */
export function usersRoutes(_deps: AdminDeps) {
  const procedures = adminProcedure.users;

  return {
    users: {
      ban: procedures.ban.handler(async ({ context, errors, input }) => {
        const target = await findUser(context.db, input.userId);
        if (!target) {
          throw errors.NOT_FOUND();
        }
        const reason = userActionRefusal({
          action: "ban",
          actorId: context.user.id,
          otherAdmins: 0,
          target: { ...target, bannedNow: isBannedNow(target) },
        });
        if (reason) {
          throw errors.INVALID_STATE({ data: { reason } });
        }
        const result = await authCall(`ban the user ${target.id}`, errors, () =>
          context.auth.api.banUser({
            body: {
              banReason: input.reason,
              ...(input.expiresInDays
                ? { banExpiresIn: input.expiresInDays * DAY_SECONDS }
                : {}),
              userId: target.id,
            },
            headers: context.request.headers,
          })
        );
        // From Better Auth's answer, not a re-read: the entry is written
        // even if the account is deleted right after the ban (M-4).
        await writeAudit(context.db, {
          action: "user.ban",
          actorId: context.user.id,
          data: {
            expiresAt: epochOf(result.user.banExpires),
            reason: input.reason,
          },
          targetId: target.id,
          targetType: "user",
        });
        return { user: await reread(context.db, target.id) };
      }),
      delete: procedures.delete.handler(async ({ context, errors, input }) => {
        const target = await findUser(context.db, input.userId);
        if (!target) {
          throw errors.NOT_FOUND();
        }
        const reason = userActionRefusal({
          action: "delete",
          actorId: context.user.id,
          otherAdmins: 0,
          target: { ...target, bannedNow: isBannedNow(target) },
        });
        if (reason) {
          throw errors.INVALID_STATE({ data: { reason } });
        }
        if (!sameEmail(input.confirmEmail, target.email)) {
          throw errors.VALIDATION({
            data: {
              fieldErrors: { confirmEmail: ["mismatch"] },
              formErrors: [],
            },
          });
        }
        const hadSessions = (await liveSessions(context.db, target.id)) > 0;
        await authCall(`delete the user ${target.id}`, errors, () =>
          context.auth.api.removeUser({
            body: { userId: target.id },
            headers: context.request.headers,
          })
        );
        // The entry, and the free-text ban reasons about the account
        // dropped from its `user.ban` entries (M-5, data minimisation), in
        // one batch: both or neither. A failure is logged and rethrown.
        try {
          await context.db.batch([
            context.db
              .update(auditLog)
              .set({
                data: sql`json_set(json_remove(${auditLog.data}, '$.reason'), '$.reasonRemoved', json('true'))`,
              })
              .where(
                and(
                  eq(auditLog.action, "user.ban"),
                  eq(auditLog.targetType, "user"),
                  eq(auditLog.targetId, target.id),
                  sql`json_extract(${auditLog.data}, '$.reason') IS NOT NULL`
                )
              ),
            auditStatement(context.db, {
              action: "user.delete",
              actorId: context.user.id,
              data: { hadSessions },
              targetId: target.id,
              targetType: "user",
            }),
          ]);
        } catch (error) {
          console.error(
            `[admin] Failed to write the audit entry user.delete for user:${target.id}:`,
            error
          );
          throw error;
        }
        return { id: target.id };
      }),
      get: procedures.get.handler(async ({ context, errors, input }) => {
        const detail = await getUser(context.db, input.id);
        if (!detail) {
          throw errors.NOT_FOUND();
        }
        return detail;
      }),
      list: procedures.list.handler(async ({ context, errors, input }) => {
        try {
          return await listUsers(context.db, input);
        } catch (error) {
          if (error instanceof InvalidCursorError) {
            throw errors.VALIDATION({
              data: { fieldErrors: { cursor: ["invalid"] }, formErrors: [] },
            });
          }
          throw error;
        }
      }),
      setRole: procedures.setRole.handler(
        async ({ context, errors, input }) => {
          const target = await findUser(context.db, input.userId);
          if (!target) {
            throw errors.NOT_FOUND();
          }
          const demotion = target.role === "admin" && input.role !== "admin";
          const reason = userActionRefusal({
            action: "setRole",
            actorId: context.user.id,
            otherAdmins: demotion
              ? await otherActiveAdmins(context.db, target.id)
              : 0,
            role: input.role,
            target: { ...target, bannedNow: isBannedNow(target) },
          });
          if (reason) {
            throw errors.INVALID_STATE({ data: { reason } });
          }
          await authCall(`set the role of the user ${target.id}`, errors, () =>
            context.auth.api.setRole({
              body: { role: input.role, userId: target.id },
              headers: context.request.headers,
            })
          );
          await writeAudit(context.db, {
            action: "user.role_change",
            actorId: context.user.id,
            data: { from: target.role, to: input.role },
            targetId: target.id,
            targetType: "user",
          });
          return { user: await reread(context.db, target.id) };
        }
      ),
      unban: procedures.unban.handler(async ({ context, errors, input }) => {
        const target = await findUser(context.db, input.userId);
        if (!target) {
          throw errors.NOT_FOUND();
        }
        const reason = userActionRefusal({
          action: "unban",
          actorId: context.user.id,
          otherAdmins: 0,
          target: { ...target, bannedNow: isBannedNow(target) },
        });
        if (reason) {
          throw errors.INVALID_STATE({ data: { reason } });
        }
        await authCall(`unban the user ${target.id}`, errors, () =>
          context.auth.api.unbanUser({
            body: { userId: target.id },
            headers: context.request.headers,
          })
        );
        await writeAudit(context.db, {
          action: "user.unban",
          actorId: context.user.id,
          data: {},
          targetId: target.id,
          targetType: "user",
        });
        return { user: await reread(context.db, target.id) };
      }),
    },
  };
}
