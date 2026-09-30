import { expo } from "@better-auth/expo";
import { passkey } from "@better-auth/passkey";
import {
  account,
  passkey as passkeyTable,
  session,
  user,
  verification,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import {
  APP_NAME,
  type EmailSender,
  type EmailTemplateId,
  type EmailTemplateProps,
  emailLocale,
  sendEmail,
} from "@smog/email";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, captcha, emailOTP, magicLink } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { COOKIE_PREFIX } from "./cookie";
import type { AuthEnv } from "./env";
import {
  APP_MAGIC_LINK_PATH,
  MAGIC_LINK_TTL_SECONDS,
  OTP_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USER_ADDITIONAL_FIELDS,
} from "./fields";

export type { AuthEnv } from "./env";

/** Link and code lifetimes (seconds), shared by the config and the emails. */
const VERIFY_EMAIL_TTL = 60 * 60;
const RESET_PASSWORD_TTL = 60 * 60;
const OTP_TTL = 5 * 60;
const MAGIC_LINK_TTL = MAGIC_LINK_TTL_SECONDS;
/**
 * How recent a sign-in must be for sensitive actions (seconds): Better
 * Auth's `session.freshAge` default, one day.
 */
const SESSION_FRESH_AGE = 24 * 60 * 60;

/**
 * Endpoints that need a Turnstile token when TURNSTILE_SECRET_KEY is set:
 * sign-up/sign-in and every unauthenticated endpoint that sends an email
 * (a test calls every endpoint and checks this list covers the senders).
 */
export const CAPTCHA_ENDPOINTS = [
  "/sign-up/email",
  "/sign-in/email",
  "/request-password-reset",
  "/send-verification-email",
  "/email-otp/send-verification-otp",
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
  "/sign-in/magic-link",
];

export interface CreateAuthOptions {
  /** The site origin, e.g. `http://localhost:5173` (`SITE_URL`). */
  baseURL: string;
  db: Db;
  email: EmailSender;
  env: AuthEnv;
  /** Runs email sends after the response (`waitUntil`); awaited when unset. */
  waitUntil?: ((promise: Promise<unknown>) => void) | undefined;
}

const minutes = (seconds: number): number => Math.round(seconds / 60);

function localeOf(value: unknown): string | null {
  return typeof value === "object" &&
    value !== null &&
    "locale" in value &&
    typeof value.locale === "string"
    ? value.locale
    : null;
}

/**
 * The link a magic-link email carries. Better Auth's own link
 * (`/api/auth/magic-link/verify?token=…&callbackURL=…`) stays for the web.
 * When the callback is the app (`smog://`, or `exp://` in development;
 * Better Auth's origin check already accepted it as trusted), the email
 * gets the app link instead: `<site>/magic-link/app?token=…`, a universal
 * link the app opens and exchanges itself. The callbacks are dropped, so
 * the link can redirect nowhere, and it carries no address (no personal
 * data in logs or the address bar).
 */
export function appMagicLinkURL({
  siteURL,
  token,
  url,
}: {
  siteURL: string;
  token: string;
  url: string;
}): string {
  let callback: URL;
  try {
    callback = new URL(
      new URL(url).searchParams.get("callbackURL") ?? "/",
      siteURL
    );
  } catch {
    return url;
  }
  if (callback.protocol === "http:" || callback.protocol === "https:") {
    return url;
  }
  const link = new URL(APP_MAGIC_LINK_PATH, siteURL);
  link.searchParams.set("token", token);
  return link.toString();
}

/** `trustedOrigins` for an env: the site, the app scheme, Expo Go in dev. */
function trustedOrigins(env: AuthEnv): string[] {
  return [
    env.SITE_URL,
    "smog://",
    ...(env.ENVIRONMENT === "dev" ? ["exp://"] : []),
    ...(env.APPLE_CLIENT_ID ? ["https://appleid.apple.com"] : []),
  ];
}

function socialProviders(env: AuthEnv) {
  return {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
      ? {
          apple: {
            clientId: env.APPLE_CLIENT_ID,
            clientSecret: env.APPLE_CLIENT_SECRET,
            ...(env.APPLE_APP_BUNDLE_IDENTIFIER
              ? { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER }
              : {}),
          },
        }
      : {}),
  };
}

/**
 * The Better Auth server for one request (spec §6): D1 through Drizzle,
 * sessions read from D1 on every request (bans, revocation and deletion
 * take effect at once), every sign-in method, and our emails.
 */
