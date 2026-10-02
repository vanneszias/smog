import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getAuth, siteEnv } from "../src/server/auth";

const ORIGIN = "http://localhost:5173";
const PASSWORD = "correct horse battery";
// The first admin render transforms the admin routes and components.
const FIRST_RENDER_TIMEOUT = 120_000;

/** A verified account with `role`, signed in in-process: its cookie header. */
async function signedIn(
  role: "admin" | "user"
): Promise<{ cookie: string; email: string }> {
  const auth = getAuth();
  const email = `${crypto.randomUUID()}@smog.test`;
  await auth.api.signUpEmail({
    body: { email, name: `Gate ${role}`, password: PASSWORD },
  });
  await siteEnv()
    .db.prepare("UPDATE user SET email_verified = 1, role = ? WHERE email = ?")
    .bind(role, email)
    .run();
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
