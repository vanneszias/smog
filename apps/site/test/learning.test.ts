import { env, exports } from "cloudflare:workers";
import {
  gestureCategory,
  gestureKeyword,
  list,
  listItem,
  listShare,
} from "@smog/db";
import {
  createTestDb,
  makeCategory,
  makeGesture,
  makeUser,
  SAMPLE_PLAYBACK_ID,
} from "@smog/db/testing";
import { bumpCatalogVersion, reindexGesture } from "@smog/gestures/server";
import { newId } from "@smog/utils";
import { beforeAll, describe, expect, it } from "vitest";
import { scriptJson } from "../src/lib/head";
import { robotsTxt } from "../src/lib/robots";

const ORIGIN = "http://localhost:5173";
function binding<T>(value: T | undefined, name: string): T {
  if (!value) {
    throw new Error(`[test] The ${name} binding is missing`);
  }
  return value;
}

const db = createTestDb({ DB: binding(env.DB, "DB") });

const CANONICAL_LINK =
  /<link (?=[^>]*rel="canonical")(?=[^>]*href="http:\/\/localhost:5173\/gestures\/hond")[^>]*>/;
/** The legacy 301 keeps the query string (spec §9). */
const CANONICAL_LOCATION = /\/gestures\/hond\?ref=qr&lang=nl$/;
const JSON_LD = /<script type="application\/ld\+json">(.*?)<\/script>/;
const ISO_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
/** The dehydrated query's hash: the key `useGestureSearch` reads. */
const DEHYDRATED_SEARCH_KEY =
  /queryHash:"\[\[\\"gestures\\",\\"search\\"\],\{\\"input\\":\{\\"limit\\":48,\\"q\\":\\"hond\\"\},\\"type\\":\\"query\\"\}\]"/;
/** Seroval writes the data as JS literals; the ranking fields are data only. */
const DEHYDRATED_HOND_RESULT = /name:"Hond"[^}]*matchedField:"name"/;
const LEGACY_ID = "j57d0legacyconvexid0000000000";
const VIEW_TOKEN = "view-token-learning-test-0000000000000000000";
const REVOKED_TOKEN = "revoked-token-learning-test-00000000000000000";

async function addGesture(
  name: string,
  slug: string,
  options: {
    categoryId: string;
    keywords?: string[];
    legacyId?: string;
    published?: boolean;
  }
): Promise<string> {
  const row = await makeGesture(db, {
    description: `Het gebaar voor ${name.toLowerCase()}.`,
    legacyId: options.legacyId ?? null,
    name,
    publishedAt: options.published === false ? null : new Date(),
    slug,
  });
  await db
    .insert(gestureCategory)
    .values({ categoryId: options.categoryId, gestureId: row.id });
  const keywords = options.keywords ?? [];
  if (keywords.length > 0) {
    await db.insert(gestureKeyword).values(
      keywords.map((keyword, position) => ({
        gestureId: row.id,
        keyword,
        position,
      }))
    );
  }
  await reindexGesture(db, row.id);
  return row.id;
}

async function get(
  path: string,
  init: RequestInit = {}
): Promise<{ body: string; response: Response }> {
  const response = await exports.default.fetch(`${ORIGIN}${path}`, {
    redirect: "manual",
    ...init,
  });
  return { body: await response.text(), response };
}

beforeAll(async () => {
  const animals = await makeCategory(db, {
    name: "Dieren",
    slug: "dieren",
    sortOrder: 0,
  });
  const food = await makeCategory(db, {
    name: "Eten en drinken",
    slug: "eten-en-drinken",
    sortOrder: 1,
  });
  const hond = await addGesture("Hond", "hond", {
    categoryId: animals.id,
    keywords: ["hondje", "huisdier"],
    legacyId: LEGACY_ID,
  });
  const kat = await addGesture("Kat", "kat", {
    categoryId: animals.id,
    keywords: ["poes"],
  });
  await addGesture("Koffie", "koffie", {
    categoryId: food.id,
    keywords: ["café", "espresso"],
  });
  await addGesture("Geheim", "geheim", {
    categoryId: animals.id,
    published: false,
  });
  await bumpCatalogVersion(binding(env.KV, "KV"));

  const owner = await makeUser(db, { name: "Juf Anna" });
  const listId = newId();
  await db.insert(list).values({
    description: "Voor de klas",
    id: listId,
    name: "Dieren in de klas",
    ownerId: owner.id,
  });
  await db.insert(listItem).values([
    { gestureId: kat, listId, position: 0 },
    { gestureId: hond, listId, position: 1 },
  ]);
  await db.insert(listShare).values([
    { id: newId(), listId, role: "view", token: VIEW_TOKEN },
    {
      id: newId(),
      listId,
      revokedAt: new Date(),
      role: "edit",
      token: REVOKED_TOKEN,
    },
  ]);
});

describe("home (SSR)", () => {
  it("renders the hero search, the categories and the featured gestures", async () => {
    const { body, response } = await get("/");
    expect(response.status).toBe(200);
    expect(body).toContain('action="/gestures"');
    expect(body).toContain("Dieren");
    expect(body).toContain("Hond");
    expect(body).toContain("Koffie");
    expect(body).not.toContain("Geheim");
    expect(body).toContain('"@type":"WebSite"');
    expect(body).toContain("/gestures?q={search_term_string}");
  });
});