export function createAuth(options: CreateAuthOptions) {
  const { db, env } = options;

  async function userLocale(email: string): Promise<string | null> {
    const row = await db.query.user.findFirst({
      columns: { locale: true },
      where: eq(user.email, email.toLowerCase()),
    });
    return row?.locale ?? null;
  }

  async function send<Id extends EmailTemplateId>(
    template: Id,
    to: string,
    props: EmailTemplateProps[Id],
    context: { locale: string | null; request?: Request | undefined }
  ): Promise<void> {
    await sendEmail(options.email, {
      from: env.EMAIL_FROM,
      locale: emailLocale({
        request: context.request,
        userLocale: context.locale,
      }),
      props,
      replyTo: env.EMAIL_REPLY_TO,
      template,
      to,
    });
  }

  return betterAuth({
    account: {
      accountLinking: {
        enabled: true,
        // Local accounts must have a verified email before a provider is
        // linked to them (Better Auth's default; pinned here on purpose).
        requireLocalEmailVerified: true,
        trustedProviders: ["google", "apple", "email-password"],
      },
    },
    advanced: {
      ...(options.waitUntil
        ? { backgroundTasks: { handler: options.waitUntil } }
        : {}),
      cookiePrefix: COOKIE_PREFIX,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: env.ENVIRONMENT !== "dev",
    },
    appName: APP_NAME,
    basePath: "/api/auth",
    baseURL: options.baseURL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { account, passkey: passkeyTable, session, user, verification },
    }),
    // Deletion goes only through `account.delete` (`auth.api`, which
    // `disabledPaths` does not affect): it needs the typed DELETE and has
    // its rate limits, which the HTTP route would skip.
    disabledPaths: ["/delete-user", "/delete-user/callback"],
    emailAndPassword: {
      enabled: true,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: RESET_PASSWORD_TTL,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ url, user: target }, request) => {
        await send(
          "auth/reset-password",
          target.email,
          { minutes: minutes(RESET_PASSWORD_TTL), name: target.name, url },
          { locale: localeOf(target), request }
        );
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      expiresIn: VERIFY_EMAIL_TTL,
      sendOnSignUp: true,
      sendVerificationEmail: async ({ url, user: target }, request) => {
        await send(
          "auth/verify-email",
          target.email,
          { minutes: minutes(VERIFY_EMAIL_TTL), url },
          { locale: localeOf(target), request }
        );
      },
    },
    plugins: [
      admin({ adminRoles: ["admin"], defaultRole: "user" }),
      emailOTP({
        expiresIn: OTP_TTL,
        otpLength: OTP_LENGTH,
        sendVerificationOTP: async ({ email, otp }, ctx) => {
          await send(
            "auth/otp",
            email,
            { code: otp, minutes: minutes(OTP_TTL) },
            { locale: await userLocale(email), request: ctx?.request }
          );
        },
        storeOTP: "hashed",
      }),
      magicLink({
        expiresIn: MAGIC_LINK_TTL,
        sendMagicLink: async ({ email, token, url }, ctx) => {
          await send(
            "auth/magic-link",
            email,
            {
              minutes: minutes(MAGIC_LINK_TTL),
              url: appMagicLinkURL({ siteURL: env.SITE_URL, token, url }),
            },
            { locale: await userLocale(email), request: ctx?.request }
          );
        },
        storeToken: "hashed",
      }),
      passkey({
        origin: env.SITE_URL,
        rpID: new URL(env.SITE_URL).hostname,
        rpName: APP_NAME,
      }),
      expo(),
      ...(env.TURNSTILE_SECRET_KEY
        ? [
            captcha({
              allowedHostnames: [
                new URL(env.SITE_URL).hostname,
                // Cloudflare's dummy verifier returns a synthetic hostname.
                ...(env.ENVIRONMENT === "staging" &&
                env.TURNSTILE_SECRET_KEY ===
                  "1x0000000000000000000000000000000AA"
                  ? ["example.com"]
                  : []),
              ],
              endpoints: CAPTCHA_ENDPOINTS,
              provider: "cloudflare-turnstile",
              secretKey: env.TURNSTILE_SECRET_KEY,
            }),
          ]
        : []),
    ],
    // Better Auth's own limiter is a coarse per-isolate backstop: memory
    // storage (a blocked request never extends the window, so a shared
    // school IP cannot be locked out), and never for session reads. The
    // per-IP limit is the RL_AUTH binding on the /api/auth route (Task 3).
    rateLimit: {
      customRules: { "/get-session": false },
      enabled: env.ENVIRONMENT !== "dev",
      storage: "memory",
    },
    secret: env.BETTER_AUTH_SECRET,
    // Better Auth's own freshness window (its default, pinned): account
    // deletion, listing sessions, unlinking a provider and adding a passkey
    // need a session signed in within it (deletion: or the password).
    session: { freshAge: SESSION_FRESH_AGE },
    // No secondary storage and no cookie cache: every session read hits D1,
    // so a ban, a revoked session or a deleted user takes effect at once.
    // Verification values live in D1 as well (single-use, consumed there).
    socialProviders: socialProviders(env),
    trustedOrigins: trustedOrigins(env),
    user: {
      additionalFields: USER_ADDITIONAL_FIELDS,
      // `account.delete` (`@smog/account`) calls it after the user typed
      // DELETE. No confirmation email: a fresh session or the password is
      // the proof. The foreign keys cascade the user's data (spec §5).
      deleteUser: { enabled: true },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
