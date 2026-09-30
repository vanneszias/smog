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
const CANONICAL_LOCATION = /\/gestures\/hond$/;
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

  it("dehydrates the results so the client does not fetch them again", async () => {
    const { body } = await get("/gestures?q=hond");
    // The query cache travels in the router's dehydrated state.
    expect(body).toContain("gestures");
    expect(body).toContain("search");
    expect(body).toContain("matchedField");
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

  it("answers a legacy id with a 301 to the canonical slug", async () => {
    const { response } = await get(`/gestures/${LEGACY_ID}`);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toMatch(CANONICAL_LOCATION);
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

  it("disallows the private areas and points at the sitemap", async () => {
    const { body, response } = await get("/robots.txt");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    for (const path of ["/admin", "/api/", "/dev/", "/account"]) {
      expect(body).toContain(`Disallow: ${path}`);
    }
    expect(body).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });
});
