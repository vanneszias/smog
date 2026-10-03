import { env, exports } from "cloudflare:workers";
import { gestureCategory } from "@smog/db";
import { createTestDb, makeCategory, makeGesture } from "@smog/db/testing";
import { bumpCatalogVersion, reindexGesture } from "@smog/gestures/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  gestureIdParam,
  LEGACY_REDIRECTS,
  legacyRedirectTarget,
  needsCategoryLookup,
} from "../src/lib/legacy-redirects";

const ORIGIN = "http://localhost:5173";
/** An old Convex id, as printed on QR codes (inventory §7). */
const LEGACY_ID = "k17a0legacyredirecttest000000";
/** The test gesture's id (a v4 UUID, set in `beforeAll`). */
let halloId = "";
/** A same-site path: one slash, never `//` or `/\`. */
const SITE_PATH = /^\/(?![/\\])/;
const OLD_PATH = /^\/[a-z-]+(\/[a-z-]+)?$/;
const HALLO_LOCATION =
  /^(?:http:\/\/localhost:5173)?\/gestures\/hallo\?ref=qr$/;

function target(path: string): string | null {
  return legacyRedirectTarget(new URL(path, ORIGIN));
}

async function get(path: string, method = "GET"): Promise<Response> {
  const response = await exports.default.fetch(`${ORIGIN}${path}`, {
    method,
    redirect: "manual",
  });
  await response.body?.cancel();
  return response;
}

beforeAll(async () => {
  if (!(env.DB && env.KV)) {
    throw new Error("[test] The DB and KV bindings are missing");
  }
  const db = createTestDb({ DB: env.DB });
  const category = await makeCategory(db, {
    name: "Begroetingen",
    slug: "begroetingen",
    sortOrder: 0,
  });
  const row = await makeGesture(db, {
    legacyId: LEGACY_ID,
    name: "Hallo",
    publishedAt: new Date(),
    slug: "hallo",
  });
  halloId = row.id;
  // Unpublished: an old link to it opens the wizard empty.
  await makeGesture(db, {
    legacyId: "k17a0legacyredirectdraft00000",
    name: "Concept",
    publishedAt: null,
    slug: "concept-gebaar",
  });
  await db
    .insert(gestureCategory)
    .values({ categoryId: category.id, gestureId: row.id });
  // The migration de-duplicates slugs: this name's slug is not slugify(name).
  const feelings = await makeCategory(db, {
    name: "Gevoelens",
    slug: "gevoelens-2",
    sortOrder: 1,
  });
  await db
    .insert(gestureCategory)
    .values({ categoryId: feelings.id, gestureId: row.id });
  await reindexGesture(db, row.id);
  await bumpCatalogVersion(env.KV);
});

