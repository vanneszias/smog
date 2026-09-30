import { env, exports } from "cloudflare:workers";
import { gestureCategory } from "@smog/db";
import { createTestDb, makeCategory, makeGesture } from "@smog/db/testing";
import { bumpCatalogVersion, reindexGesture } from "@smog/gestures/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  LEGACY_REDIRECTS,
  legacyRedirectTarget,
} from "../src/lib/legacy-redirects";

const ORIGIN = "http://localhost:5173";
/** An old Convex id, as printed on QR codes (inventory §7). */
const LEGACY_ID = "k17a0legacyredirecttest000000";
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
  await db
    .insert(gestureCategory)
    .values({ categoryId: category.id, gestureId: row.id });
  await reindexGesture(db, row.id);
  await bumpCatalogVersion(env.KV);
});

describe("the legacy redirect table (spec §9, inventory §7)", () => {
  it.each([
    ["/sponsors", "/sponsor"],
    ["/sponsors/", "/sponsor"],
    ["/sponsors?gestureId=j57abc", "/sponsor?gestureId=j57abc"],
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

  it("keeps /favorites (now a real page)", async () => {
    expect((await get("/favorites")).status).toBe(200);
  });

  it("sends an old /gestures/<convexId> to the slug, query kept (phase 3)", async () => {
    const response = await get(`/gestures/${LEGACY_ID}?ref=qr`);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toMatch(HALLO_LOCATION);
  });
});
