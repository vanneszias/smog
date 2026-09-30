import { os } from "@orpc/server";
import { createDb } from "@smog/db/client";
import type { RpcContext } from "@smog/rpc";
import { trackAudits } from "./audit-writer";

/** A procedure kind as the guard reads it (the contract types the actions). */
export type GuardKind = "read" | { audit: string } | { exempt: string };

/** A read that tried to write, or a mutation that broke its audit rule. */
class AdminGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminGuardError";
  }
}

const READ_SQL = /^\s*(?:select|with)\b/i;
const WITH_SQL = /^\s*with\b/i;
const WRITE_WORD =
  /\b(?:insert|update|delete|replace|create|drop|alter|pragma|attach|vacuum)\b/i;

function assertReadSql(query: string): void {
  if (
    !READ_SQL.test(query) ||
    (WITH_SQL.test(query) && WRITE_WORD.test(query))
  ) {
    throw new AdminGuardError(
      `[admin] A read procedure tried to write: ${query.slice(0, 80)}`
    );
  }
}

/**
 * A D1 binding that only runs `SELECT` (and `WITH … SELECT`): anything else
 * throws when it is prepared, before it reaches D1.
 */
function readOnlyD1(d1: D1Database): D1Database {
  return new Proxy(d1, {
    get(target, key) {
      if (key === "prepare") {
        return (query: string) => {
          assertReadSql(query);
          return target.prepare(query);
        };
      }
      if (key === "exec" || key === "dump" || key === "withSession") {
        return () => {
          throw new AdminGuardError(
            `[admin] A read procedure called D1 ${key}`
          );
        };
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** A KV binding whose `put` and `delete` throw. */
function readOnlyKv(kv: KVNamespace): KVNamespace {
  return new Proxy(kv, {
    get(target, key) {
      if (key === "put" || key === "delete") {
        return () => {
          throw new AdminGuardError(
            `[admin] A read procedure called KV ${key}`
          );
        };
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** The kind of the procedure at `path` (with or without the `admin` mount). */
function kindAt(
  kinds: Readonly<Record<string, GuardKind>>,
  path: readonly string[]
): GuardKind | undefined {
  const full = path.join(".");
  if (Object.hasOwn(kinds, full)) {
    return kinds[full];
  }
  if (path[0] === "admin") {
    const local = path.slice(1).join(".");
    return Object.hasOwn(kinds, local) ? kinds[local] : undefined;
  }
}

function fail(message: string): never {
  console.error(message);
  throw new AdminGuardError(message);
}

/**
 * The audit rule of every admin procedure, by its kind (ruling 5), after
 * `requireAdmin`:
 * - a read gets a D1 and a KV that throw on any write, and may build no
 *   audit entry;
 * - `{ audit: A }` must build at least one entry, all with action `A`
 *   (checked when the handler succeeded; a handler that throws changed
 *   nothing, since the entry shares the change's batch);
 * - `{ exempt }` may build none.
 * An unclassified path fails closed. Each call gets its own Drizzle client,
 * so the entries it built are its own.
 */
export function adminGuard(kinds: Readonly<Record<string, GuardKind>>) {
  return os
    .$context<RpcContext>()
    .middleware(async ({ context, next, path }) => {
      const name = path.join(".");
      const kind = kindAt(kinds, path);
      if (!kind) {
        fail(`[admin] ${name || "(no path)"} has no procedure kind`);
      }
      // `createDb` keeps the binding as Drizzle's `$client`.
      const raw = (context.db as { $client?: D1Database }).$client;
      if (!raw) {
        fail(`[admin] ${name}: the rpc context's db has no D1 binding`);
      }
      if (kind === "read") {
        const db = createDb(readOnlyD1(raw));
        const entries = trackAudits(db);
        const result = await next({
          context: { db, kv: readOnlyKv(context.kv) },
        });
        if (entries.length > 0) {
          fail(`[admin] ${name} is a read but built an audit entry`);
        }
        return result;
      }
      const db = createDb(raw);
      const entries = trackAudits(db);
      const result = await next({ context: { db } });
      if ("audit" in kind) {
        if (entries.length === 0) {
          fail(`[admin] ${name} finished without its audit entry`);
        }
        if (entries.some((action) => action !== kind.audit)) {
          fail(
            `[admin] ${name} built ${entries.join(", ")}, not only ${kind.audit}`
          );
        }
      } else if (entries.length > 0) {
        fail(`[admin] ${name} is exempt but built an audit entry`);
      }
      return result;
    });
}
