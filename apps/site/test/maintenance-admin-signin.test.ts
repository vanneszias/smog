import { env, exports } from "cloudflare:workers";
import { buildGrantStatements } from "@smog/config/admin-grant";
import { MAINTENANCE_KV_KEY } from "@smog/config/maintenance";
import { afterEach, describe, expect, it } from "vitest";
import {
  BYPASS_COOKIE,
  clearMaintenanceCache,
} from "../src/worker/maintenance";
import { mailTo, ORIGIN, waitForMail } from "./helpers";

/*
 * The first production admin (phase 8 ruling 18). `bun run admin:grant
 * --create` inserts a verified admin with no credential; production first
 * deploys with maintenance on, so that admin must be able to sign in with
 * an email code through the sign-in-only Better Auth, fetch the bypass
 * cookie and use the site. The row comes from the script's own SQL
 * (`@smog/config/admin-grant`, `buildGrantSql`'s statements), run on this
 * D1 with every migration.
 */

const OTP_CODE = /\b\d{6}\b/;

function binding<T>(value: T | undefined, name: string): T {
  if (!value) {
    throw new Error(`[test] The ${name} binding is missing`);
  }
  return value;
}

const kv = binding(env.KV, "KV");
const db = binding(env.DB, "DB");

function ip(): string {
  return `198.51.100.${Math.floor(Math.random() * 250) + 1}-${crypto.randomUUID()}`;
}

function fetchSite(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(`${ORIGIN}${path}`, {
    redirect: "manual",
    ...init,
  });
}

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return fetchSite(path, {
    body: JSON.stringify(body),
    headers: {
      "cf-connecting-ip": ip(),
      "content-type": "application/json",
      origin: ORIGIN,
      ...headers,
    },
    method: "POST",
  });
}

function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** Runs `admin:grant --create`'s statements in order, as wrangler does. */
async function grantCreate(email: string): Promise<void> {
  const statements = buildGrantStatements(email, { create: true });
  expect(statements).toHaveLength(2);
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

afterEach(async () => {
  await kv.delete(MAINTENANCE_KV_KEY);
  clearMaintenanceCache();
});

describe("the first admin under maintenance (admin:grant --create)", () => {
  it("signs in with an email code, gets the bypass cookie and uses the site", async () => {
    const email = `first-admin-${crypto.randomUUID()}@example.test`;
    await grantCreate(email);
    const row = await db
      .prepare(
        "SELECT id, name, role, email_verified, banned, welcomed_at FROM user WHERE email = ?"
      )
      .bind(email)
      .first<{
        banned: number;
        email_verified: number;
        id: string;
        name: string;
        role: string;
        welcomed_at: number | null;
      }>();
    expect(row).toMatchObject({
      banned: 0,
      email_verified: 1,
      name: "",
      role: "admin",
    });
    expect(row?.welcomed_at).toBeGreaterThan(0);
    const accounts = await db
      .prepare("SELECT count(*) AS n FROM account WHERE user_id = ?")
      .bind(row?.id)
      .first<{ n: number }>();
    expect(accounts?.n).toBe(0);

    await kv.put(
      MAINTENANCE_KV_KEY,
      JSON.stringify({ bypassVersion: 4, enabled: true })
    );
    clearMaintenanceCache();

    // 1. A sign-in code, from the sign-in-only server.
    const sent = await post("/api/auth/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    expect(sent.status).toBe(200);
    await sent.body?.cancel();
    const [mail] = await waitForMail(email, {
      match: ({ text }) => OTP_CODE.test(text),
    });
    const otp = mail?.text.match(OTP_CODE)?.[0] ?? "";
    expect(otp).not.toBe("");

    // 2. The sign-in.
    const signedIn = await post("/api/auth/sign-in/email-otp", { email, otp });
    expect(signedIn.status).toBe(200);
    const session = cookiesOf(signedIn);
    expect(session).toContain("session_token=");

    // Signed in is not enough: the site is still closed.
    const closed = await fetchSite("/admin", { headers: { cookie: session } });
    expect(closed.status).toBe(503);
    await closed.body?.cancel();

    // 3. The bypass cookie.
    const bypass = await post(
      "/api/maintenance/bypass",
      {},
      { cookie: session }
    );
    expect(bypass.status).toBe(200);
    expect(await bypass.json()).toMatchObject({ bypassVersion: 4 });
    const bypassCookie = cookiesOf(bypass);
    expect(bypassCookie.startsWith(`${BYPASS_COOKIE}=`)).toBe(true);

    // 4. The site, as an admin.
    for (const path of ["/account", "/admin"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time.
      const page = await fetchSite(path, {
        headers: { cookie: `${session}; ${bypassCookie}` },
      });
      expect(page.status, path).toBe(200);
      await page.body?.cancel();
    }

    // Nothing but the code was mailed (no welcome), and the account is
    // unchanged: still one verified admin with no credential.
    expect(
      (await mailTo(email)).map(({ text }) => OTP_CODE.test(text))
    ).toEqual([true]);
    const after = await db
      .prepare(
        "SELECT count(*) AS n, min(role) AS role, min(email_verified) AS verified FROM user WHERE email = ?"
      )
      .bind(email)
      .first<{ n: number; role: string; verified: number }>();
    expect(after).toEqual({ n: 1, role: "admin", verified: 1 });
  });

  it("runs again on the same email without a second row or a demotion", async () => {
    const email = `first-admin-${crypto.randomUUID()}@example.test`;
    await grantCreate(email);
    await grantCreate(email);
    const rows = await db
      .prepare("SELECT role FROM user WHERE email = ?")
      .bind(email)
      .all<{ role: string }>();
    expect(rows.results).toEqual([{ role: "admin" }]);
  });
});
