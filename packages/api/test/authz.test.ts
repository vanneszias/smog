import { isContractProcedure, oc } from "@orpc/contract";
import { call } from "@orpc/server";
import { ADMIN_PROCEDURE_KINDS } from "@smog/admin/contract";
import { loadSession, teacherProcedure, translatorProcedure } from "@smog/rpc";
import { makeRpcContext, makeSession } from "@smog/rpc/testing";
import { TRANSLATION_PROCEDURE_KINDS } from "@smog/translation/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appContract } from "../src/contract";
import { appRouter } from "../src/index";

/*
 * Phase 10b: roles are a set (translator, teacher, admin; `admin` implies
 * the others). The levels `translator` and `teacher` are for the procedures
 * the translation tasks add (a row each, with the same checks as `admin`:
 * UNAUTHORIZED for a guest, FORBIDDEN for a user or the other role, a pass
 * for the role and for an admin); until they exist the cross-role tests
 * below run every admin row as a translator and a teacher (FORBIDDEN) and a
 * stub router built on `translatorProcedure` / `teacherProcedure` proves the
 * guards (an admin passes both).
 *
 * The authorization table (phase 3 review M11, phase 9 task 8): every leaf
 * of the real router, the admin router included, appears in `PROCEDURES`
 * with its level, and the middleware is shown to enforce that level with an
 * anonymous, a signed-in and an admin call. A procedure missing from the
 * table (or a stale row) fails the first test, so a new one cannot ship
 * unlisted; a stub contract proves the check itself.
 *
 * Levels:
 * - `public`: anyone. Sponsoring needs no account; its mutations run
 *   Turnstile and RL_SPONSOR (tested in @smog/sponsorships).
 * - `session`: a signed-in user (`UNAUTHORIZED` otherwise). A signed-in
 *   user is a verified one: email sign-up requires the verification link
 *   before a session exists (`@smog/auth`), so there is no separate
 *   `verified` procedure and no procedure may claim it.
 * - `token`: no session; a capability token in the input is the credential
 *   (a list's share token, a sponsorship's re-edit or renewal token). The
 *   token checks are tested in @smog/lists and @smog/sponsorships.
 * - `admin`: the admin role (`UNAUTHORIZED` for a guest, `FORBIDDEN` for a
 *   user); each write also carries an `adminGuard` kind that forces its
 *   audit row into the same batch (`admin` below, from `ADMIN_PROCEDURE_KINDS`).
 * - `webhook`: provider callbacks are plain routes, never oRPC procedures:
 *   they are in the route table of `apps/site/test/security-routes.test.ts`.
 *
 * A banned user and a deleted or revoked session read as no session
 * (`getSession` reads D1 on every request), so every `session` and `admin`
 * row is also refused for them: the `null` session below is exactly what
 * the middleware sees. The full stack is in `apps/site/test/security-authz.test.ts`.
 *
 * `admin.*` guards run before input validation (oRPC validates after the
 * middlewares), so the admin rows need no input.
 */

type Level =
  | "admin"
  | "public"
  | "session"
  | "teacher"
  | "token"
  | "translator"
  | "verified"
  | "webhook";
type AdminKind = "audit" | "exempt" | "read";

interface Row {
  /** Admin rows only: how the write is audited (`read` is no write). */
  admin?: AdminKind;
  /** A valid input, so the call passes validation and reaches the guard. */
  input?: unknown;
  level: Level;
}

/** The admin rows: path (relative to `admin`) to its audit kind. */
function admin(kinds: Record<string, AdminKind>): Record<string, Row> {
  return Object.fromEntries(
    Object.entries(kinds).map(([path, kind]) => [
      `admin.${path}`,
      { admin: kind, level: "admin" } satisfies Row,
    ])
  );
}

