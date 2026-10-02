import { env } from "cloudflare:workers";
import { user } from "@smog/db";
import type { Db } from "@smog/db/client";
import { createTestDb } from "@smog/db/testing";
import { MemoryEmailSender } from "@smog/email";
import { newId } from "@smog/utils";
import { eq } from "drizzle-orm";
import { type AuthEnv, createAuth } from "../src/server";

const LINK = /https?:\/\/\S+/;
const CODE = /\b\d{6}\b/;

export const SITE_URL = "http://localhost:5173";
export const PASSWORD = "correct horse battery";

const DEV_ENV: AuthEnv = {
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
  EMAIL_FROM: "SMOG & Co <noreply@smog.vlaanderen>",
  EMAIL_REPLY_TO: "info@smog.vlaanderen",
  ENVIRONMENT: "dev",
  SITE_URL,
};

export function uniqueEmail(): string {
  return `${newId()}@smog.test`;
}

export function setup(
  overrides: Partial<AuthEnv> = {},
  options: { signInOnly?: boolean } = {}
) {
  const authEnv = { ...DEV_ENV, ...overrides };
  const email = new MemoryEmailSender();
  const db: Db = createTestDb(env);
  const auth = createAuth({
    baseURL: authEnv.SITE_URL,
    db,
    email,
    env: authEnv,
    ...options,
  });

  /** Calls `/api/auth<path>` through the handler, like the site route does. */
  async function call(
    path: string,
    init: {
      body?: unknown;
      cookie?: string;
      headers?: Record<string, string>;
      method?: string;
    } = {}
  ): Promise<Response> {
    const headers = new Headers({
      origin: authEnv.SITE_URL,
      ...init.headers,
    });
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (init.cookie) {
      headers.set("cookie", init.cookie);
    }
    const url = path.startsWith("http")
      ? path
      : `${authEnv.SITE_URL}/api/auth${path}`;
    return await auth.handler(
      new Request(url, {
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        headers,
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        redirect: "manual",
      })
    );
  }

  return { auth, authEnv, call, db, email };
}

/** `name=value; …` for a follow-up request, from a response's Set-Cookie. */
export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

export function sessionCookie(response: Response): string | undefined {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.includes("session_token="));
}

/** The first http(s) link in a text email. */
export function linkIn(text: string | undefined): string {
  const match = text?.match(LINK);
  if (!match) {
    throw new Error(`no link in: ${text}`);
  }
  return match[0];
}

/** The 6-digit code in a text email. */
export function codeIn(text: string | undefined): string {
  const match = text?.match(CODE);
  if (!match) {
    throw new Error(`no code in: ${text}`);
  }
  return match[0];
}

export async function findUser(db: Db, email: string) {
  return await db.query.user.findFirst({ where: eq(user.email, email) });
}
