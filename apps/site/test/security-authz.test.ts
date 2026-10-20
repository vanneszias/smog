import { env, exports } from "cloudflare:workers";
import { createTestDb, makeGesture } from "@smog/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { ORIGIN, signedUp } from "./helpers";

/*
 * Phase 9 task 8: authorization through the whole stack (real Better Auth
 * sessions in D1, the real router), the cases the router-level table in
 * `packages/api/test/authz.test.ts` cannot show with stub bindings:
 * a banned user is refused everywhere at once, and one user cannot read or
 * change another user's favorites, lists or account export. The `view` vs
 * `edit` share-token rules are in `packages/features/lists/test/sharing.test.ts`.
 */

const db = createTestDb({ DB: env.DB });

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

let alice: { cookie: string; email: string };
let bob: { cookie: string; email: string };
let gestureId = "";
let listId = "";

beforeAll(async () => {
  alice = await signedUp();
  bob = await signedUp();
  const gesture = await makeGesture(db, {
    name: "Authz",
    publishedAt: new Date(),
    slug: `authz-${crypto.randomUUID()}`,
  });
  gestureId = gesture.id;
  const created = await rpc("lists/create", { name: "Alice" }, alice.cookie);
  expect(created.status).toBe(200);
  listId = (created.body.json as { id: string }).id;
  expect((await rpc("favorites/add", { gestureId }, alice.cookie)).status).toBe(
    200
  );
});

describe("one user against another's data", () => {
  it("never answers or changes another user's list", async () => {
    const answers: [string, Promise<RpcAnswer>][] = [];
    for (const [path, input] of [
      ["lists/get", { id: listId }],
      ["lists/update", { id: listId, name: "Mine now" }],
      ["lists/delete", { id: listId }],
      ["lists/addItem", { gestureId, id: listId }],
      ["lists/removeItem", { gestureId, id: listId }],
      ["lists/reorder", { gestureIds: [], id: listId }],
      ["lists/share/create", { id: listId, role: "edit" }],
      ["lists/share/get", { id: listId }],
      ["lists/share/revoke", { id: listId, role: "view" }],
    ] as const) {
      answers.push([path, rpc(path, input, bob.cookie)]);
    }
    const settled = await Promise.all(
      answers.map(async ([path, pending]) => [path, await pending] as const)
    );
    for (const [path, answer] of settled) {
      expect(answer.status, path).toBe(404);
      expect(code(answer), path).toBe("NOT_FOUND");
    }
    // Still there, untouched, for its owner; invisible in Bob's lists.
    const mine = await rpc("lists/get", { id: listId }, alice.cookie);
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.body.json)).toContain("Alice");
    expect(
      JSON.stringify((await rpc("lists/mine", {}, bob.cookie)).body)
    ).not.toContain(listId);
  });

  it("keeps favorites per user: Bob sees none of Alice's, and cannot remove them", async () => {
    expect((await rpc("favorites/ids", {}, bob.cookie)).body.json).toEqual([]);
    await rpc("favorites/remove", { gestureId }, bob.cookie);
    expect((await rpc("favorites/ids", {}, alice.cookie)).body.json).toEqual([
      gestureId,
    ]);
  });

  it("exports only the caller's own account", async () => {
    const aliceExport = await rpc("account/export", {}, alice.cookie);
    const bobExport = await rpc("account/export", {}, bob.cookie);
    expect(aliceExport.status).toBe(200);
    expect(bobExport.status).toBe(200);
    const aliceText = JSON.stringify(aliceExport.body);
    const bobText = JSON.stringify(bobExport.body);
    expect(aliceText).toContain(alice.email);
    expect(aliceText).not.toContain(bob.email);
    expect(bobText).toContain(bob.email);
    expect(bobText).not.toContain(alice.email);
    expect(bobText).not.toContain(listId);
  });
});

describe("a banned user", () => {
  it("is refused at once on every signed-in procedure, and reads as a guest", async () => {
    const carol = await signedUp();
    expect((await rpc("account/me", {}, carol.cookie)).status).toBe(200);
    const { id } = (await rpc("account/me", {}, carol.cookie)).body.json as {
      id: string;
    };
    // The real path: an admin bans her, which also revokes her sessions.
    const boss = await signedUp();
    await env.DB.prepare("UPDATE user SET role = 'admin' WHERE email = ?")
      .bind(boss.email)
      .run();
    const ban = await rpc(
      "admin/users/ban",
      { reason: "Spam", userId: id },
      boss.cookie
    );
    expect(ban.status).toBe(200);
    const answers: [string, Promise<RpcAnswer>][] = [];
    for (const [path, input] of [
      ["account/me", {}],
      ["account/export", {}],
      ["favorites/ids", {}],
      ["lists/mine", {}],
      ["lists/create", { name: "Banned" }],
    ] as const) {
      answers.push([path, rpc(path, input, carol.cookie)]);
    }
    const settled = await Promise.all(
      answers.map(async ([path, pending]) => [path, await pending] as const)
    );
    for (const [path, answer] of settled) {
      expect(answer.status, path).toBe(401);
      expect(code(answer), path).toBe("UNAUTHORIZED");
    }
    expect((await rpc("system/whoami", {}, carol.cookie)).body.json).toEqual({
      user: null,
    });
    // An admin route is no more open to them.
    const admin = await rpc("admin/dashboard", {}, carol.cookie);
    expect(admin.status).toBe(401);
  });
});
