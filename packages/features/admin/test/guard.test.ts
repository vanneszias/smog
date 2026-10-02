import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { implementRpc, requireAdmin } from "@smog/rpc";
import { baseContract } from "@smog/rpc/contract";
import { sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  type AuditSchemas,
  buildAuditStatement,
  writeAuditWith,
} from "../src/server/audit-writer";
import {
  AUTH_READ_METHODS,
  adminGuard,
  type GuardKind,
  markUnchanged,
} from "../src/server/guard";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  contextAs,
  signedUp,
} from "./helpers";

/*
 * `adminProcedure`'s guard, on a test contract with every kind and every
 * way to break it. The handlers use the writer's core with a test-only
 * schema map (phase 5 Task 1 has no writable action of its own yet).
 */

const SCHEMAS: AuditSchemas = {
  "gesture.create": z.object({ name: z.string() }),
  "gesture.delete": z.object({ name: z.string() }),
};

const ok = baseContract.output(z.string());
const testContract = {
  things: {
    create: ok,
    createBuiltNotRun: ok,
    createMixedOneOf: ok,
    createNothing: ok,
    createOneOf: ok,
    createOutsideOneOf: ok,
    createTwoKinds: ok,
    createUnbuiltAudit: ok,
    createUnchanged: ok,
    createUnchangedAudited: ok,
    createWrong: ok,
    exempt: ok,
    exemptAudited: ok,
    exemptRawAudit: ok,
    list: ok,
    listAuthHandler: ok,
    listAuthRead: ok,
    listAuthWrite: ok,
    listBuildsAudit: ok,
    listDeletes: ok,
    listKvDelete: ok,
    listKvPut: ok,
    listWithInsert: ok,
    listWrites: ok,
    unchangedAfterKvPut: ok,
    unchangedThenD1Update: ok,
    unchangedThenKvPut: ok,
    unchangedWithoutNoop: ok,
    unclassified: ok,
    writeAfterExternal: ok,
  },
};

const NOOP = "asking for the stored state changes nothing";
const KV_KEY = "guard:noop";

const KINDS: Record<string, GuardKind> = {
  "things.create": { audit: "gesture.create" },
  "things.createBuiltNotRun": { audit: "gesture.create" },
  "things.createMixedOneOf": { audit: ["gesture.create", "gesture.delete"] },
  "things.createNothing": { audit: "gesture.create" },
  "things.createOneOf": { audit: ["gesture.create", "gesture.delete"] },
  "things.createOutsideOneOf": { audit: ["gesture.delete"] },
  "things.createTwoKinds": { audit: "gesture.create" },
  "things.createUnbuiltAudit": { audit: "gesture.create" },
  "things.createUnchanged": { audit: "gesture.create", noop: NOOP },
  "things.createUnchangedAudited": { audit: "gesture.create", noop: NOOP },
  "things.createWrong": { audit: "gesture.create" },
  "things.exempt": { exempt: "changes no stored state" },
  "things.exemptAudited": { exempt: "changes no stored state" },
  "things.exemptRawAudit": { exempt: "changes no stored state" },
  "things.list": "read",
  "things.listAuthHandler": "read",
  "things.listAuthRead": "read",
  "things.listAuthWrite": "read",
  "things.listBuildsAudit": "read",
  "things.listDeletes": "read",
  "things.listKvDelete": "read",
  "things.listKvPut": "read",
  "things.listWithInsert": "read",
  "things.listWrites": "read",
  "things.unchangedAfterKvPut": { audit: "gesture.create", noop: NOOP },
  "things.unchangedThenD1Update": { audit: "gesture.create", noop: NOOP },
  "things.unchangedThenKvPut": { audit: "gesture.create", noop: NOOP },
  "things.unchangedWithoutNoop": { audit: "gesture.create" },
  "things.writeAfterExternal": { audit: "gesture.create" },
};

const os = implementRpc(testContract).use(requireAdmin).use(adminGuard(KINDS));

const entry = (
  actorId: string,
  action: "gesture.create" | "gesture.delete",
  targetId: string
) => ({
  action,
  actorId,
  data: { name: "Hond" },
  targetId,
  targetType: "gesture" as const,
});

