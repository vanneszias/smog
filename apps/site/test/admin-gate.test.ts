import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getAuth, siteEnv } from "../src/server/auth";

const ORIGIN = "http://localhost:5173";
const PASSWORD = "correct horse battery";
// The first admin render transforms the admin routes and components.
const FIRST_RENDER_TIMEOUT = 120_000;

/** A verified account with `role`, signed in in-process: its cookie header. */
async function signedIn(
  role: "admin" | "teacher" | "translator" | "user"
): Promise<{ cookie: string; email: string }> {
  const auth = getAuth();
  const email = `${crypto.randomUUID()}@smog.test`;
  await auth.api.signUpEmail({
    body: { email, name: `Gate ${role}`, password: PASSWORD },
  });
  await siteEnv()
    .db.prepare("UPDATE user SET email_verified = 1, role = ? WHERE email = ?")
    .bind(role === "admin" ? "admin" : "user", email)
    .run();
  if (role === "translator" || role === "teacher") {
    await siteEnv()
      .db.prepare(
        "INSERT INTO user_role (user_id, role, granted_at) SELECT id, ?, ? FROM user WHERE email = ?"
      )
      .bind(role, Date.now(), email)
      .run();
  }
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { cookie, email };
}

async function open(path: string, cookie?: string): Promise<Response> {
  return await exports.default.fetch(`${ORIGIN}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
}

describe("the admin gate (ruling 10)", () => {
  it(
    "sends a guest to sign-in, back to the admin page asked for",
    async () => {
      const response = await open("/admin/audit?action=legacy");
      expect([302, 307]).toContain(response.status);
      const location = new URL(response.headers.get("location") ?? "", ORIGIN);
      expect(location.pathname).toBe("/sign-in");
      expect(location.searchParams.get("redirect")).toBe(
        "/admin/audit?action=legacy"
      );
    },
    FIRST_RENDER_TIMEOUT
  );

  it("shows a signed-in user the 404 page", async () => {
    const response = await open("/admin", (await signedIn("user")).cookie);
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain("Pagina niet gevonden");
    expect(html).not.toContain("Logboek");
  });

  it("shows an admin the admin layout, never indexed", async () => {
    const response = await open("/admin", (await signedIn("admin")).cookie);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Logboek");
    expect(html).toContain('content="noindex"');
  });

  it("sends a translator from the dashboard to the strings and shows them only the translation group", async () => {
    const { cookie } = await signedIn("translator");
    const home = await open("/admin", cookie);
    expect([302, 307]).toContain(home.status);
    expect(new URL(home.headers.get("location") ?? "", ORIGIN).pathname).toBe(
      "/admin/translation/strings"
    );
    const strings = await open("/admin/translation/strings", cookie);
    expect(strings.status).toBe(200);
    const html = await strings.text();
    expect(html).toContain("Vertalen");
    // No other group and no language list in their rail.
    expect(html).not.toContain("Logboek");
    expect(html).not.toContain("Gebruikers");
    expect(html).not.toContain("/admin/translation/languages");
  });

  it("keeps a translator from every other admin screen and from the languages", async () => {
    const { cookie } = await signedIn("translator");
    const statuses = await Promise.all(
      [
        "/admin/users",
        "/admin/audit",
        "/admin/gestures",
        "/admin/settings",
        "/admin/translation/languages",
      ].map(async (path) => [path, (await open(path, cookie)).status])
    );
    expect(statuses.map(([, status]) => status)).toEqual([
      404, 404, 404, 404, 404,
    ]);
  });

  it("sends a teacher from the dashboard to the lessons, with the teaching group only in the rail", async () => {
    const { cookie } = await signedIn("teacher");
    const home = await open("/admin", cookie);
    expect([302, 307]).toContain(home.status);
    expect(new URL(home.headers.get("location") ?? "", ORIGIN).pathname).toBe(
      "/admin/lessons"
    );
    for (const path of ["/admin/lessons", "/admin/lessons/some-lesson"]) {
      // biome-ignore lint/performance/noAwaitInLoops: two requests, in order.
      expect((await open(path, cookie)).status, path).toBe(200);
    }
    const html = await (await open("/admin/lessons", cookie)).text();
    expect(html).toContain("Lesgeven");
    expect(html).not.toContain("Logboek");
    expect(html).not.toContain("Gebruikers");
    expect(html).not.toContain("/admin/translation/strings");
  });

  it("lets a teacher open one gesture's teacher information and nothing else besides the lessons", async () => {
    const { cookie } = await signedIn("teacher");
    const info = await open("/admin/teacher-info/some-gesture", cookie);
    expect(info.status).toBe(200);
    const statuses = await Promise.all(
      [
        "/admin/users",
        "/admin/gestures",
        "/admin/gestures/some-gesture",
        "/admin/translation/strings",
        "/admin/teacher-info",
      ].map(async (path) => (await open(path, cookie)).status)
    );
    expect(statuses).toEqual([404, 404, 404, 404, 404]);
  });

  it("lets a translator open the teacher information too, and a plain user not", async () => {
    const translator = await signedIn("translator");
    expect(
      (await open("/admin/teacher-info/some-gesture", translator.cookie)).status
    ).toBe(200);
    // Lessons are the teacher's: a translator has none.
    expect((await open("/admin/lessons", translator.cookie)).status).toBe(404);
    const learner = await signedIn("user");
    expect(
      (await open("/admin/teacher-info/some-gesture", learner.cookie)).status
    ).toBe(404);
  });

  it("shows an admin the language list", async () => {
    const response = await open(
      "/admin/translation/languages",
      (await signedIn("admin")).cookie
    );
    expect(response.status).toBe(200);
  });

  it("a demoted admin's next navigation is a 404", async () => {
    const { cookie, email } = await signedIn("admin");
    expect((await open("/admin", cookie)).status).toBe(200);
    await siteEnv()
      .db.prepare("UPDATE user SET role = 'user' WHERE email = ?")
      .bind(email)
      .run();
    expect((await open("/admin", cookie)).status).toBe(404);
  });
});