const PROCEDURES: Record<string, Row> = {
  "account.consent.get": { level: "session" },
  "account.consent.set": { input: { analytics: true }, level: "session" },
  "account.delete": { input: { confirm: "DELETE" }, level: "session" },
  "account.export": { level: "session" },
  "account.importGuestData": {
    input: { favorites: [], lists: [] },
    level: "session",
  },
  "account.me": { level: "session" },
  "account.updateProfile": { input: {}, level: "session" },
  // Phase 10b task 5: the gesture and category translations (a translator
  // or an admin; the writes also carry the admin audit guard, tested in
  // `@smog/admin`'s `catalog-translation.test.ts`).
  "catalogTranslation.categories.list": {
    input: { locale: "fr" },
    level: "translator",
  },
  "catalogTranslation.categories.save": {
    input: { expectedUpdatedAt: null, id: "c1", locale: "fr", name: "Animaux" },
    level: "translator",
  },
  "catalogTranslation.gestures.get": {
    input: { id: "g1" },
    level: "translator",
  },
  "catalogTranslation.gestures.list": {
    input: { locale: "fr" },
    level: "translator",
  },
  "catalogTranslation.gestures.save": {
    input: { expectedUpdatedAt: null, id: "g1", locale: "fr", name: "Chien" },
    level: "translator",
  },
  "catalogTranslation.reports": { level: "translator" },
  ...admin({
    "audit.actors": "read",
    "audit.list": "read",
    "categories.create": "audit",
    "categories.delete": "audit",
    "categories.list": "read",
    "categories.reorder": "audit",
    "categories.setPublished": "audit",
    "categories.update": "audit",
    dashboard: "read",
    "deadLetters.discard": "audit",
    "deadLetters.list": "read",
    "deadLetters.replay": "audit",
    "emails.list": "read",
    "emails.preview": "read",
    "export.sponsorshipsCsv": "audit",
    "gestures.bulkUpdate": "audit",
    "gestures.checkName": "read",
    "gestures.create": "audit",
    "gestures.delete": "audit",
    "gestures.get": "read",
    "gestures.list": "read",
    "gestures.recutDone": "audit",
    "gestures.saveMany": "audit",
    "gestures.setPublished": "audit",
    "gestures.update": "audit",
    "maintenance.get": "read",
    "maintenance.set": "audit",
    "mux.assets": "read",
    "mux.createUpload": "exempt",
    "mux.status": "read",
    "mux.uploadStatus": "read",
    "sponsorships.approve": "audit",
    "sponsorships.cancel": "audit",
    "sponsorships.forceExpire": "audit",
    "sponsorships.get": "read",
    "sponsorships.list": "read",
    "sponsorships.markPaid": "audit",
    "sponsorships.recordRefund": "audit",
    "sponsorships.regenerateToken": "audit",
    "sponsorships.reject": "audit",
    "sponsorships.requestChanges": "audit",
    "sponsorships.retryRender": "audit",
    "users.ban": "audit",
    "users.delete": "audit",
    "users.get": "read",
    "users.grantRole": "audit",
    "users.list": "read",
    "users.revokeRole": "audit",
    "users.unban": "audit",
  }),
  "favorites.add": { input: { gestureId: "g" }, level: "session" },
  "favorites.ids": { level: "session" },
  "favorites.list": { input: {}, level: "session" },
  "favorites.remove": { input: { gestureId: "g" }, level: "session" },
  "favorites.toggle": { input: { gestureId: "g" }, level: "session" },
  "gestures.byIds": { level: "public" },
  "gestures.bySlug": { level: "public" },
  "gestures.categories": { level: "public" },
  "gestures.list": { level: "public" },
  "gestures.related": { level: "public" },
  "gestures.search": { level: "public" },
  "gestures.sitemap": { level: "public" },
  "lists.addItem": { input: { gestureId: "g", id: "l" }, level: "session" },
  "lists.containing": { input: { gestureId: "g" }, level: "session" },
  "lists.create": { input: { name: "Dieren" }, level: "session" },
  "lists.delete": { input: { id: "l" }, level: "session" },
  "lists.get": { input: { id: "l" }, level: "session" },
  "lists.mine": { level: "session" },
  "lists.removeItem": { input: { gestureId: "g", id: "l" }, level: "session" },
  "lists.reorder": { input: { gestureIds: [], id: "l" }, level: "session" },
  "lists.share.create": { input: { id: "l", role: "view" }, level: "session" },
  "lists.share.get": { input: { id: "l" }, level: "session" },
  "lists.share.revoke": { input: { id: "l", role: "view" }, level: "session" },
  // The shared view is read with the token alone; changing a shared list
  // needs a session as well as an `edit` token (@smog/lists sharing tests).
  "lists.shared.addItem": {
    input: { gestureId: "g", token: "t" },
    level: "session",
  },
  "lists.shared.get": { level: "token" },
  "lists.shared.removeItem": {
    input: { gestureId: "g", token: "t" },
    level: "session",
  },
  "lists.update": { input: { id: "l", name: "Dieren" }, level: "session" },
  "sponsorships.availability": { level: "public" },
  "sponsorships.checkout": { level: "public" },
  "sponsorships.paymentStatus": { level: "public" },
  "sponsorships.quote": { level: "public" },
  "sponsorships.reedit.get": { level: "token" },
  "sponsorships.reedit.submit": { level: "token" },
  "sponsorships.renewal.checkout": { level: "token" },
  "sponsorships.renewal.get": { level: "token" },
  "sponsorships.uploadLogo": { level: "public" },
  "system.authConfig": { level: "public" },
  "system.health": { level: "public" },
  "system.i18n": { input: {}, level: "public" },
  "system.whoami": { level: "public" },
  // Phase 10b task 4: the translation screens. Strings, the language list
  // and the coverage need the translator role (an admin passes); creating
  // or changing a language needs the admin role. Every change carries an
  // audit kind (`TRANSLATION_PROCEDURE_KINDS`, checked below).
  "translation.coverage": { level: "translator" },
  // Task 6: a gesture's spoken name. A translator or an admin uploads,
  // checks and removes it; the file itself never passes through a procedure.
  "translation.deleteAudio": {
    input: { gestureId: "00000000-0000-4000-8000-000000000000", locale: "en" },
    level: "translator",
  },
  "translation.finalizeAudio": {
    input: {
      gestureId: "00000000-0000-4000-8000-000000000000",
      key: "audio/00000000-0000-4000-8000-000000000000/en/00000000-0000-4000-8000-000000000001",
      locale: "en",
    },
    level: "translator",
  },
  "translation.languages.create": { level: "admin" },
  "translation.languages.list": { level: "translator" },
  "translation.languages.update": { level: "admin" },
  "translation.listAudio": {
    input: { gestureId: "00000000-0000-4000-8000-000000000000" },
    level: "translator",
  },
  "translation.strings.export": {
    input: { format: "json" },
    level: "translator",
  },
  "translation.strings.import": {
    input: { content: "{}", format: "json", locale: "en" },
    level: "translator",
  },
  "translation.strings.list": { input: {}, level: "translator" },
  "translation.strings.preview": {
    input: { content: "{}", format: "json", locale: "en" },
    level: "translator",
  },
  "translation.strings.save": {
    input: { expectedUpdatedAt: null, key: "a.b", locale: "en", value: "x" },
    level: "translator",
  },
  "translation.uploadAudio": {
    input: {
      contentType: "audio/mpeg",
      gestureId: "00000000-0000-4000-8000-000000000000",
      locale: "en",
      size: 1000,
    },
    level: "translator",
  },
};