const router = os.router({
  things: {
    create: os.things.create.handler(async ({ context }) => {
      await context.db.batch([
        buildAuditStatement(
          context.db,
          SCHEMAS,
          entry(context.user.id, "gesture.create", "t-create")
        ),
      ]);
      return "created";
    }),
    createBuiltNotRun: os.things.createBuiltNotRun.handler(
      async ({ context }) => {
        // Built, then left out of the batch that runs.
        buildAuditStatement(
          context.db,
          SCHEMAS,
          entry(context.user.id, "gesture.create", "t-built-not-run")
        );
        await context.db.batch([
          context.db.run(sql.raw("UPDATE category SET name = name WHERE 0")),
        ]);
        return "built, not run";
      }
    ),
    createMixedOneOf: os.things.createMixedOneOf.handler(
      async ({ context }) => {
        await context.db.batch([
          buildAuditStatement(
            context.db,
            SCHEMAS,
            entry(context.user.id, "gesture.create", "t-mixed")
          ),
          buildAuditStatement(
            context.db,
            SCHEMAS,
            entry(context.user.id, "gesture.delete", "t-mixed")
          ),
        ]);
        return "mixed";
      }
    ),
    createNothing: os.things.createNothing.handler(async ({ context }) => {
      await context.db.run(sql.raw("UPDATE category SET name = name WHERE 0"));
      return "no audit";
    }),
    createOneOf: os.things.createOneOf.handler(async ({ context }) => {
      await context.db.batch([
        buildAuditStatement(
          context.db,
          SCHEMAS,
          entry(context.user.id, "gesture.delete", "t-one-of")
        ),
      ]);
      return "one of";
    }),
    createOutsideOneOf: os.things.createOutsideOneOf.handler(
      async ({ context }) => {
        await context.db.batch([
          buildAuditStatement(
            context.db,
            SCHEMAS,
            entry(context.user.id, "gesture.create", "t-outside")
          ),
        ]);
        return "outside";
      }
    ),
    createTwoKinds: os.things.createTwoKinds.handler(async ({ context }) => {
      await context.db.batch([
        buildAuditStatement(
          context.db,
          SCHEMAS,
          entry(context.user.id, "gesture.create", "t-two")
        ),
        buildAuditStatement(
          context.db,
          SCHEMAS,
          entry(context.user.id, "gesture.delete", "t-two")
        ),
      ]);
      return "two";
    }),
    createUnbuiltAudit: os.things.createUnbuiltAudit.handler(
      async ({ context }) => {
        await context.db.batch([
          buildAuditStatement(
            context.db,
            SCHEMAS,
            entry(context.user.id, "gesture.create", "t-unbuilt")
          ),
          // An audit_log insert that skipped the writer (and its schema).
          context.db.run(
            sql.raw("INSERT INTO audit_log SELECT * FROM audit_log WHERE 0")
          ),
        ]);
        return "unbuilt audit";
      }
    ),
    createUnchanged: os.things.createUnchanged.handler(({ context }) => {
      markUnchanged(context.db);
      return "unchanged";
    }),
    createUnchangedAudited: os.things.createUnchangedAudited.handler(
      async ({ context }) => {
        markUnchanged(context.db);
        await writeAuditWith(
          context.db,
          SCHEMAS,
          entry(context.user.id, "gesture.create", "t-unchanged")
        );
        return "unchanged, audited";
      }
    ),
    createWrong: os.things.createWrong.handler(async ({ context }) => {
      await context.db.batch([
        buildAuditStatement(
          context.db,
          SCHEMAS,
          entry(context.user.id, "gesture.delete", "t-wrong")
        ),
      ]);
      return "wrong";
    }),
    exempt: os.things.exempt.handler(() => "exempt"),
    exemptAudited: os.things.exemptAudited.handler(async ({ context }) => {
      await context.db.batch([
        buildAuditStatement(
          context.db,
          SCHEMAS,
          entry(context.user.id, "gesture.create", "t-exempt")
        ),
      ]);
      return "exempt, audited";
    }),
    exemptRawAudit: os.things.exemptRawAudit.handler(async ({ context }) => {
      await context.db.run(
        sql.raw('INSERT INTO "audit_log" SELECT * FROM audit_log WHERE 0')
      );
      return "exempt, raw audit";
    }),
    list: os.things.list.handler(async ({ context }) => {
      await context.db.run(sql.raw("SELECT 1"));
      await context.kv.get("anything");
      return "read";
    }),
    listAuthHandler: os.things.listAuthHandler.handler(async ({ context }) => {
      await context.auth.handler(new Request("https://smog.test/api/auth/ok"));
      return "auth handler";
    }),
    listAuthRead: os.things.listAuthRead.handler(async ({ context }) => {
      const session = await context.auth.api.getSession({
        headers: context.request.headers,
      });
      return session?.user.id === context.user.id ? "auth read" : "no session";
    }),
    listAuthWrite: os.things.listAuthWrite.handler(async ({ context }) => {
      await context.auth.api.banUser({
        body: { userId: context.user.id },
        headers: context.request.headers,
      });
      return "banned";
    }),
    listBuildsAudit: os.things.listBuildsAudit.handler(({ context }) => {
      buildAuditStatement(
        context.db,
        SCHEMAS,
        entry(context.user.id, "gesture.create", "t-read")
      );
      return "built";
    }),
    listDeletes: os.things.listDeletes.handler(async ({ context }) => {
      await context.db.run(sql.raw("DELETE FROM category WHERE 0"));
      return "deleted";
    }),
    listKvDelete: os.things.listKvDelete.handler(async ({ context }) => {
      await context.kv.delete("guard:kv");
      return "kv delete";
    }),
    listKvPut: os.things.listKvPut.handler(async ({ context }) => {
      await context.kv.put("guard:kv", "written");
      return "kv put";
    }),
    listWithInsert: os.things.listWithInsert.handler(async ({ context }) => {
      await context.db.run(
        "WITH x AS (SELECT 1) INSERT INTO audit_log SELECT * FROM audit_log WHERE 0"
      );
      return "with insert";
    }),
    listWrites: os.things.listWrites.handler(async ({ context }) => {
      await context.db.batch([
        buildAuditStatement(
          context.db,
          SCHEMAS,
          entry(context.user.id, "gesture.create", "t-read-write")
        ),
      ]);
      return "wrote";
    }),
    unchangedAfterKvPut: os.things.unchangedAfterKvPut.handler(
      async ({ context }) => {
        await context.kv.put(KV_KEY, "written before the mark");
        markUnchanged(context.db);
        return "marked after a write";
      }
    ),
    unchangedThenD1Update: os.things.unchangedThenD1Update.handler(
      async ({ context }) => {
        markUnchanged(context.db);
        await context.db.run(
          sql`UPDATE user SET name = 'Changed' WHERE id = ${context.user.id}`
        );
        return "updated after the mark";
      }
    ),
    unchangedThenKvPut: os.things.unchangedThenKvPut.handler(
      async ({ context }) => {
        markUnchanged(context.db);
        await context.kv.put(KV_KEY, "written after the mark");
        return "put after the mark";
      }
    ),
    unchangedWithoutNoop: os.things.unchangedWithoutNoop.handler(
      ({ context }) => {
        markUnchanged(context.db);
        return "no noop kind";
      }
    ),
    unclassified: os.things.unclassified.handler(() => "unclassified"),
    writeAfterExternal: os.things.writeAfterExternal.handler(
      async ({ context }) => {
        await writeAuditWith(
          context.db,
          SCHEMAS,
          entry(context.user.id, "gesture.create", "t-external")
        );
        return "external";
      }
    ),
  },
});

