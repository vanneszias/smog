import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { getSession } from "@smog/auth";
import { createAuth } from "@smog/auth/server";
import { createTestDb } from "@smog/db/testing";
import {
  DirectEmailOutbox,
  MemoryEmailSender,
  type OutboxEmail,
} from "@smog/email";
import { createFavoritesRouter } from "@smog/favorites/server";
import {
  findGestureBySlug,
  findGesturesByIds,
  getCatalogProjection,
  searchGestures,
} from "@smog/gestures/server";
import { createListsRouter } from "@smog/lists/server";
import { makeRpcContext } from "@smog/rpc/testing";
import { runExpirySweep } from "@smog/sponsorships/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  convex,
  importFixture,
  NOW,
  newIdOf,
  SITE_URL,
  testDb,
} from "./harness";

/*
 * The real catalogue, lists, favorites and auth services on the imported
 * fixture (phase 8 task 10): search (the FTS rebuild and the catalogue
 * bump), a gesture by its Convex id (`/gestures/<convexId>`), B1 (the
 * sponsor's video while `live`, the gesture's own after the expiry
 * sweep), the old view and edit share tokens, favorites, and an
 * email-code sign-in of an imported user with no credential.
 */

const db = testDb();
const CODE = /\b\d{6}\b/;
const FIXTURE_SLUG = /^fixtuurgebaar-/;
const ADA_EMAIL = "ada.fixture@example.test";

beforeAll(async () => {
  await importFixture();
});

describe("the catalogue", () => {
  it("search finds migrated gestures by name and keyword (the FTS rebuild)", async () => {
    const byKeyword = await searchGestures(
      { db, kv: env.KV },
      { limit: 10, q: "vader" }
    );
    expect(byKeyword.items.map((item) => item.slug)).toEqual(["papa"]);
    const byName = await searchGestures(
      { db, kv: env.KV },
      { limit: 10, q: "fixtuurgebaar" }
    );
    expect(byName.total).toBeGreaterThan(0);
    expect(byName.items[0]?.slug).toMatch(FIXTURE_SLUG);
  });

  it("the typo tier's projection (KV-versioned) holds the migrated catalogue", async () => {
    const projection = await getCatalogProjection(db, env.KV);
    const names = new Set(projection.map((entry) => entry.name));
    expect(names.has("papa")).toBe(true);
    expect(names.has("fixtuurgebaar 02")).toBe(true);
    const typo = await searchGestures(
      { db, kv: env.KV },
      { limit: 10, q: "papaa" }
    );
    expect(typo.items.map((item) => item.slug)).toContain("papa");
  });

  it("a Convex id finds its gesture (/gestures/<convexId>, R-03)", async () => {
    const found = await findGestureBySlug(db, convex.gesture("pap1"));
    expect(found).toMatchObject({
      canonicalSlug: "papa",
      id: await newIdOf("gesture", convex.gesture("pap1")),
      name: "Papa",
    });
    expect(found?.keywords).toEqual(["vader", "papa"]);
  });

  it("B1: the sponsored gesture shows the sponsor's video while live, and its own after the expiry sweep", async () => {
    const live = await findGestureBySlug(db, convex.gesture("mam1"));
    expect(live?.playbackId).toBe("fixtureSponsoredPlayback0001");
    expect(live?.sponsor).toMatchObject({ name: "Bakkerij Overschreven" });
    const own = await env.DB.prepare(
      "SELECT playback_id FROM gesture WHERE legacy_id = ?"
    )
      .bind(convex.gesture("mam1"))
      .first<{ playback_id: string }>();
    expect(own?.playback_id).toBe("fixtureOriginalPlayback0001");

    const swept = await runExpirySweep({ db, mux: null, now: NOW });
    expect(swept.expired).toBe(1);
    const after = await findGestureBySlug(db, convex.gesture("mam1"));
    expect(after?.playbackId).toBe("fixtureOriginalPlayback0001");
    expect(after?.sponsor).toBeNull();
  });
});

describe("lists and favorites", () => {
  const lists = createListsRouter({ findSummaries: findGesturesByIds });
  const favorites = createFavoritesRouter({ findSummaries: findGesturesByIds });
  const guest = () => ({
    context: makeRpcContext({ db, kv: env.KV, locale: "nl" }),
  });

  it("an old view token shows the shared list", async () => {
    const shared = await call(
      lists.shared.get,
      { token: "fixture-view-token-0001" },
      guest()
    );
    expect(shared).toMatchObject({
      list: { description: "Thuis", name: "Familie oefenen" },
      role: "view",
    });
    expect(shared.items.length).toBeGreaterThan(0);
  });

  it("an old edit token opens the list for editing", async () => {
    const shared = await call(
      lists.shared.get,
      { token: "fixture-edit-token-0002" },
      guest()
    );
    expect(shared).toMatchObject({
      list: { name: "Samen leren" },
      role: "edit",
    });
  });

  it("an email-code sign-in of an imported user (no credential) keeps their favorites, and sends no welcome", async () => {
    const sender = new MemoryEmailSender();
    const sent: OutboxEmail[] = [];
    const direct = new DirectEmailOutbox(sender, {
      EMAIL_FROM: "SMOG & Co <noreply@smog.vlaanderen>",
      EMAIL_REPLY_TO: "info@smog.vlaanderen",
      SITE_URL,
    });
    const auth = createAuth({
      baseURL: SITE_URL,
      db: createTestDb(env),
      env: {
        BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
        ENVIRONMENT: "dev",
        SITE_URL,
      },
      outbox: {
        send: async (email) => {
          sent.push(email);
          await direct.send(email);
        },
      },
    });
    const post = (path: string, body: unknown) =>
      auth.handler(
        new Request(`${SITE_URL}/api/auth${path}`, {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json", origin: SITE_URL },
          method: "POST",
        })
      );
    const accounts = await env.DB.prepare(
      'SELECT count(*) AS n FROM account WHERE user_id = (SELECT id FROM "user" WHERE email = ?)'
    )
      .bind(ADA_EMAIL)
      .first<{ n: number }>();
    expect(accounts?.n).toBe(0);

    expect(
      (
        await post("/email-otp/send-verification-otp", {
          email: ADA_EMAIL,
          type: "sign-in",
        })
      ).status
    ).toBe(200);
    const otp = sender.sent.at(-1)?.text?.match(CODE)?.[0];
    expect(otp).toBeDefined();
    const signedIn = await post("/sign-in/email-otp", {
      email: ADA_EMAIL,
      otp,
    });
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const session = await getSession(auth, new Headers({ cookie }));
    const adaId = await newIdOf("user", convex.user("ada1"));
    expect(session?.user.id).toBe(adaId);
    expect(sent.map((email) => email.template)).not.toContain(
      "transactional/welcome"
    );

    const ids = await call(favorites.ids, undefined, {
      context: makeRpcContext({ db, kv: env.KV, session }),
    });
    expect([...ids].sort()).toEqual(
      [
        await newIdOf("gesture", convex.gesture("mam1")),
        await newIdOf("gesture", convex.gesture("pap1")),
      ].sort()
    );
  });
});
