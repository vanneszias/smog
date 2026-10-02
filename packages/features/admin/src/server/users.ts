import {
  account,
  favorite,
  list,
  passkey,
  type Role,
  session,
  type User,
  user,
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
import type {
  AdminUser,
  AdminUserDetail,
  AdminUserListQuery,
  AdminUserPage,
  UserGuardReason,
} from "../schema";
import { writeAudit } from "./audit-writer";
import { type AdminDeps, adminProcedure } from "./procedure";

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
  return sql`(coalesce(${user.banned}, 0) = 1 AND (${user.banExpires} IS NULL OR ${user.banExpires} > ${now.getTime()}))`;
}

/** The `banned` filter: a ban in force (`true`), none (`false`), or any. */
function banFilter(banned: boolean | undefined, now: Date): SQL | undefined {
  if (banned === undefined) {
    return;
  }
  return banned ? banInForce(now) : sql`NOT ${banInForce(now)}`;
}

/**
 * `q` in the email or the name, case-insensitive (ASCII, as SQLite's
 * `lower`) and literal: `instr`, not `LIKE`, so `%` and `_` are plain
 * characters, and a long query works (D1 refuses `LIKE` patterns over 50
 * bytes, shorter than many emails).
 */
function matches(q: string): SQL {
  const needle = q.toLowerCase();
  return sql`(instr(lower(${user.email}), ${needle}) > 0 OR instr(lower(${user.name}), ${needle}) > 0)`;
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

/** One account with its methods and counts, in one D1 batch (or `null`). */
async function getUser(db: Db, id: string): Promise<AdminUserDetail | null> {
  const now = new Date();
  try {
    const [rows, providers, passkeys, sessions, favorites, lists] =
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
  /** The admins now; read only for a demotion. */
  adminCount: number;
  /** `setRole`: the role asked for. */
  role?: Role | undefined;
  target: { bannedNow: boolean; id: string; role: Role };
}

/**
 * Why the action is refused, or `null` when it may run (ruling 7): no
 * change to one's own account, no no-op, the last admin stays one, and an
 * admin is demoted before a ban or a delete.
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
      return target.role === "admin" && check.adminCount <= 1
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

async function adminCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(user)
    .where(eq(user.role, "admin"));
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

/** Runs a Better Auth admin call, logging a failure before rethrowing it. */
async function authCall<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[admin] Failed to ${label}:`, error);
    throw error;
  }
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
          adminCount: 0,
          target: { ...target, bannedNow: isBannedNow(target) },
        });
        if (reason) {
          throw errors.INVALID_STATE({ data: { reason } });
        }
        await authCall(`ban the user ${target.id}`, () =>
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
        const banned = await reread(context.db, target.id);
        await writeAudit(context.db, {
          action: "user.ban",
          actorId: context.user.id,
          data: { expiresAt: banned.banExpires, reason: input.reason },
          targetId: target.id,
          targetType: "user",
        });
        return { user: banned };
      }),
      delete: procedures.delete.handler(async ({ context, errors, input }) => {
        const target = await findUser(context.db, input.userId);
        if (!target) {
          throw errors.NOT_FOUND();
        }
        const reason = userActionRefusal({
          action: "delete",
          actorId: context.user.id,
          adminCount: 0,
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
        await authCall(`delete the user ${target.id}`, () =>
          context.auth.api.removeUser({
            body: { userId: target.id },
            headers: context.request.headers,
          })
        );
        await writeAudit(context.db, {
          action: "user.delete",
          actorId: context.user.id,
          data: { hadSessions },
          targetId: target.id,
          targetType: "user",
        });
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
            adminCount: demotion ? await adminCount(context.db) : 0,
            role: input.role,
            target: { ...target, bannedNow: isBannedNow(target) },
          });
          if (reason) {
            throw errors.INVALID_STATE({ data: { reason } });
          }
          await authCall(`set the role of the user ${target.id}`, () =>
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
          adminCount: 0,
          target: { ...target, bannedNow: isBannedNow(target) },
        });
        if (reason) {
          throw errors.INVALID_STATE({ data: { reason } });
        }
        await authCall(`unban the user ${target.id}`, () =>
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