let admin: Authed;

async function run(
  name: keyof typeof testContract.things,
  path: string[] = ["things", name]
): Promise<string> {
  return (await call(router.things[name], undefined, {
    context: await contextAs(admin),
    path,
  })) as string;
}

const INTERNAL = { code: "INTERNAL_SERVER_ERROR" };

beforeAll(async () => {
  admin = await signedUp("admin");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function quiet() {
  return vi.spyOn(console, "error").mockImplementation(() => {
    // The guard's failures are the point of these tests.
  });
}

describe("the admin guard: reads", () => {
  it("lets a read select and read KV", async () => {
    await expect(run("list")).resolves.toBe("read");
  });

  it("stops a read that writes D1, before it reaches D1", async () => {
    const logged = quiet();
    const mark = await auditMark();
    await expect(run("listWrites")).rejects.toMatchObject(INTERNAL);
    await expect(run("listDeletes")).rejects.toMatchObject(INTERNAL);
    await expect(run("listWithInsert")).rejects.toMatchObject(INTERNAL);
    expect(await auditRowsSince(mark)).toEqual([]);
    expect(logged).toHaveBeenCalled();
  });

  it("stops a read that writes KV", async () => {
    quiet();
    await env.KV.put("guard:kv", "before");
    await expect(run("listKvPut")).rejects.toMatchObject(INTERNAL);
    await expect(run("listKvDelete")).rejects.toMatchObject(INTERNAL);
    expect(await env.KV.get("guard:kv")).toBe("before");
  });

  it("fails a read that builds an audit entry, even unexecuted", async () => {
    const logged = quiet();
    await expect(run("listBuildsAudit")).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      "[admin] things.listBuildsAudit is a read but built an audit entry"
    );
  });
});

describe("the admin guard: reads and Better Auth", () => {
  it("lets a read call Better Auth's read methods", async () => {
    await expect(run("listAuthRead")).resolves.toBe("auth read");
    for (const method of AUTH_READ_METHODS) {
      expect(typeof admin.auth.api[method]).toBe("function");
    }
  });

  it("stops a read that calls a Better Auth write, before it runs", async () => {
    const logged = quiet();
    await expect(run("listAuthWrite")).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        message:
          "[admin] A read procedure tried to write (things.listAuthWrite): auth.api.banUser",
      })
    );
    const row = await env.DB.prepare("SELECT banned FROM user WHERE id = ?")
      .bind(admin.user.id)
      .first<{ banned: number | null }>();
    expect(row?.banned ?? 0).toBe(0);
  });

  it("gives a read nothing of Better Auth beyond its read methods", async () => {
    const logged = quiet();
    await expect(run("listAuthHandler")).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        message:
          "[admin] A read procedure tried to write (things.listAuthHandler): auth.handler",
      })
    );
  });
});