describe("the legacy redirect table (spec §9, inventory §7)", () => {
  it.each([
    ["/sponsors", "/sponsor"],
    ["/sponsors/", "/sponsor"],
    // R-11: without the D1 lookup, an old gesture id is dropped.
    ["/sponsors?gestureId=j57abc", "/sponsor"],
    ["/sponsor?gestureId=j57abc&x=1", "/sponsor?x=1"],
    ["/sponsors/re-edit?token=abc-123", "/sponsor/edit?token=abc-123"],
    ["/sponsors/re-edit/", "/sponsor/edit"],
    [
      "/sponsors/success?paymentId=tr_WDqYK6vllg",
      "/sponsor/success?payment=tr_WDqYK6vllg",
    ],
    ["/success", "/sponsor/success"],
    ["/success?paymentId=tr_1&x=1", "/sponsor/success?payment=tr_1&x=1"],
    ["/sponsors/renew?token=t", "/sponsor/renew?token=t"],
    ["/login", "/sign-in"],
    ["/login?redirect=%2Faccount", "/sign-in?redirect=%2Faccount"],
    ["/login/", "/sign-in"],
    ["/callback?code=01J&state=x", "/"],
  ])("%s → %s", (from, to) => {
    expect(target(from)).toBe(to);
  });

  it("maps old ?category=<Name> values to slugs, keeping the other params", () => {
    expect(target("/gestures?category=Begroetingen")).toBe(
      "/gestures?category=begroetingen"
    );
    expect(
      target("/gestures?q=hallo&category=Eten%20en%20Drinken,Dieren&x=1")
    ).toBe("/gestures?q=hallo&category=eten-en-drinken%2Cdieren&x=1");
    expect(target("/gestures/?category=Gevoelens")).toBe(
      "/gestures?category=gevoelens"
    );
    expect(target("/gestures?category=%C3%89motions")).toBe(
      "/gestures?category=emotions"
    );
    // A name that has no slug characters is dropped.
    expect(target("/gestures?q=a&category=%21%21")).toBe("/gestures?q=a");
  });

  it("resolves names through the categories when they are known (review M3)", () => {
    const known = new Map([["gevoelens", "gevoelens-2"]]);
    expect(
      legacyRedirectTarget(
        new URL("/gestures?category=Gevoelens,Dieren", ORIGIN),
        known
      )
    ).toBe("/gestures?category=gevoelens-2%2Cdieren");
    expect(
      needsCategoryLookup(new URL("/gestures?category=Gevoelens", ORIGIN))
    ).toBe(true);
    expect(
      needsCategoryLookup(new URL("/gestures?category=gevoelens-2", ORIGIN))
    ).toBe(false);
    expect(needsCategoryLookup(new URL("/login", ORIGIN))).toBe(false);
  });

  it("renames ?gestureId= to the wizard's ?gesture=<slug> (R-11, ruling 13)", () => {
    const at = (path: string, slug: string | null) =>
      legacyRedirectTarget(new URL(path, ORIGIN), new Map(), slug);
    expect(at("/sponsors?gestureId=k17&utm_source=qr", "hallo")).toBe(
      "/sponsor?gesture=hallo&utm_source=qr"
    );
    expect(at("/sponsor/?gestureId=k17", "hallo")).toBe(
      "/sponsor?gesture=hallo"
    );
    expect(at("/Sponsors?gestureId=k17", "hallo")).toBe(
      "/sponsor?gesture=hallo"
    );
    expect(at("/sponsors?gestureId=x&gestureId=y", "hallo")).toBe(
      "/sponsor?gesture=hallo"
    );
    expect(at("/sponsor?gestureId=nope&q=1", null)).toBe("/sponsor?q=1");
    // The current URL and the other sponsor pages are left alone.
    expect(at("/sponsor?gesture=hallo", "hallo")).toBeNull();
    expect(at("/sponsor/success?gestureId=k17", "hallo")).toBeNull();
    expect(gestureIdParam(new URL("/sponsors?gestureId=k17", ORIGIN))).toBe(
      "k17"
    );
    expect(gestureIdParam(new URL("/sponsor?gesture=hallo", ORIGIN))).toBe(
      null
    );
    expect(gestureIdParam(new URL("/gestures?gestureId=k17", ORIGIN))).toBe(
      null
    );
  });

  it("matches the old paths case-insensitively, like the old router (review M5)", () => {
    expect(target("/Login?redirect=%2Faccount")).toBe(
      "/sign-in?redirect=%2Faccount"
    );
    expect(target("/SPONSORS/Success?paymentId=tr_1")).toBe(
      "/sponsor/success?payment=tr_1"
    );
    expect(target("/Callback")).toBe("/");
  });

  it("leaves the app hand-off pages alone (phase 4 task 5)", () => {
    expect(target("/magic-link/app?token=t")).toBeNull();
    expect(target("/turnstile-bridge")).toBeNull();
  });

  it("leaves current URLs alone", () => {
    for (const path of [
      "/",
      "/sponsor",
      "/sponsor/success?payment=tr_1",
      "/sponsorship",
      "/sign-in",
      "/favorites",
      "/lists",
      "/gestures",
      "/gestures?category=begroetingen,eten-en-drinken",
      "/gestures?q=Hallo",
      "/gestures/hallo",
      `/gestures/${LEGACY_ID}`,
      "/successful",
      "/loginx",
      "/privacy",
    ]) {
      expect(target(path), path).toBeNull();
    }
  });

  it("only ever answers a same-site path (no open redirect)", () => {
    for (const path of [
      "/sponsors//evil.example",
      "/sponsors/%2F%2Fevil.example",
      "/sponsors/\\evil.example",
      "/sponsors/..%2F..%2Fevil.example",
      "/login?redirect=https://evil.example",
      "/success?paymentId=//evil.example",
      "/gestures?category=//evil.example",
    ]) {
      const location = target(path);
      if (location === null) {
        continue;
      }
      expect(location, path).toMatch(SITE_PATH);
      expect(new URL(location, ORIGIN).origin, path).toBe(ORIGIN);
    }
  });

  it("has fixed, same-site destinations", () => {
    for (const entry of LEGACY_REDIRECTS) {
      expect(entry.to).toMatch(SITE_PATH);
      expect(entry.from).toMatch(OLD_PATH);
    }
  });
});

describe("the Worker applies the table first", () => {
  it("answers 301 with the query preserved", async () => {
    const response = await get("/login?redirect=%2Faccount");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "/sign-in?redirect=%2Faccount"
    );
  });

  it("redirects HEAD too, but not a POST", async () => {
    expect((await get("/sponsors", "HEAD")).status).toBe(301);
    expect((await get("/sponsors", "POST")).status).not.toBe(301);
  });

  it("resolves an old ?category=<Name> in one hop", async () => {
    const response = await get("/gestures?category=Begroetingen");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "/gestures?category=begroetingen"
    );
  });

  it("maps a name to its de-duplicated slug through D1 (review M3)", async () => {
    const response = await get("/gestures?category=Gevoelens");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "/gestures?category=gevoelens-2"
    );
  });

  it.each([
    ["the id", () => halloId],
    ["the legacy id", () => LEGACY_ID],
    ["the slug", () => "hallo"],
  ])(
    "sends an old /sponsors?gestureId=<%s> to the wizard preselected, in one hop (R-11)",
    async (_, value) => {
      const response = await get(
        `/sponsors?gestureId=${encodeURIComponent(value())}&utm_source=qr`
      );
      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe(
        "/sponsor?gesture=hallo&utm_source=qr"
      );
      const current = await get(`/sponsor?gestureId=${value()}`);
      expect(current.status).toBe(301);
      expect(current.headers.get("location")).toBe("/sponsor?gesture=hallo");
    }
  );

  it("drops an unknown or unpublished gesture, so the wizard opens empty (R-11)", async () => {
    for (const value of [
      "k17a0doesnotexist000000000000",
      "k17a0legacyredirectdraft00000",
      "concept-gebaar",
      "x".repeat(300),
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one request at a time.
      const response = await get(`/sponsors?gestureId=${value}&x=1`);
      expect(response.status, value).toBe(301);
      expect(response.headers.get("location"), value).toBe("/sponsor?x=1");
    }
  });

  it("keeps /favorites (now a real page)", async () => {
    expect((await get("/favorites")).status).toBe(200);
  });

  it("sends an old /gestures/<convexId> to the slug, query kept (phase 3)", async () => {
    const response = await get(`/gestures/${LEGACY_ID}?ref=qr`);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toMatch(HALLO_LOCATION);
  });
});
