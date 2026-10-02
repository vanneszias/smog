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
import { adminGuard, type GuardKind } from "../src/server/guard";
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
    createNothing: ok,
    createOneOf: ok,
    createOutsideOneOf: ok,
    createTwoKinds: ok,
    createWrong: ok,
    exempt: ok,
    exemptAudited: ok,
    list: ok,
    listBuildsAudit: ok,
    listDeletes: ok,
    listKvDelete: ok,
    listKvPut: ok,
    listWithInsert: ok,
    listWrites: ok,
    unclassified: ok,
    writeAfterExternal: ok,
  },
};

const KINDS: Record<string, GuardKind> = {
  "things.create": { audit: "gesture.create" },
  "things.createNothing": { audit: "gesture.create" },
  "things.createOneOf": { audit: ["gesture.create", "gesture.delete"] },
  "things.createOutsideOneOf": { audit: ["gesture.delete"] },
  "things.createTwoKinds": { audit: "gesture.create" },
  "things.createWrong": { audit: "gesture.create" },
  "things.exempt": { exempt: "changes no stored state" },
  "things.exemptAudited": { exempt: "changes no stored state" },
  "things.list": "read",
  "things.listBuildsAudit": "read",
  "things.listDeletes": "read",
  "things.listKvDelete": "read",
  "things.listKvPut": "read",
  "things.listWithInsert": "read",
  "things.listWrites": "read",
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
    list: os.things.list.handler(async ({ context }) => {
      await context.db.run(sql.raw("SELECT 1"));
      await context.kv.get("anything");
      return "read";
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

  it("fails a mutation that built another action, or more than its own", async () => {
    quiet();
    await expect(run("createWrong")).rejects.toMatchObject(INTERNAL);
    await expect(run("createTwoKinds")).rejects.toMatchObject(INTERNAL);
  });

  it("passes a one-of kind for any of its actions, and fails another", async () => {
    const logged = quiet();
    await expect(run("createOneOf")).resolves.toBe("one of");
    await expect(run("createOutsideOneOf")).rejects.toMatchObject(INTERNAL);
    expect(logged).toHaveBeenCalledWith(
      "[admin] things.createOutsideOneOf built gesture.create, not only gesture.delete"
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
