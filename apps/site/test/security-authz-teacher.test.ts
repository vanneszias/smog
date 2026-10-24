import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { ORIGIN, signedUp } from "./helpers";

/*
 * Phase 10c task 2: teacher information through the whole stack (real
 * Better Auth sessions in D1, the real router). A teacher, a translator and
 * an admin reach `teacher.*`; a guest, a learner and a banned account reach
 * none; a translator cannot author the default language; taking a role away
 * applies on the next request. The table of who may call what is
 * `packages/api/test/authz.test.ts`.
 */

if (!env.DB) {
  throw new Error("[test] The DB binding is missing");
}
const d1: D1Database = env.DB;

interface RpcAnswer {
  body: { json?: unknown };
  status: number;
}

async function rpc(
  path: string,
  input: unknown,
  cookie?: string
): Promise<RpcAnswer> {
  const response = await exports.default.fetch(`${ORIGIN}/api/rpc/${path}`, {
    body: JSON.stringify({ json: input ?? {} }),
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    method: "POST",
  });
  return {
    body: (await response.json().catch(() => ({}))) as { json?: unknown },
    status: response.status,
  };
}

function code(answer: RpcAnswer): string | undefined {
  return (answer.body.json as { code?: string } | undefined)?.code;
}

type Role = "admin" | "teacher" | "translator";

/** A signed-in account holding `roles`. */
async function account(
  ...roles: Role[]
): Promise<{ cookie: string; id: string }> {
  const learner = await signedUp();
  const { id } = (await rpc("account/me", {}, learner.cookie)).body.json as {
    id: string;
  };
  await Promise.all(
    roles.map((role) =>
      d1
        .prepare(
          "INSERT INTO user_role (user_id, role, granted_at) VALUES (?, ?, ?)"
        )
        .bind(id, role, Date.now())
        .run()
    )
  );
  return { cookie: learner.cookie, id };
}

const FIELDS = {
  bw: "",
  cNote: "",
  hc: "",
  note: "",
  or: "",
  pl: "",
  summary: "",
};
let gestureId = "";

beforeAll(async () => {
  gestureId = crypto.randomUUID();
  await d1
    .prepare(
      "INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES (?, ?, 'Authz', 'authz', 'pb', 1, 1)"
    )
    .bind(gestureId, `authz-teacher-${gestureId.slice(0, 8)}`)
    .run();
});

function save(locale: string, cookie: string, hc: string) {
  return rpc(
    "teacher/saveInfo",
    {
      expectedVersion: null,
      fields: { ...FIELDS, hc },
      gestureId,
      locale,
    },
    cookie
  );
}

describe("teacher information", () => {
  it("is refused to a guest and to a plain learner, for reading and writing", async () => {
    expect((await rpc("teacher/getInfo", { gestureId })).status).toBe(401);
    expect((await save("fr", "", "x")).status).toBe(401);
    const learner = await signedUp();
    for (const answer of await Promise.all([
      rpc("teacher/getInfo", { gestureId }, learner.cookie),
      save("fr", learner.cookie, "x"),
    ])) {
      expect(answer.status).toBe(403);
      expect(code(answer)).toBe("FORBIDDEN");
    }
  });

  it("is refused to a banned teacher like a guest", async () => {
    const teacher = await account("teacher");
    expect(
      (await rpc("teacher/getInfo", { gestureId }, teacher.cookie)).status
    ).toBe(200);
    const boss = await signedUp();
    await d1
      .prepare("UPDATE user SET role = 'admin' WHERE email = ?")
      .bind(boss.email)
      .run();
    const ban = await rpc(
      "admin/users/ban",
      { reason: "Spam", userId: teacher.id },
      boss.cookie
    );
    expect(ban.status).toBe(200);
    for (const answer of await Promise.all([
      rpc("teacher/getInfo", { gestureId }, teacher.cookie),
      save("fr", teacher.cookie, "banned"),
    ])) {
      expect(answer.status).toBe(401);
      expect(code(answer)).toBe("UNAUTHORIZED");
    }
  });

  it("lets a teacher write any language and an admin too, under their own name", async () => {
    const teacher = await account("teacher");
    const nl = await save("nl", teacher.cookie, "vlakke hand");
    expect(nl.status).toBe(200);
    expect(nl.body.json).toEqual({ version: 1 });
    const row = await d1
      .prepare(
        "SELECT action, actor_id AS actorId FROM audit_log WHERE target_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .bind(`${gestureId}:nl`)
      .first<{ action: string; actorId: string }>();
    expect(row).toEqual({ action: "teacher.info_save", actorId: teacher.id });
    const admin = await account("admin");
    expect((await save("fr", admin.cookie, "main plate")).status).toBe(200);
  });

  it("lets a translator read and translate, but not author the default language", async () => {
    const translator = await account("translator");
    expect(
      (await rpc("teacher/getInfo", { gestureId }, translator.cookie)).status
    ).toBe(200);
    expect((await save("en", translator.cookie, "flat hand")).status).toBe(200);
    const refused = await save("nl", translator.cookie, "nee");
    expect(refused.status).toBe(403);
    expect(code(refused)).toBe("FORBIDDEN");
    const both = await account("translator", "teacher");
    expect((await save("nl", both.cookie, "wel")).status).toBeLessThan(500);
  });

  it("loses the access on the next request when the role is taken away", async () => {
    const teacher = await account("teacher");
    expect(
      (await rpc("teacher/getInfo", { gestureId }, teacher.cookie)).status
    ).toBe(200);
    await d1
      .prepare("DELETE FROM user_role WHERE user_id = ?")
      .bind(teacher.id)
      .run();
    expect(
      (await rpc("teacher/getInfo", { gestureId }, teacher.cookie)).status
    ).toBe(403);
  });
});