/** Every procedure path of a contract (`lists.share.create`, …). */
function procedurePaths(node: unknown, path: string[] = []): string[] {
  if (isContractProcedure(node)) {
    return [path.join(".")];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(
    ([key, child]) => procedurePaths(child, [...path, key])
  );
}

/** The router's procedure at `path`. */
function procedureAt(path: string): Parameters<typeof call>[0] {
  let node: unknown = appRouter;
  for (const key of path.split(".")) {
    node = (node as Record<string, unknown>)[key];
  }
  return node as Parameters<typeof call>[0];
}

/** Paths missing from the table, and table rows without a procedure. */
function tableProblems(
  contract: unknown,
  table: Readonly<Record<string, unknown>>
): { missing: string[]; stale: string[] } {
  const paths = procedurePaths(contract);
  return {
    missing: paths.filter((path) => !(path in table)).sort(),
    stale: Object.keys(table)
      .filter((path) => !paths.includes(path))
      .sort(),
  };
}

type Who = "admin" | "anonymous" | "banned" | "teacher" | "translator" | "user";

function sessionFor(who: Who) {
  switch (who) {
    case "anonymous":
    case "banned":
      // A banned user's session is gone (`getSession` reads D1 every time).
      return null;
    case "translator":
    case "teacher":
      return makeSession("user", [who]);
    default:
      return makeSession(who);
  }
}

function contextFor(who: Who) {
  return makeRpcContext({ session: sessionFor(who) });
}

/** The error code a call ends with, or `ok`. */
async function outcome(
  path: string,
  who: Who,
  input: unknown
): Promise<string> {
  try {
    await call(procedureAt(path), input, {
      context: contextFor(who),
      path: path.split("."),
    });
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? "ERROR";
  }
}

function refusedByGuard(code: string): boolean {
  return code === "FORBIDDEN" || code === "UNAUTHORIZED";
}

beforeEach(() => {
  // The handlers run on stub bindings: whatever they hit is an internal
  // error, logged; nothing may reach the network.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("no network in the authz test")))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the authorization table", () => {
  it("lists every procedure of appContract (admin included) and nothing stale", () => {
    expect(tableProblems(appContract, PROCEDURES)).toEqual({
      missing: [],
      stale: [],
    });
  });

  it("fails for a procedure that is not in the table (a stub contract)", () => {
    const rogue = oc.route({ method: "POST" });
    const stub = { ...appContract, rogue: { shipped: { unlisted: rogue } } };
    expect(tableProblems(stub, PROCEDURES).missing).toEqual([
      "rogue.shipped.unlisted",
    ]);
    const withoutOne = Object.fromEntries(
      Object.entries(PROCEDURES).filter(([path]) => path !== "system.health")
    );
    expect(tableProblems(appContract, withoutOne).missing).toEqual([
      "system.health",
    ]);
    expect(
      tableProblems(appContract, {
        ...PROCEDURES,
        "gone.away": { level: "public" },
      }).stale
    ).toEqual(["gone.away"]);
  });

  it("uses the oRPC levels only: no procedure claims `verified` or `webhook`", () => {
    const levels = new Set(Object.values(PROCEDURES).map((row) => row.level));
    const allowed: Level[] = [
      "admin",
      "public",
      "session",
      "teacher",
      "token",
      "translator",
    ];
    for (const level of levels) {
      expect(allowed).toContain(level);
    }
    for (const level of ["admin", "public", "session", "token"] as const) {
      expect(levels.has(level)).toBe(true);
    }
  });

  it("agrees with the translation kinds: every translation procedure has a kind and its role", () => {
    const translationRows = Object.entries(PROCEDURES).filter(([path]) =>
      path.startsWith("translation.")
    );
    expect(translationRows.map(([path]) => path).sort()).toEqual(
      Object.keys(TRANSLATION_PROCEDURE_KINDS).sort()
    );
    // Only the language changes are the admin's.
    expect(
      translationRows
        .filter(([, row]) => row.level === "admin")
        .map(([path]) => path)
    ).toEqual(["translation.languages.create", "translation.languages.update"]);
  });

  it("agrees with the admin kinds: a row per admin procedure, writes audited", () => {
    const adminRows = Object.entries(PROCEDURES).filter(([path]) =>
      path.startsWith("admin.")
    );
    for (const [path, row] of adminRows) {
      const kind = ADMIN_PROCEDURE_KINDS[path.slice("admin.".length)];
      expect(kind, path).toBeDefined();
      let expected: AdminKind = "read";
      if (kind !== undefined && kind !== "read") {
        expected = "audit" in kind ? "audit" : "exempt";
      }
      expect(row.admin, path).toBe(expected);
    }
    // The only unaudited admin write: Mux direct upload creation (it
    // changes nothing in D1; the video is audited when it is attached).
    expect(
      adminRows
        .filter(([, row]) => row.admin === "exempt")
        .map(([path]) => path)
    ).toEqual(["admin.mux.createUpload"]);
  });
});

const rows = Object.entries(PROCEDURES).sort(([a], [b]) => a.localeCompare(b));

describe("anonymous calls", () => {
  for (const [path, row] of rows) {
    if (row.level === "session") {
      it(`${path} (session) is UNAUTHORIZED`, async () => {
        expect(await outcome(path, "anonymous", row.input)).toBe(
          "UNAUTHORIZED"
        );
      });
    } else if (
      row.level === "admin" ||
      row.level === "translator" ||
      row.level === "teacher"
    ) {
      it(`${path} (${row.level}) is UNAUTHORIZED`, async () => {
        expect(await outcome(path, "anonymous", undefined)).toBe(
          "UNAUTHORIZED"
        );
      });
    } else {
      it(`${path} (${row.level}) is not refused by an auth guard`, async () => {
        expect(
          refusedByGuard(await outcome(path, "anonymous", row.input))
        ).toBe(false);
      });
    }
  }
});

describe("signed-in and admin calls", () => {
  for (const [path, row] of rows) {
    if (row.level === "admin") {
      it(`${path} (admin) is FORBIDDEN for a user, a translator and a teacher, let through for an admin`, async () => {
        expect(await outcome(path, "user", undefined)).toBe("FORBIDDEN");
        expect(await outcome(path, "translator", undefined)).toBe("FORBIDDEN");
        expect(await outcome(path, "teacher", undefined)).toBe("FORBIDDEN");
        expect(refusedByGuard(await outcome(path, "admin", undefined))).toBe(
          false
        );
      });
    } else if (row.level === "translator" || row.level === "teacher") {
      const holder = row.level;
      const other = holder === "translator" ? "teacher" : "translator";
      it(`${path} (${holder}) is FORBIDDEN for a user and the ${other}, let through for the ${holder} and an admin`, async () => {
        expect(await outcome(path, "user", row.input)).toBe("FORBIDDEN");
        expect(await outcome(path, other, row.input)).toBe("FORBIDDEN");
        expect(refusedByGuard(await outcome(path, holder, row.input))).toBe(
          false
        );
        expect(refusedByGuard(await outcome(path, "admin", row.input))).toBe(
          false
        );
      });
    } else {
      it(`${path} (${row.level}) is let through for a user and an admin`, async () => {
        expect(refusedByGuard(await outcome(path, "user", row.input))).toBe(
          false
        );
        expect(refusedByGuard(await outcome(path, "admin", row.input))).toBe(
          false
        );
      });
    }
  }
});

/*
 * A banned user. The ban is not a branch of any procedure: it lives in the
 * one shared session read. Better Auth reads the session from D1 on every
 * request, and `admin.users.ban` revokes the target's sessions, so a banned
 * user's cookie yields NO session (`@smog/auth` `revocation.test.ts`: "a
 * banned user's existing session stops working at once"). Two layers prove
 * every `session` and `admin` row inherits it:
 *
 * 1. here, per row, through the real `loadSession` interceptor (the one
 *    `/api/rpc` and `/api/openapi` use) with an `auth` whose `getSession`
 *    answers what Better Auth answers for a banned user (`null`), starting
 *    from a context that still carried a valid-looking session: the
 *    interceptor replaces it, and the row's guard refuses;
 * 2. `apps/site/test/security-authz.test.ts`, with a real ban of a real
 *    account through the Worker, for `account.me`, `account.export`,
 *    `favorites.ids`, `lists.mine`, `lists.create`, `system.whoami` and an
 *    admin procedure (not all rows: the table is the other layer).
 */
describe("a banned user (through the shared session interceptor)", () => {
  const bannedAuth = {
    api: { getSession: () => Promise.resolve(null) },
  } as unknown as ReturnType<typeof makeRpcContext>["auth"];

  for (const [path, row] of rows) {
    if (row.level === "session" || row.level === "admin") {
      it(`${path} refuses a banned user like a guest`, async () => {
        const context = makeRpcContext({
          auth: bannedAuth,
          // Valid-looking before the interceptor: it must be replaced.
          session: makeSession(row.level === "admin" ? "admin" : "user"),
        });
        let code = "ok";
        await loadSession({
          context,
          next: async (options: { context: typeof context }) => {
            try {
              await call(
                procedureAt(path),
                row.level === "admin" ? undefined : row.input,
                { context: options.context, path: path.split(".") }
              );
            } catch (error) {
              code = (error as { code?: string }).code ?? "ERROR";
            }
            return await Promise.resolve({} as never);
          },
        } as never);
        expect(code).toBe("UNAUTHORIZED");
      });
    }
  }
});

describe("the role guards (a stub router on the real builders)", () => {
  const translate = translatorProcedure.handler(
    () => "translated"
  ) as unknown as Parameters<typeof call>[0];
  const teach = teacherProcedure.handler(
    () => "taught"
  ) as unknown as Parameters<typeof call>[0];

  async function code(
    procedure: Parameters<typeof call>[0],
    who: Who
  ): Promise<string> {
    try {
      await call(procedure, undefined, { context: contextFor(who) });
      return "ok";
    } catch (error) {
      return (error as { code?: string }).code ?? "ERROR";
    }
  }

  it("a translator procedure: guests UNAUTHORIZED, user and teacher FORBIDDEN, translator and admin pass", async () => {
    expect(await code(translate, "anonymous")).toBe("UNAUTHORIZED");
    expect(await code(translate, "user")).toBe("FORBIDDEN");
    expect(await code(translate, "teacher")).toBe("FORBIDDEN");
    expect(await code(translate, "translator")).toBe("ok");
    expect(await code(translate, "admin")).toBe("ok");
  });

  it("a teacher procedure: guests UNAUTHORIZED, user and translator FORBIDDEN, teacher and admin pass", async () => {
    expect(await code(teach, "anonymous")).toBe("UNAUTHORIZED");
    expect(await code(teach, "user")).toBe("FORBIDDEN");
    expect(await code(teach, "translator")).toBe("FORBIDDEN");
    expect(await code(teach, "teacher")).toBe("ok");
    expect(await code(teach, "admin")).toBe("ok");
  });
});

describe("the admin mount", () => {
  it("has the dead-letter procedures of phase 9 task 4", () => {
    const names = Object.keys(PROCEDURES);
    expect(names).toEqual(
      expect.arrayContaining([
        "admin.deadLetters.discard",
        "admin.deadLetters.list",
        "admin.deadLetters.replay",
      ])
    );
    for (const path of names.filter((name) => name.startsWith("admin."))) {
      expect(procedureAt(path), path).toBeDefined();
    }
  });
});
