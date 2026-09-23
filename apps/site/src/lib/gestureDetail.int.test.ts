// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";
import { fetchGesture, fetchViewer } from "./gestureDetail";

/*
 * Every fixture name and email carries this, because the local D1 under
 * `.wrangler/state/vitest` is never cleared between runs: a fixed
 * `users.email` collides with the row the previous run left behind, and the
 * collision throws inside `beforeAll`, which Vitest reports as *skipped*
 * rather than failed.
 */
const RUN = crypto.randomUUID();

const PASSWORD = "correct-horse-battery-staple";

describe("fetchGesture", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;
  let activeId: number;
  let inactiveId: number;
  let adminId: number;
  let regularUserId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Detail ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;

    const active = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        info: "Zwaai met je hand.",
        isActive: true,
        name: `Hallo ${RUN}`,
        playbackId: `pb-detail-${RUN}-active`,
      },
      locale: "nl",
    });
    activeId = active.id;

    // A French translation on the same document, so the locale the caller
    // asks for is observably different from the fallback.
    await payload.update({
      collection: "gestures",
      data: { info: "Agite la main.", name: `Bonjour ${RUN}` },
      id: activeId,
      locale: "fr",
    });

    const inactive = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: false,
        name: `Verborgen ${RUN}`,
        playbackId: `pb-detail-${RUN}-inactive`,
      },
      locale: "nl",
    });
    inactiveId = inactive.id;

    const admin = await payload.create({
      collection: "users",
      data: {
        email: `detail-admin-${RUN}@example.com`,
        password: PASSWORD,
        role: "admin",
      },
    });
    adminId = admin.id;

    const regular = await payload.create({
      collection: "users",
      data: {
        email: `detail-user-${RUN}@example.com`,
        password: PASSWORD,
        role: "user",
      },
    });
    regularUserId = regular.id;
  });

  it("boots with the fixtures this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped*, not failed, so a run
    // that seeded nothing looks green. This turns that into a named failure.
    expect(activeId).toBeGreaterThan(0);
    expect(inactiveId).toBeGreaterThan(0);
    expect(adminId).toBeGreaterThan(0);
    expect(regularUserId).toBeGreaterThan(0);
  });

  it("returns an active gesture to an anonymous visitor", async () => {
    const gesture = await fetchGesture({ id: String(activeId), locale: "nl" });

    expect(gesture?.id).toBe(activeId);
    expect(gesture?.name).toBe(`Hallo ${RUN}`);
  });

  it("404s an inactive gesture for an anonymous visitor", async () => {
    // `null` is what the page turns into `notFound()`; the e2e spec asserts
    // the 404 itself over HTTP. What matters here is that the read goes
    // through `publicReadActive` rather than around it — a detail page is
    // the obvious place for an `overrideAccess: true` to slip in.
    const gesture = await fetchGesture({
      id: String(inactiveId),
      locale: "nl",
    });

    expect(gesture).toBeNull();
  });

  it("shows an inactive gesture to an admin", async () => {
    // The other half of the pair, and the half that gives the first one
    // meaning: without it, a page that 404s *everything* passes the test
    // above.
    const gesture = await fetchGesture({
      id: String(inactiveId),
      locale: "nl",
      user: { collection: "users", id: adminId, role: "admin" } as never,
    });

    expect(gesture?.id).toBe(inactiveId);
  });

  it("still hides an inactive gesture from a signed-in non-admin", async () => {
    // Being signed in is not the privilege; being an admin is.
    const gesture = await fetchGesture({
      id: String(inactiveId),
      locale: "nl",
      user: { collection: "users", id: regularUserId, role: "user" } as never,
    });

    expect(gesture).toBeNull();
  });

  it("returns null for an id no gesture has", async () => {
    const gesture = await fetchGesture({ id: "987654321", locale: "nl" });

    expect(gesture).toBeNull();
  });

  it("returns null for an id that is not a number rather than throwing", async () => {
    // `/nl/gestures/../../etc` and `/nl/gestures/banana` both reach this
    // route. Payload coerces the id for a numeric primary key and a NaN
    // matches nothing (verified against
    // `@payloadcms/drizzle/dist/queries/sanitizeQueryValue.js`), but the
    // thing that must not happen is a 500.
    await expect(
      fetchGesture({ id: "banana", locale: "nl" })
    ).resolves.toBeNull();
  });

  it("populates the categories so the page can name them", async () => {
    // `depth: 0` would leave `categories` as bare ids, which have no name to
    // render and would print as `[object Object]` or nothing at all.
    const gesture = await fetchGesture({ id: String(activeId), locale: "nl" });

    for (const category of gesture?.categories ?? []) {
      expect(typeof category).toBe("object");
    }
  });

  it("serves the locale that was asked for, not the default", async () => {
    // Without this, nothing distinguishes `locale: params.locale` from
    // `locale: DEFAULT_LOCALE` — every other fixture is Dutch-only, so both
    // return Dutch and both look right.
    const gesture = await fetchGesture({ id: String(activeId), locale: "fr" });

    expect(gesture?.name).toBe(`Bonjour ${RUN}`);
    expect(gesture?.info).toBe("Agite la main.");
  });

  it("serves the Dutch name to a French visitor rather than a blank page", async () => {
    // The locale fallback reaches the detail page too: most content has no
    // French translation, and `fallback: true` applies to the read. The
    // *inactive* gesture is the Dutch-only one here, so it is read as the
    // admin who is allowed to see it.
    const gesture = await fetchGesture({
      id: String(inactiveId),
      locale: "fr",
      user: { collection: "users", id: adminId, role: "admin" } as never,
    });

    expect(gesture?.name).toBe(`Verborgen ${RUN}`);
  });
});

