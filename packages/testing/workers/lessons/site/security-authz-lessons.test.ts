import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ORIGIN, signedUp } from "../../shared/site/helpers";

/*
 * Phase 10c task 4: the lessons through the whole stack (real Better Auth
 * sessions in D1, the real router). A teacher and an admin reach `lessons.*`;
 * a guest, a learner, a translator and a banned account reach none; every
 * teacher reads every lesson but only its author (or an admin) changes or
 * deletes it; taking the role away applies on the next request. The table of
 * who may call what is `packages/testing/workers/shared/api/service/authz.test.ts`.
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

async function createLesson(cookie: string): Promise<string> {
  const answer = await rpc(
    "lessons/create",
    { locale: "nl", title: "Les 1" },
    cookie
  );
  expect(answer.status).toBe(200);
  return (answer.body.json as { id: string }).id;
}

function saveBody(id: string, extra: object = {}) {
  return {
    expectedVersion: 1,
    id,
    number: null,
    sections: [],
    translations: { nl: { notes: "", title: "Overgenomen" } },
    ungrouped: [],
    ...extra,
  };
}

describe("lessons", () => {
  it("are refused to a guest, a plain learner and a translator, for reading and writing", async () => {
    const teacher = await account("teacher");
    const id = await createLesson(teacher.cookie);
    const learner = await signedUp();
    const translator = await account("translator");
    const calls: [string, unknown][] = [
      ["lessons/list", {}],
      ["lessons/get", { id }],
      ["lessons/create", { locale: "nl", title: "Nee" }],
      ["lessons/update", saveBody(id)],
      ["lessons/duplicate", { id }],
      ["lessons/delete", { id }],
      ["lessons/readiness", { id, locale: "nl" }],
      ["lessons/exportPreview", { id, locale: "nl", template: "teachers" }],
      ["lessons/gestureMarkers", { gestureIds: [] }],
    ];
    for (const [path, input] of calls) {
      // biome-ignore lint/performance/noAwaitInLoops: a handful of calls, in order for a readable failure.
      const guest = await rpc(path, input);
      expect(guest.status, path).toBe(401);
      for (const cookie of [learner.cookie, translator.cookie]) {
        // biome-ignore lint/performance/noAwaitInLoops: same.
        const refused = await rpc(path, input, cookie);
        expect(refused.status, path).toBe(403);
        expect(code(refused), path).toBe("FORBIDDEN");
      }
    }
  });

  it("are refused to a banned teacher like a guest", async () => {
    const teacher = await account("teacher");
    expect((await rpc("lessons/list", {}, teacher.cookie)).status).toBe(200);
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
      rpc("lessons/list", {}, teacher.cookie),
      rpc("lessons/create", { locale: "nl", title: "Nee" }, teacher.cookie),
    ])) {
      expect(answer.status).toBe(401);
      expect(code(answer)).toBe("UNAUTHORIZED");
    }
  });

  it("are read by every teacher but changed only by the author or an admin", async () => {
    const author = await account("teacher");
    const other = await account("teacher");
    const admin = await account("admin");
    const id = await createLesson(author.cookie);
    expect((await rpc("lessons/get", { id }, other.cookie)).status).toBe(200);
    for (const [path, input] of [
      ["lessons/update", saveBody(id)],
      ["lessons/delete", { id }],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: two calls, in order.
      const refused = await rpc(path, input, other.cookie);
      expect(refused.status, path).toBe(403);
    }
    // Another teacher may duplicate: the copy is theirs.
    const copy = await rpc("lessons/duplicate", { id }, other.cookie);
    expect(copy.status).toBe(200);
    const copyId = (copy.body.json as { id: string }).id;
    expect(
      (await rpc("lessons/delete", { id: copyId }, other.cookie)).status
    ).toBe(200);
    // The original is untouched and the author, then an admin, may change it.
    expect(
      (await rpc("lessons/update", saveBody(id), author.cookie)).status
    ).toBe(200);
    expect(
      (
        await rpc(
          "lessons/update",
          saveBody(id, { expectedVersion: 2 }),
          admin.cookie
        )
      ).status
    ).toBe(200);
    expect((await rpc("lessons/delete", { id }, admin.cookie)).status).toBe(
      200
    );
    expect((await rpc("lessons/get", { id }, author.cookie)).status).toBe(404);
  });

  it("do not take an unpublished gesture a teacher guessed the id of", async () => {
    const teacher = await account("teacher");
    const id = await createLesson(teacher.cookie);
    const hidden = crypto.randomUUID();
    await d1
      .prepare(
        "INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES (?, ?, 'Geheim', 'geheim', 'pb', 1, 1)"
      )
      .bind(hidden, `hidden-${hidden.slice(0, 8)}`)
      .run();
    const refused = await rpc(
      "lessons/update",
      saveBody(id, { ungrouped: [hidden] }),
      teacher.cookie
    );
    expect(refused.status).toBe(422);
    expect(JSON.stringify(refused.body)).toContain("unpublished");
    const lesson = await rpc("lessons/get", { id }, teacher.cookie);
    expect(JSON.stringify(lesson.body)).not.toContain("Geheim");
  });

  it("lose the access on the next request when the role is taken away", async () => {
    const teacher = await account("teacher");
    expect((await rpc("lessons/list", {}, teacher.cookie)).status).toBe(200);
    await d1
      .prepare("DELETE FROM user_role WHERE user_id = ?")
      .bind(teacher.id)
      .run();
    expect((await rpc("lessons/list", {}, teacher.cookie)).status).toBe(403);
  });
});
