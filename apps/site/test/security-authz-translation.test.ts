import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ORIGIN, signedUp } from "./helpers";

/*
 * Phase 10b task 4: the translator role through the whole stack (real Better
 * Auth sessions in D1, the real router): a translator reaches the
 * translation procedures and nothing of the admin's, a learner and a guest
 * reach none of them, and taking the role away applies on the next request.
 * The table of who may call what is `packages/api/test/authz.test.ts`.
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

/** A signed-in account holding the translator role. */
async function translator(): Promise<{ cookie: string; id: string }> {
  const account = await signedUp();
  const { id } = (await rpc("account/me", {}, account.cookie)).body.json as {
    id: string;
  };
  await d1
    .prepare(
      "INSERT INTO user_role (user_id, role, granted_at) VALUES (?, 'translator', ?)"
    )
    .bind(id, Date.now())
    .run();
  return { cookie: account.cookie, id };
}

describe("a translator", () => {
  it("reaches the translation procedures and nothing of the admin's", async () => {
    const worker = await translator();
    const whoami = (await rpc("system/whoami", {}, worker.cookie)).body
      .json as { user: { roles: string[] } };
    expect(whoami.user.roles).toEqual(["translator"]);
    expect(
      (await rpc("translation/strings/list", { limit: 1 }, worker.cookie))
        .status
    ).toBe(200);
    expect((await rpc("translation/coverage", {}, worker.cookie)).status).toBe(
      200
    );
    // The language screen is the admin's.
    const created = await rpc(
      "translation/languages/create",
      { code: "de", intlTag: "de-BE", name: "Deutsch" },
      worker.cookie
    );
    expect(created.status).toBe(403);
    expect(code(created)).toBe("FORBIDDEN");
    const answers = await Promise.all(
      [
        "admin/dashboard",
        "admin/users/list",
        "admin/audit/list",
        "admin/sponsorships/list",
        "admin/emails/list",
        "admin/deadLetters/list",
      ].map(async (path) => {
        const answer = await rpc(path, {}, worker.cookie);
        return [path, answer.status, code(answer)] as const;
      })
    );
    for (const [path, status, error] of answers) {
      expect([path, status, error]).toEqual([path, 403, "FORBIDDEN"]);
    }
  });

  it("is refused on the translation procedures as a guest or a plain learner", async () => {
    expect((await rpc("translation/strings/list", {})).status).toBe(401);
    const learner = await signedUp();
    const refused = await rpc("translation/strings/list", {}, learner.cookie);
    expect(refused.status).toBe(403);
    expect(code(refused)).toBe("FORBIDDEN");
  });

  it("loses the access on the next request when the role is taken away", async () => {
    const worker = await translator();
    expect(
      (await rpc("translation/strings/list", { limit: 1 }, worker.cookie))
        .status
    ).toBe(200);
    await d1
      .prepare("DELETE FROM user_role WHERE user_id = ?")
      .bind(worker.id)
      .run();
    expect(
      (await rpc("translation/strings/list", { limit: 1 }, worker.cookie))
        .status
    ).toBe(403);
  });

  it("saves a string with its audit entry, under the translator's name", async () => {
    const worker = await translator();
    const saved = await rpc(
      "translation/strings/save",
      {
        expectedUpdatedAt: null,
        key: "auth.errors.generic",
        locale: "en",
        value: "Authz test text",
      },
      worker.cookie
    );
    expect(saved.status).toBe(200);
    const row = await d1
      .prepare(
        "SELECT action, actor_id AS actorId FROM audit_log WHERE target_id = 'en:auth.errors.generic' ORDER BY created_at DESC LIMIT 1"
      )
      .first<{ action: string; actorId: string }>();
    expect(row).toEqual({
      action: "translation.string_save",
      actorId: worker.id,
    });
    await d1.prepare("DELETE FROM ui_string").run();
  });
});
