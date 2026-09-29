import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import type { User } from "@smog/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addGestures,
  addUser,
  contextFor,
  router,
  storedItems,
} from "./helpers";

const SITE_URL = "http://localhost:5173";
/** `newToken()`: 32 bytes, base64url. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

let owner: User;
let listId: string;
let gestureIds: string[];

beforeEach(async () => {
  owner = await addUser("Anna");
  gestureIds = await addGestures(["Hond", "Kat"]);
  const created = await call(
    router.create,
    { description: "Voor de klas", name: "Dieren" },
    contextFor(owner)
  );
  listId = created.id;
  await call(
    router.addItem,
    { gestureId: gestureIds[0] as string, id: listId },
    contextFor(owner)
  );
});

async function share(role: "view" | "edit") {
  return await call(
    router.share.create,
    { id: listId, role },
    contextFor(owner)
  );
}

describe("share links (owner)", () => {
  it("creates one active link per role and returns it again", async () => {
    const view = await share("view");
    const again = await share("view");
    const edit = await share("edit");

    expect(again).toEqual(view);
    expect(view.token).toMatch(TOKEN);
    expect(view.url).toBe(`${SITE_URL}/lists/${view.token}`);
    expect(edit.token).not.toBe(view.token);
    expect(
      await call(router.share.get, { id: listId }, contextFor(owner))
    ).toEqual({ edit, view });
  });

  it("revoking 404s the link at once; creating again gives a new token", async () => {
    const view = await share("view");
    const edit = await share("edit");

    await call(
      router.share.revoke,
      { id: listId, role: "view" },
      contextFor(owner)
    );

    await expect(
      call(router.shared.get, { token: view.token }, contextFor(null))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      await call(router.share.get, { id: listId }, contextFor(owner))
    ).toEqual({ edit, view: null });
    // The edit link is independent.
    expect(
      (await call(router.shared.get, { token: edit.token }, contextFor(null)))
        .role
    ).toBe("edit");

    const regenerated = await share("view");
    expect(regenerated.token).not.toBe(view.token);
    const rows = await env.DB.prepare(
      "SELECT count(*) AS n FROM list_share WHERE list_id = ? AND role = 'view'"
    )
      .bind(listId)
      .first<{ n: number }>();
    expect(rows?.n).toBe(2);
    // Revoking what is not there is a no-op.
    await call(
      router.share.revoke,
      { id: listId, role: "view" },
      contextFor(owner)
    );
    await call(
      router.share.revoke,
      { id: listId, role: "view" },
      contextFor(owner)
    );
  });

  it("concurrent creates still leave one active link", async () => {
    const links = await Promise.all([
      share("edit"),
      share("edit"),
      share("edit"),
    ]);

    expect(new Set(links.map((link) => link.token)).size).toBe(1);
  });
});

describe("shared view (public)", () => {
  it("shows the list, the owner's name and the published items, without a session", async () => {
    const view = await share("view");

    const shared = await call(
      router.shared.get,
      { token: view.token },
      contextFor(null)
    );

    expect(shared).toEqual({
      items: [
        expect.objectContaining({
          id: gestureIds[0],
          name: "Hond",
          position: 0,
        }),
      ],
      list: { description: "Voor de klas", name: "Dieren", ownerName: "Anna" },
      role: "view",
    });
    expect(JSON.stringify(shared)).not.toContain(owner.email);
    expect(JSON.stringify(shared)).not.toContain(owner.id);
  });

  it("falls back to a localised owner name when the name is empty", async () => {
    const nameless = await addUser("   ");
    const created = await call(
      router.create,
      { name: "Anoniem" },
      contextFor(nameless)
    );
    const link = await call(
      router.share.create,
      { id: created.id, role: "view" },
      contextFor(nameless)
    );

    const nl = await call(
      router.shared.get,
      { token: link.token },
      contextFor(null)
    );
    const en = await call(
      router.shared.get,
      { token: link.token },
      contextFor(null, { locale: "en" })
    );

    expect(nl.list.ownerName).toBe("een SMOG-gebruiker");
    expect(en.list.ownerName).toBe("a SMOG user");
  });

  it("a private list is unreachable, by its id or a made-up token", async () => {
    for (const token of [listId, "x".repeat(43)]) {
      // biome-ignore lint/performance/noAwaitInLoops: one assertion each.
      await expect(
        call(router.shared.get, { token }, contextFor(null))
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });
});

describe("shared editing", () => {
  it("a view link can never edit", async () => {
    const view = await share("view");
    const visitor = contextFor(await addUser("Bert"));

    await expect(
      call(
        router.shared.addItem,
        { gestureId: gestureIds[1] as string, token: view.token },
        visitor
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(
        router.shared.removeItem,
        { gestureId: gestureIds[0] as string, token: view.token },
        visitor
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await storedItems(listId)).map((row) => row.gestureId)).toEqual([
      gestureIds[0],
    ]);
  });

  it("an edit link needs a session", async () => {
    const edit = await share("edit");

    await expect(
      call(
        router.shared.addItem,
        { gestureId: gestureIds[1] as string, token: edit.token },
        contextFor(null)
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      call(
        router.shared.removeItem,
        { gestureId: gestureIds[0] as string, token: edit.token },
        contextFor(null)
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("an edit link with a session adds and removes like the owner", async () => {
    const edit = await share("edit");
    const editor = await addUser("Bert");

    expect(
      await call(
        router.shared.addItem,
        { gestureId: gestureIds[1] as string, token: edit.token },
        contextFor(editor)
      )
    ).toEqual({ added: true });
    const added = await env.DB.prepare(
      "SELECT added_by AS addedBy FROM list_item WHERE list_id = ? AND gesture_id = ?"
    )
      .bind(listId, gestureIds[1] as string)
      .first<{ addedBy: string }>();
    expect(added?.addedBy).toBe(editor.id);

    expect(
      await call(
        router.shared.removeItem,
        { gestureId: gestureIds[0] as string, token: edit.token },
        contextFor(editor)
      )
    ).toEqual({ removed: true });
    expect(await storedItems(listId)).toEqual([
      { gestureId: gestureIds[1], position: 0 },
    ]);
  });

  it("a revoked edit link is NOT_FOUND, and an unpublished gesture too", async () => {
    const edit = await share("edit");
    const editor = contextFor(await addUser("Bert"));
    const [hidden] = await addGestures(["Verborgen"], { published: false });

    await expect(
      call(
        router.shared.addItem,
        { gestureId: hidden as string, token: edit.token },
        editor
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await call(
      router.share.revoke,
      { id: listId, role: "edit" },
      contextFor(owner)
    );
    await expect(
      call(
        router.shared.addItem,
        { gestureId: gestureIds[1] as string, token: edit.token },
        editor
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