describe("fetchViewer", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let adminEmail: string;
  let token: string;

  beforeAll(async () => {
    payload = await getPayload({ config });
    adminEmail = `viewer-admin-${RUN}@example.com`;

    await payload.create({
      collection: "users",
      data: { email: adminEmail, password: PASSWORD, role: "admin" },
    });

    const login = await payload.login({
      collection: "users",
      data: { email: adminEmail, password: PASSWORD },
    });

    token = login.token ?? "";
  });

  it("boots with a real session token", () => {
    expect(token).not.toBe("");
  });

  it("resolves the signed-in admin from the request cookie", async () => {
    const user = await fetchViewer(
      new Headers({ cookie: `payload-token=${token}` })
    );

    expect(user?.email).toBe(adminEmail);
    expect((user as { role?: string } | null)?.role).toBe("admin");
  });

  it("resolves an anonymous request to null", async () => {
    const user = await fetchViewer(new Headers());

    expect(user).toBeNull();
  });

  it("resolves a forged token to null rather than throwing", async () => {
    // A tampered or expired cookie must render the anonymous page, not a
    // 500. That is Payload's own behaviour rather than this wrapper's —
    // `auth/strategies/jwt.js` catches every `jwtVerify` failure and returns
    // `{ user: null }` — which is precisely why it is pinned here: the day it
    // changes, this fails instead of the site 500ing for anyone with a stale
    // cookie.
    await expect(
      fetchViewer(new Headers({ cookie: "payload-token=not.a.jwt" }))
    ).resolves.toBeNull();

    // A structurally valid JWT signed with the wrong secret takes a different
    // path through `jwtVerify` than a string that is not a JWT at all.
    const forged = [
      Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
      Buffer.from(
        `{"id":1,"collection":"users","exp":${Math.floor(Date.now() / 1000) + 3600}}`
      ).toString("base64url"),
      Buffer.from("not-the-signature").toString("base64url"),
    ].join(".");

    await expect(
      fetchViewer(new Headers({ cookie: `payload-token=${forged}` }))
    ).resolves.toBeNull();
  });
});