describe("/gestures (SSR search)", () => {
  it("server-renders the results for ?q=", async () => {
    const { body, response } = await get("/gestures?q=hond");
    expect(response.status).toBe(200);
    expect(body).toContain('href="/gestures/hond"');
    expect(body).not.toContain('href="/gestures/koffie"');
  });

  it("matches accent-insensitively (cafe finds the café keyword)", async () => {
    const { body } = await get("/gestures?q=cafe");
    expect(body).toContain('href="/gestures/koffie"');
  });

  it("filters by ?category= and lists the browse order without a query", async () => {
    const { body } = await get("/gestures?category=eten-en-drinken");
    expect(body).toContain('href="/gestures/koffie"');
    expect(body).not.toContain('href="/gestures/kat"');
  });

  it("dehydrates the search query (key and ranked result) for the client", async () => {
    const { body } = await get("/gestures?q=hond");
    // The query cache travels in the router's dehydrated state: the key the
    // hook reads (`gestures.search` with q "hond", limit 48) and the ranking
    // fields, which only the query data carries (the page never shows them).
    expect(body).toMatch(DEHYDRATED_SEARCH_KEY);
    expect(body).toMatch(DEHYDRATED_HOND_RESULT);
  });
});

describe("/gestures/$slug (SSR detail)", () => {
  it("renders the detail with its SEO head and JSON-LD", async () => {
    const { body, response } = await get("/gestures/hond");
    expect(response.status).toBe(200);
    expect(body).toContain("<title>Hond · SMOG &amp; Co</title>");
    expect(body).toMatch(CANONICAL_LINK);
    expect(body).toContain(
      `https://image.mux.com/${SAMPLE_PLAYBACK_ID}/thumbnail.webp?width=1200`
    );
    expect(body).toContain('name="description"');
    expect(body).toContain("Het gebaar voor hond.");
    expect(body).toContain('"@type":"VideoObject"');
    expect(body).toContain(`https://stream.mux.com/${SAMPLE_PLAYBACK_ID}.m3u8`);
    // Keywords and a related gesture (same category).
    expect(body).toContain("hondje");
    expect(body).toContain('href="/gestures/kat"');
    expect(body).toContain('href="/gestures?category=dieren"');
  });

  it("answers a legacy id with a 301 to the canonical slug, query kept", async () => {
    const { response } = await get(`/gestures/${LEGACY_ID}?ref=qr&lang=nl`);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toMatch(CANONICAL_LOCATION);
  });

  it("gives the VideoObject its uploadDate and dateModified (ISO 8601)", async () => {
    const { body } = await get("/gestures/hond");
    const jsonLd = body.match(JSON_LD)?.[1] ?? "{}";
    const video = JSON.parse(jsonLd) as Record<string, string>;
    expect(video["@type"]).toBe("VideoObject");
    expect(video.uploadDate).toMatch(ISO_DATE);
    expect(video.dateModified).toMatch(ISO_DATE);
  });

  it("escapes < in JSON-LD, so a name cannot close the script element", () => {
    const json = scriptJson({ name: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({
      name: "</script><script>alert(1)</script>",
    });
  });

  it.each(["bestaat-niet", "geheim"])(
    "answers %s (unknown or unpublished) with the 404 page",
    async (slug) => {
      const { body, response } = await get(`/gestures/${slug}`);
      expect(response.status).toBe(404);
      expect(body).toContain("Pagina niet gevonden");
      expect(body).toContain("Naar de startpagina");
    }
  );
});

describe("/lists/$shareToken (SSR shared list)", () => {
  it("renders a shared list for anyone with the view link", async () => {
    const { body, response } = await get(`/lists/${VIEW_TOKEN}`);
    expect(response.status).toBe(200);
    expect(body).toContain("Dieren in de klas");
    expect(body).toContain("Juf Anna");
    expect(body).toContain('href="/gestures/hond"');
    expect(body).toContain('content="noindex"');
  });

  it.each([REVOKED_TOKEN, "unknown-token"])(
    "answers the link %s (revoked or unknown) with the 404 page",
    async (token) => {
      const { body, response } = await get(`/lists/${token}`);
      expect(response.status).toBe(404);
      expect(body).toContain("Pagina niet gevonden");
    }
  );
});

describe("sitemap.xml and robots.txt", () => {
  it("lists every published gesture and the public pages", async () => {
    const { body, response } = await get("/sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain("<urlset");
    expect(body).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(body).toContain(`<loc>${ORIGIN}/gestures</loc>`);
    expect(body).toContain(`<loc>${ORIGIN}/gestures/hond</loc>`);
    expect(body).toContain(`<loc>${ORIGIN}/gestures/koffie</loc>`);
    expect(body).not.toContain("geheim");
  });

  it("keeps everything out of the index outside production (this is dev)", async () => {
    const { body, response } = await get("/robots.txt");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toBe("User-agent: *\nDisallow: /\n");
  });

  it("in production disallows the private areas and the SEO bots, with the sitemap", () => {
    const body = robotsTxt({
      environment: "production",
      origin: "https://smog.example",
    });
    for (const path of ["/admin", "/api/", "/dev/", "/account"]) {
      expect(body).toContain(`Disallow: ${path}`);
    }
    for (const bot of ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot"]) {
      expect(body).toContain(`User-agent: ${bot}\nDisallow: /\n`);
    }
    expect(body).toContain("Sitemap: https://smog.example/sitemap.xml");
    expect(robotsTxt({ environment: "staging", origin: "x" })).toBe(
      "User-agent: *\nDisallow: /\n"
    );
  });
});
