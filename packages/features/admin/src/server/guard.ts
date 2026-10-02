import { os } from "@orpc/server";
import type { Db } from "@smog/db/client";
import { createDb } from "@smog/db/client";
import type { RpcContext } from "@smog/rpc";
import { trackAudits } from "./audit-writer";

/** A procedure kind as the guard reads it (the contract types the actions). */
export type GuardKind =
  | "read"
  | { audit: string | readonly string[]; noop?: string }
  | { exempt: string };

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

function isReadSql(query: string): boolean {
  return (
    READ_SQL.test(query) && !(WITH_SQL.test(query) && WRITE_WORD.test(query))
  );
}

/** An `INSERT INTO audit_log` (Drizzle quotes the name; raw SQL may not). */
const AUDIT_INSERT_SQL = /^\s*insert\s+into\s+["`]?audit_log["`]?[\s(]/i;

/**
 * What a call's D1 and KV may do, shared by both proxies:
 * - `readOnly`: every write throws before it reaches D1 or KV (`refusal`
 *   says why);
 * - `writes`: the writes so far (D1 statements that are not reads, KV puts
 *   and deletes, D1 `exec` and `withSession`);
 * - `auditInserts`: the `audit_log` inserts D1 ran (counted when their
 *   `run`, `all`, `raw`, `first` or `batch` resolved, not when they were
 *   built or prepared), which the mutation rule compares with the entries
 *   the writer built.
 */
interface WriteGate {
  auditInserts: number;
  readOnly: boolean;
  refusal: string;
  writes: number;
}

/** A read-only gate's refusal of `what`. */
function refuse(gate: WriteGate, what: string): never {
  throw new AdminGuardError(`${gate.refusal}: ${what}`);
}

function guardWrite(gate: WriteGate, what: string): void {
  if (gate.readOnly) {
    refuse(gate, what);
  }
  gate.writes += 1;
}

/** D1's own statement behind each statement the gate handed out. */
const unwrapped = new WeakMap<object, D1PreparedStatement>();

/** D1's statements that are `audit_log` inserts (counted in a `batch`). */
const auditStatements = new WeakSet<D1PreparedStatement>();

const RUNS: ReadonlySet<PropertyKey> = new Set(["all", "first", "raw", "run"]);

/**
 * `stmt`, counting in `gate.auditInserts` each time D1 ran it when it is an
 * `audit_log` insert (`audit`). `bind` hands out a tracked statement too;
 * a `batch` unwraps them (D1 wants its own statements).
 */
function trackedStatement(
  stmt: D1PreparedStatement,
  gate: WriteGate,
  audit: boolean
): D1PreparedStatement {
  if (audit) {
    auditStatements.add(stmt);
  }
  const tracked = new Proxy(stmt, {
    get(target, key) {
      if (key === "bind") {
        return (...values: unknown[]) =>
          trackedStatement(target.bind(...values), gate, audit);
      }
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== "function") {
        return value;
      }
      if (audit && RUNS.has(key)) {
        return async (...args: unknown[]) => {
          const result: unknown = await Reflect.apply(value, target, args);
          gate.auditInserts += 1;
          return result;
        };
      }
      return value.bind(target);
    },
  });
  unwrapped.set(tracked, stmt);
  return tracked;
}

/**
 * A D1 binding that counts the writes it lets through, or refuses them
 * when the gate is read-only: a statement that is not a `SELECT` (or a
 * `WITH … SELECT`) counts or throws when it is prepared, before it reaches
 * D1. Its statements also count the `audit_log` inserts D1 ran, alone or
 * in a `batch` (phase 5 fix wave M1).
 */
function gatedD1(d1: D1Database, gate: WriteGate): D1Database {
  return new Proxy(d1, {
    get(target, key) {
      if (key === "prepare") {
        return (query: string) => {
          if (!isReadSql(query)) {
            guardWrite(gate, query.slice(0, 80));
          }
          return trackedStatement(
            target.prepare(query),
            gate,
            AUDIT_INSERT_SQL.test(query)
          );
        };
      }
      if (key === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          const own = statements.map((stmt) => unwrapped.get(stmt) ?? stmt);
          const results = await target.batch(own);
          gate.auditInserts += own.filter((stmt) =>
            auditStatements.has(stmt)
          ).length;
          return results;
        };
      }
      if (key === "exec" || key === "withSession") {
        return (...args: unknown[]) => {
          guardWrite(gate, `D1 ${key}`);
          return (target[key] as (...a: unknown[]) => unknown)(...args);
        };
      }
      if (key === "dump") {
        return () => {
          throw new AdminGuardError(
            "[admin] An admin procedure called D1 dump"
          );
        };
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** A KV binding whose `put` and `delete` count, or throw when read-only. */
function gatedKv(kv: KVNamespace, gate: WriteGate): KVNamespace {
  return new Proxy(kv, {
    get(target, key) {
      if (key === "put" || key === "delete") {
        return (...args: unknown[]) => {
          guardWrite(gate, `KV ${key}`);
          return (target[key] as (...a: unknown[]) => unknown)(...args);
        };
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * The Better Auth methods a read procedure may call: reads only. Better
 * Auth writes D1 through its own adapter, which the D1 gate never sees, so
 * a read gets `auth.api` frozen to this list (phase 5 fix wave M2).
 * `getSession` may refresh the caller's own session row, as on any request.
 */
export const AUTH_READ_METHODS = [
  "getSession",
  "getUser",
  "listSessions",
  "listUserAccounts",
  "listUserSessions",
  "listUsers",
  "userHasPermission",
] as const;

const AUTH_READS: ReadonlySet<PropertyKey> = new Set(AUTH_READ_METHODS);

type AuthApi = RpcContext["auth"]["api"];

/**
 * `auth` for a read: `api` answers only `AUTH_READ_METHODS`, and calling
 * any other method throws before it runs; anything else (`handler`,
 * `$context`, `options`) throws when read.
 */
function readOnlyAuth(
  auth: RpcContext["auth"],
  gate: WriteGate
): RpcContext["auth"] {
  const api = new Proxy(auth.api, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof key === "symbol" || typeof value !== "function") {
        return value;
      }
      if (AUTH_READS.has(key)) {
        return value.bind(target);
      }
      return () => refuse(gate, `auth.api.${key}`);
    },
  }) as AuthApi;
  return new Proxy(auth, {
    get(_target, key) {
      if (key === "api") {
        return api;
      }
      if (typeof key === "symbol" || key === "then") {
        return;
      }
      return refuse(gate, `auth.${key}`);
    },
  });
}

/** A mutation call's state, by its request-scoped Drizzle client. */
interface MutationCall {
  gate: WriteGate;
  name: string;
  /** The kind's `noop` reason; `markUnchanged` is refused without one. */
  noop: string | undefined;
  unchanged: boolean;
}

const calls = new WeakMap<Db, MutationCall>();

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
 * Records that this mutation found nothing to change (it asked for the
 * state that is already stored), so it finishes without its audit entry.
 * Only a kind with a `noop` reason may call it, and only before it wrote
 * anything: it throws otherwise. From then on the call's D1 and KV are
 * read-only, so nothing it does afterwards can land unaudited.
 */
export function markUnchanged(db: Db): void {
  const call = calls.get(db);
  if (!call) {
    fail("[admin] markUnchanged outside an admin mutation");
  }
  if (call.noop === undefined) {
    fail(`[admin] ${call.name} has no noop kind, so it cannot be unchanged`);
  }
  if (call.gate.writes > 0) {
    fail(`[admin] ${call.name} marked itself unchanged after writing`);
  }
  call.unchanged = true;
  call.gate.readOnly = true;
  call.gate.refusal = `[admin] ${call.name} wrote after markUnchanged`;
}

function inserts(count: number): string {
  return count === 1 ? "1 audit_log insert" : `${count} audit_log inserts`;
}

/**
 * A mutation's audit rule, after its handler succeeded: `{ audit }` built
 * at least one entry, all with the same one of its actions, and D1 ran
 * exactly as many `audit_log` inserts; `{ exempt }` built and ran none.
 */
function checkMutation(
  name: string,
  kind: Exclude<GuardKind, "read">,
  entries: readonly string[],
  call: MutationCall
): void {
  if (call.unchanged) {
    // Belt and braces: the read-only gate already refused any write.
    if (entries.length > 0 || call.gate.writes > 0) {
      fail(`[admin] ${name} marked itself unchanged but wrote`);
    }
    return;
  }
  const ran = call.gate.auditInserts;
  if ("exempt" in kind) {
    if (entries.length > 0) {
      fail(`[admin] ${name} is exempt but built an audit entry`);
    }
    if (ran > 0) {
      fail(`[admin] ${name} is exempt but ran ${inserts(ran)}`);
    }
    return;
  }
  const allowed: readonly string[] =
    typeof kind.audit === "string" ? [kind.audit] : kind.audit;
  if (entries.length === 0) {
    fail(`[admin] ${name} finished without its audit entry`);
  }
  // What D1 ran, not only what was built: an entry left out of the batch
  // that ran, or an `audit_log` insert that skipped the writer, fails.
  if (ran !== entries.length) {
    const built =
      entries.length === 1
        ? "1 audit entry"
        : `${entries.length} audit entries`;
    fail(`[admin] ${name} built ${built} but ran ${inserts(ran)}`);
  }
  if (entries.some((action) => !allowed.includes(action))) {
    fail(
      `[admin] ${name} built ${entries.join(", ")}, not only ${allowed.join(" or ")}`
    );
  }
  // A one-of kind picks one action per call from its input (`setPublished`:
  // publish or unpublish); which one is the input's is checked by the
  // procedure's tests (`expectAudit` with `action`).
  if (new Set(entries).size > 1) {
    fail(
      `[admin] ${name} built ${entries.join(", ")}: a one-of kind writes one of its actions`
    );
  }
}

/**
 * The audit rule of every admin procedure, by its kind (ruling 5), after
 * `requireAdmin`:
 * - a read gets a D1 and a KV that throw on any write, and a Better Auth
 *   whose `api` has only its read methods; it may build no audit entry;
 * - `{ audit: A }` must build at least one entry, all with action `A`
 *   (`{ audit: [A, B] }`: each entry `A` or `B`), and D1 must have run
 *   each of them (counted per executed `audit_log` insert)
 *   (checked when the handler succeeded; a handler that throws changed
 *   nothing, since the entry shares the change's batch);
 * - `{ exempt }` may build and run none;
 * - `{ audit, noop }` may instead call `markUnchanged(db)` before writing
 *   anything (a no-op leaves nothing to audit); the rest of the call is
 *   read-only.
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
        const gate: WriteGate = {
          auditInserts: 0,
          readOnly: true,
          refusal: `[admin] A read procedure tried to write (${name})`,
          writes: 0,
        };
        const db = createDb(gatedD1(raw, gate));
        const entries = trackAudits(db);
        const result = await next({
          context: {
            auth: readOnlyAuth(context.auth, gate),
            db,
            kv: gatedKv(context.kv, gate),
          },
        });
        if (entries.length > 0) {
          fail(`[admin] ${name} is a read but built an audit entry`);
        }
        return result;
      }
      const gate: WriteGate = {
        auditInserts: 0,
        readOnly: false,
        refusal: "",
        writes: 0,
      };
      const db = createDb(gatedD1(raw, gate));
      const call: MutationCall = {
        gate,
        name,
        noop: "audit" in kind ? kind.noop : undefined,
        unchanged: false,
      };
      calls.set(db, call);
      const entries = trackAudits(db);
      const result = await next({
        context: { db, kv: gatedKv(context.kv, gate) },
      });
      checkMutation(name, kind, entries, call);
      return result;
    });
}
