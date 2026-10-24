// biome-ignore-all lint/performance/noAwaitInLoops: one account after the other.
import { env, exports } from "cloudflare:workers";
import { pngBytes } from "@smog/lessons/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { ORIGIN, signedUp } from "./helpers";

/*
 * Phase 10c task 3: the drawings through the whole stack (real Better Auth
 * sessions in D1, the real router and routes). A teacher or an admin changes
 * drawings; a translator reads them and changes nothing; a plain account and
 * a guest reach none of it, the image route included; a banned teacher reads
 * as a guest at once and a demoted one on the next request. The table of who
 * may call what is `packages/api/test/authz.test.ts`.
 */

if (!env.DB) {
  throw new Error("[test] The DB binding is missing");
}
const d1: D1Database = env.DB;

const GESTURE_ID = "7d0c1a52-9a3e-4a0b-8a54-0f5f3c1b2e21";
const PATH = `/api/teacher/drawings/${GESTURE_ID}/1`;

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

async function image(cookie?: string): Promise<number> {
  const response = await exports.default.fetch(`${ORIGIN}${PATH}`, {
    headers: {
      "cf-connecting-ip": crypto.randomUUID(),
      ...(cookie ? { cookie } : {}),
    },
  });
  await response.arrayBuffer();
  return response.status;
}

type Held = "admin" | "teacher" | "translator" | null;

async function account(
  held: Held
): Promise<{ cookie: string; email: string; id: string }> {
  const signed = await signedUp();
  const { id } = (await rpc("account/me", {}, signed.cookie)).body.json as {
    id: string;
  };
  if (held === "admin") {
    await d1
      .prepare("UPDATE user SET role = 'admin' WHERE id = ?")
      .bind(id)
      .run();
  } else if (held) {
    await d1
      .prepare(
        "INSERT INTO user_role (user_id, role, granted_at) VALUES (?, ?, ?)"
      )
      .bind(id, held, Date.now())
      .run();
  }
  return { ...signed, id };
}

const UPLOAD = {
  contentType: "image/png",
  gestureId: GESTURE_ID,
  size: 100,
  step: 1,
};
const FINALIZE = {
  credit: "",
  gestureId: GESTURE_ID,
  key: `teacher/drawings/${GESTURE_ID}/1/${crypto.randomUUID()}`,
  step: 1,
};
const DELETE = { gestureId: GESTURE_ID, step: 1 };
const LIST = { gestureId: GESTURE_ID };

const WRITES = [
  ["teacher/uploadDrawing", UPLOAD],
  ["teacher/finalizeDrawing", FINALIZE],
  ["teacher/deleteDrawing", DELETE],
] as const;

async function codes(
  calls: readonly (readonly [string, unknown])[],
  cookie?: string
): Promise<[string, number, string | undefined][]> {
  return await Promise.all(
    calls.map(async ([path, input]) => {
      const answer = await rpc(path, input, cookie);
      return [path, answer.status, code(answer)] as [
        string,
        number,
        string | undefined,
      ];
    })
  );
}

beforeAll(async () => {
  await d1
    .prepare(
      "INSERT OR IGNORE INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES (?, 'drawing-authz', 'Drawing authz', 'drawing authz', 'pb', 1, 1)"
    )
    .bind(GESTURE_ID)
    .run();
});

describe("a guest and a plain account", () => {
  it("reach no drawing procedure and not the image route", async () => {
    for (const [path, status, error] of await codes([
      ...WRITES,
      ["teacher/listDrawings", LIST],
    ])) {
      expect([path, status, error]).toEqual([path, 401, "UNAUTHORIZED"]);
    }
    expect(await image()).toBe(401);
    const learner = await account(null);
    for (const [path, status, error] of await codes(
      [...WRITES, ["teacher/listDrawings", LIST]],
      learner.cookie
    )) {
      expect([path, status, error]).toEqual([path, 403, "FORBIDDEN"]);
    }
    expect(await image(learner.cookie)).toBe(403);
  });
});

describe("a translator", () => {
  it("reads the drawings and the image, and changes nothing", async () => {
    const worker = await account("translator");
    expect(
      (await rpc("teacher/listDrawings", LIST, worker.cookie)).status
    ).toBe(200);
    for (const [path, status, error] of await codes(WRITES, worker.cookie)) {
      expect([path, status, error]).toEqual([path, 403, "FORBIDDEN"]);
    }
    // An allowed role gets a 404, not a 403, for a drawing that is not there.
    expect(await image(worker.cookie)).toBe(404);
  });
});

describe("a teacher and an admin", () => {
  it("reach every drawing procedure, under their own name in the audit", async () => {
    for (const held of ["teacher", "admin"] as const) {
      const holder = await account(held);
      const upload = await rpc("teacher/uploadDrawing", UPLOAD, holder.cookie);
      expect(upload.status, held).toBe(200);
      const ticket = upload.body.json as { key: string; uploadUrl: string };
      const stored = await exports.default.fetch(ticket.uploadUrl, {
        body: pngBytes(16, 16),
        headers: {
          "cf-connecting-ip": crypto.randomUUID(),
          "content-type": "image/png",
          origin: ORIGIN,
        },
        method: "PUT",
      });
      expect(stored.status, held).toBe(200);
      const finalized = await rpc(
        "teacher/finalizeDrawing",
        { ...FINALIZE, key: ticket.key },
        holder.cookie
      );
      expect(finalized.status, held).toBe(200);
      expect(await image(holder.cookie)).toBe(200);
      const row = await d1
        .prepare(
          "SELECT actor_id AS actorId, data FROM audit_log WHERE action = 'teacher.drawing_upload' AND actor_id = ?"
        )
        .bind(holder.id)
        .first<{ actorId: string; data: string }>();
      expect(row?.actorId, held).toBe(holder.id);
      const removed = await rpc("teacher/deleteDrawing", DELETE, holder.cookie);
      expect(removed.body.json, held).toEqual({ deleted: true });
    }
  });
});

describe("a teacher who loses the role or the account", () => {
  it("is refused on the next request after a demotion, the image route included", async () => {
    const teacher = await account("teacher");
    expect(
      (await rpc("teacher/uploadDrawing", UPLOAD, teacher.cookie)).status
    ).toBe(200);
    expect(await image(teacher.cookie)).toBe(404);
    await d1
      .prepare("DELETE FROM user_role WHERE user_id = ?")
      .bind(teacher.id)
      .run();
    expect(
      (await rpc("teacher/uploadDrawing", UPLOAD, teacher.cookie)).status
    ).toBe(403);
    expect(await image(teacher.cookie)).toBe(403);
  });

  it("reads as a guest at once when banned, the image route included", async () => {
    const teacher = await account("teacher");
    expect(
      (await rpc("teacher/listDrawings", LIST, teacher.cookie)).status
    ).toBe(200);
    const boss = await account("admin");
    const ban = await rpc(
      "admin/users/ban",
      { reason: "Spam", userId: teacher.id },
      boss.cookie
    );
    expect(ban.status).toBe(200);
    for (const [path, status, error] of await codes(
      [...WRITES, ["teacher/listDrawings", LIST]],
      teacher.cookie
    )) {
      expect([path, status, error]).toEqual([path, 401, "UNAUTHORIZED"]);
    }
    expect(await image(teacher.cookie)).toBe(401);
  });
});