describe("the admin guard: mutations", () => {
  it("passes a mutation that built its mapped entry (batch or standalone)", async () => {
    const mark = await auditMark();
    await expect(run("create")).resolves.toBe("created");
    await expect(run("writeAfterExternal")).resolves.toBe("external");
    expect((await auditRowsSince(mark)).map((row) => row.targetId)).toEqual([
      "t-create",
      "t-external",
    ]);
  });

  it("fails a mutation without its entry, with the log line", async () => {
    const logged = quiet();
    await expect(run("createNothing")).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      "[admin] things.createNothing finished without its audit entry"
    );
  });

  it("fails a mutation whose built entry never reached D1", async () => {
    const logged = quiet();
    const mark = await auditMark();
    await expect(run("createBuiltNotRun")).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      "[admin] things.createBuiltNotRun built 1 audit entry but ran 0 audit_log inserts"
    );
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("fails a mutation that ran an audit_log insert it did not build", async () => {
    const logged = quiet();
    await expect(run("createUnbuiltAudit")).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      "[admin] things.createUnbuiltAudit built 1 audit entry but ran 2 audit_log inserts"
    );
    await expect(run("exemptRawAudit")).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      "[admin] things.exemptRawAudit is exempt but ran 1 audit_log insert"
    );
  });

  it("fails a mutation that built another action, or more than its own", async () => {
    quiet();
    await expect(run("createWrong")).rejects.toMatchObject(INTERNAL);
    await expect(run("createTwoKinds")).rejects.toMatchObject(INTERNAL);
  });

  it("passes a one-of kind for any of its actions, and fails another", async () => {
    const logged = quiet();
    await expect(run("createOneOf")).resolves.toBe("one of");
    await expect(run("createOutsideOneOf")).rejects.toMatchObject(INTERNAL);
    await expect(run("createMixedOneOf")).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      "[admin] things.createMixedOneOf built gesture.create, gesture.delete: a one-of kind writes one of its actions"
    );
    expect(logged).toHaveBeenCalledWith(
      "[admin] things.createOutsideOneOf built gesture.create, not only gesture.delete"
    );
  });

  it("passes a noop kind that marks itself unchanged, without an entry", async () => {
    const mark = await auditMark();
    await expect(run("createUnchanged")).resolves.toBe("unchanged");
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("refuses any write after markUnchanged, before it lands", async () => {
    quiet();
    const mark = await auditMark();
    await expect(run("createUnchangedAudited")).rejects.toMatchObject(INTERNAL);
    expect(await auditRowsSince(mark)).toEqual([]);

    await env.KV.put(KV_KEY, "before");
    await expect(run("unchangedThenKvPut")).rejects.toMatchObject(INTERNAL);
    expect(await env.KV.get(KV_KEY)).toBe("before");

    await expect(run("unchangedThenD1Update")).rejects.toMatchObject(INTERNAL);
    const row = await env.DB.prepare("SELECT name FROM user WHERE id = ?")
      .bind(admin.user.id)
      .first<{ name: string }>();
    expect(row?.name).toBe(admin.user.name);
  });

  it("fails markUnchanged after a write, or on a kind without noop", async () => {
    const logged = quiet();
    await expect(run("unchangedAfterKvPut")).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      "[admin] things.unchangedAfterKvPut marked itself unchanged after writing"
    );
    await expect(run("unchangedWithoutNoop")).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      "[admin] things.unchangedWithoutNoop has no noop kind, so it cannot be unchanged"
    );
  });

  it("passes an exempt mutation, and fails one that audits", async () => {
    quiet();
    await expect(run("exempt")).resolves.toBe("exempt");
    await expect(run("exemptAudited")).rejects.toMatchObject(INTERNAL);
  });
});

describe("the admin guard: paths", () => {
  it("finds the kind under the app router's `admin` mount", async () => {
    await expect(run("list", ["admin", "things", "list"])).resolves.toBe(
      "read"
    );
  });

  it("fails closed on a procedure without a kind, or without a path", async () => {
    const logged = quiet();
    await expect(run("unclassified")).rejects.toMatchObject(INTERNAL);
    await expect(run("list", [])).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      "[admin] things.unclassified has no procedure kind"
    );
  });

  it("runs after requireAdmin: a guest never reaches it", async () => {
    await expect(
      call(router.things.unclassified, undefined, {
        context: await contextAs(null),
        path: ["things", "unclassified"],
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
