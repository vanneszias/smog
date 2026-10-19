import { defineRequestState } from "@better-auth/core/context";
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
  type EmailOutbox,
  type EmailTemplateId,
  type EmailTemplateProps,
  emailLocale,
  type OutboxEmail,
} from "@smog/email";
import { betterAuth, type User } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthMiddleware,
  sendVerificationEmailFn,
} from "better-auth/api";
import { admin, captcha, emailOTP, magicLink } from "better-auth/plugins";
import { and, eq, isNull, sql } from "drizzle-orm";
import { COOKIE_PREFIX } from "./cookie";
import type { AuthEnv } from "./env";
import {
  APP_MAGIC_LINK_PATH,
  MAGIC_LINK_TTL_SECONDS,
  OTP_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PROFILE_NAME_MAX,
  profileNameSchema,
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

/**
 * Every endpoint of Better Auth's admin plugin (ruling 6): off over HTTP,
 * so roles, bans and deletions change only through `@smog/admin`, which
 * calls `auth.api` (unaffected by `disabledPaths`) and writes the audit
 * entry. Impersonation is not offered at all. A test enumerates the
 * configured instance's `/admin/*` endpoints against this list.
 */
export const ADMIN_DISABLED_PATHS = [
  "/admin/ban-user",
  "/admin/create-user",
  "/admin/get-user",
  "/admin/has-permission",
  "/admin/impersonate-user",
  "/admin/list-user-sessions",
  "/admin/list-users",
  "/admin/remove-user",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/stop-impersonating",
  "/admin/unban-user",
  "/admin/update-user",
] as const;

export interface CreateAuthOptions {
  /** The site origin, e.g. `http://localhost:5173` (`SITE_URL`). */
  baseURL: string;
  db: Db;
  env: AuthEnv;
  /**
   * Where the auth emails and the welcome email go (phase 6 ruling 8): the
   * site's `QueueEmailOutbox` on `EMAIL_QUEUE`, so they are rendered and
   * sent by the email consumer; tests use `DirectEmailOutbox`.
   */
  outbox: EmailOutbox;
  /**
   * Existing users only (the site during maintenance): every sign-up is
   * off, no user is ever created (the create hook refuses), a code or a
   * magic link is mailed only to an address that has an account, and the
   * code endpoint sends sign-in codes only.
   */
  signInOnly?: boolean | undefined;
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

function socialProviders(env: AuthEnv, disableSignUp: boolean) {
  return {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            disableSignUp,
          },
        }
      : {}),
    ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
      ? {
          apple: {
            clientId: env.APPLE_CLIENT_ID,
            clientSecret: env.APPLE_CLIENT_SECRET,
            disableSignUp,
            ...(env.APPLE_APP_BUNDLE_IDENTIFIER
              ? { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER }
              : {}),
          },
        }
      : {}),
  };
}

/** Where a new user's name and photo come from a provider, not our client. */
function isProviderPath(path: string): boolean {
  return path === "/sign-in/social" || path.startsWith("/callback/");
}

/** At most `PROFILE_NAME_MAX` UTF-16 units, never half a character. */
function truncateName(name: string): string {
  const chars = Array.from(name);
  while (chars.join("").length > PROFILE_NAME_MAX) {
    chars.pop();
  }
  return chars.join("");
}

function badRequest(code: string, message: string): APIError {
  return new APIError("BAD_REQUEST", { code, message });
}

/**
 * The name and photo a new user gets (`databaseHooks.user.create.before`).
 * Sign-up by email: `profileNameSchema` (1..80 after trim, as
 * `account.updateProfile`). A code or magic-link sign-up may leave it
 * empty, never over 80. A provider's name (Google, Apple) is cut to 80
 * instead, so a long display name never blocks a sign-in. Only a provider
 * sets `image`: our clients never send one, so a client-set photo is
 * refused. Server-side creates (no endpoint: the seed, the migration) are
 * trusted.
 */
function newUserProfile(
  data: { image?: string | null | undefined; name?: string | undefined },
  path: string | undefined
): { image?: null; name: string } {
  const name = (data.name ?? "").trim();
  if (path === undefined) {
    return { name };
  }
  if (isProviderPath(path)) {
    return { name: truncateName(name) };
  }
  if (data.image !== undefined && data.image !== null) {
    throw badRequest("INVALID_IMAGE", "A profile photo cannot be set here");
  }
  const valid =
    path === "/sign-up/email"
      ? profileNameSchema.safeParse(name).success
      : name.length <= PROFILE_NAME_MAX;
  if (!valid) {
    throw badRequest(
      "INVALID_NAME",
      `The name must be 1 to ${PROFILE_NAME_MAX} characters`
    );
  }
  return { image: null, name };
}

/** The only code type a sign-in-only server sends. */
const SIGN_IN_OTP_TYPE = "sign-in";

/**
 * The Better Auth server for one request (spec §6): D1 through Drizzle,
 * sessions read from D1 on every request (bans, revocation and deletion
 * take effect at once), every sign-in method, and our emails.
 */
export function createAuth(options: CreateAuthOptions) {
  const { db, env } = options;
  const signInOnly = options.signInOnly ?? false;

  /** The account behind an address (its locale), or undefined. */
  async function findAccount(
    email: string
  ): Promise<{ locale: string | null } | undefined> {
    return await db.query.user.findFirst({
      columns: { locale: true },
      where: eq(user.email, email.toLowerCase()),
    });
  }

  async function userLocale(email: string): Promise<string | null> {
    return (await findAccount(email))?.locale ?? null;
  }

  /**
   * Hands an auth email to the outbox. No idempotency key: every code and
   * link is new. `From`/`Reply-To` are the consumer's, from env.
   */
  async function send<Id extends EmailTemplateId>(
    template: Id,
    to: string,
    props: EmailTemplateProps[Id],
    context: { locale: string | null; request?: Request | undefined }
  ): Promise<void> {
    try {
      await options.outbox.send({
        locale: emailLocale({
          request: context.request,
          userLocale: context.locale,
        }),
        props,
        template,
        to,
      } as OutboxEmail);
    } catch (error) {
      // Better Auth catches and logs a failed send on most endpoints
      // (`runInBackgroundOrAwait`) and answers 200; the `after` hook turns
      // this mark into an error, so the user asks again (review I1).
      (await emailFailure.get()).failed = true;
      throw error;
    }
  }

  /**
   * Claims the welcome email for an account (phase 8 ruling 16, migration
   * 0012): sets `welcomed_at` only while it is NULL, and answers whether
   * this call set it. D1 runs one write at a time, so of two concurrent
   * verifications exactly one wins. `updated_at` keeps its value (Drizzle
   * would bump it): the claim is not a profile change. Drizzle directly,
   * not Better Auth's adapter: the column is server-only.
   */
  async function claimWelcome(id: string): Promise<boolean> {
    const claimed = await db
      .update(user)
      .set({ updatedAt: sql`${user.updatedAt}`, welcomedAt: new Date() })
      .where(and(eq(user.id, id), isNull(user.welcomedAt)))
      .returning({ id: user.id });
    return claimed.length > 0;
  }

  /**
   * The welcome email (E-01, ruling 8): once per account, when its address
   * becomes verified. The D1 claim decides first (`welcomed_at`, so an
   * account marked by the 0012 backfill or the Convex import is never
   * welcomed); the outbox key `welcome:<userId>` stays as a second filter
   * in the consumer. A failure is logged and never fails the sign-up or the
   * verification: the account is fine without it. A claim that throws
   * skips the enqueue (a missed welcome is harmless, a duplicate is what
   * the claim prevents), and a claimed welcome whose enqueue fails is not
   * retried. The sign-in-only server never claims or sends it.
   */
  async function welcome(
    target: { email: string; id: string; locale?: unknown; name: string },
    request: Request | undefined
  ): Promise<void> {
    if (signInOnly) {
      return;
    }
    try {
      if (!(await claimWelcome(target.id))) {
        return;
      }
    } catch (error) {
      console.error("[auth] Failed to claim the welcome email:", error);
      return;
    }
    try {
      await options.outbox.send({
        idempotencyKey: `welcome:${target.id}`,
        locale: emailLocale({ request, userLocale: localeOf(target) }),
        props: { name: target.name || null, url: env.SITE_URL },
        template: "transactional/welcome",
        to: target.email,
      });
    } catch (error) {
      console.error("[auth] Failed to queue the welcome email:", error);
    }
  }

  /**
   * Better Auth's update hooks see the change (`before`) and the updated
   * row (`after`), never the row before. `before` decides whether this
   * update verifies an unverified address and leaves the answer for
   * `after` under the endpoint context both share; an update outside an
   * endpoint (our own server code) never verifies an address.
   */
  const verifying = new WeakMap<object, number>();

  /**
   * Whether this request failed to hand an auth email to the outbox. Better
   * Auth runs the hooks and the endpoint inside one request state, so the
   * `after` hook sees what `send` marked.
   */
  const emailFailure = defineRequestState(() => ({ failed: false }));

  /**
   * The unverified account a repeated email sign-up asked for (Better
   * Auth's `onExistingUserSignUp`), so the `after` hook mails it a fresh
   * verification link with the endpoint's context (phase 6 jobs M-2).
   */
  const repeatedSignUp = defineRequestState((): { user: User | null } => ({
    user: null,
  }));

  /** Whether `data` turns an unverified address into a verified one. */
  async function becomesVerified(data: {
    email?: unknown;
    emailVerified?: unknown;
  }): Promise<boolean> {
    if (data.emailVerified !== true) {
      return false;
    }
    if (typeof data.email !== "string") {
      // Every Better Auth path that sets only `emailVerified` checks first
      // that the address is unverified (link, magic link, code reset,
      // social sign-in over an unproven account, account linking).
      return true;
    }
    // A code verification writes the address too: a verified one is a
    // repeat, and an address no user has yet is an email change.
    const current = await db.query.user.findFirst({
      columns: { emailVerified: true },
      where: eq(user.email, data.email.toLowerCase()),
    });
    return current?.emailVerified === false;
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
    databaseHooks: {
      user: {
        create: {
          // A code, magic-link or social sign-up arrives verified. Rows
          // inserted by SQL (the seed, the phase 8 import) run no hook.
          after: async (created, context) => {
            if (created.emailVerified) {
              await welcome(created, context?.request);
            }
          },
          // biome-ignore lint/suspicious/useAwait: Better Auth's hook signature is async.
          before: async (data, context) => {
            if (signInOnly) {
              throw new APIError("FORBIDDEN", {
                code: "SIGN_UP_DISABLED",
                message: "Sign-up is closed during maintenance",
              });
            }
            return { data: newUserProfile(data, context?.path) };
          },
        },
        update: {
          after: async (updated, context) => {
            const pending = context ? (verifying.get(context) ?? 0) : 0;
            if (!(context && pending > 0 && updated?.emailVerified)) {
              return;
            }
            verifying.set(context, pending - 1);
            await welcome(updated, context.request);
          },
          before: async (data, context) => {
            if (context && (await becomesVerified(data))) {
              verifying.set(context, (verifying.get(context) ?? 0) + 1);
            }
          },
        },
      },
    },
    // Deletion goes only through `account.delete` (`auth.api`, which
    // `disabledPaths` does not affect): it needs the typed DELETE and has
    // its rate limits, which the HTTP route would skip. The profile is
    // written only by `account.updateProfile` (the name bound); Better
    // Auth's `/update-user` takes any name and photo. The admin plugin's
    // endpoints are `auth.api` only (`ADMIN_DISABLED_PATHS`, ruling 6).
    disabledPaths: [
      "/delete-user",
      "/delete-user/callback",
      "/update-user",
      ...ADMIN_DISABLED_PATHS,
    ],
    emailAndPassword: {
      disableSignUp: signInOnly,
      enabled: true,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      // A sign-up with the address of an account that never confirmed it
      // (its first verification email may never have left: EMAIL_NOT_SENT)
      // mails a fresh link from the `after` hook. A verified account gets
      // nothing, and the answer is Better Auth's generic one either way.
      onExistingUserSignUp: async ({ user: existing }) => {
        if (!existing.emailVerified) {
          (await repeatedSignUp.get()).user = existing;
        }
      },
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
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const repeated = (await repeatedSignUp.get()).user;
        if (repeated && ctx.path === "/sign-up/email") {
          try {
            // Better Auth's own token and URL (the body's callbackURL).
            await sendVerificationEmailFn(ctx, repeated);
          } catch (error) {
            // `send` marked the failure: answered as EMAIL_NOT_SENT below.
            console.error(
              "[auth] Failed to resend the verification email:",
              error
            );
          }
        }
        if ((await emailFailure.get()).failed) {
          throw new APIError("SERVICE_UNAVAILABLE", {
            code: "EMAIL_NOT_SENT",
            message: "The email could not be sent; try again",
          });
        }
      }),
      // biome-ignore lint/suspicious/useAwait: Better Auth's middleware signature is async.
      before: createAuthMiddleware(async (ctx) => {
        const type = (ctx.body as { type?: unknown } | undefined)?.type;
        if (
          signInOnly &&
          ctx.path === "/email-otp/send-verification-otp" &&
          type !== SIGN_IN_OTP_TYPE
        ) {
          throw new APIError("FORBIDDEN", {
            code: "SIGN_IN_ONLY",
            message: "Only sign-in codes are sent during maintenance",
          });
        }
      }),
    },
    plugins: [
      admin({ adminRoles: ["admin"], defaultRole: "user" }),
      emailOTP({
        disableSignUp: signInOnly,
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
        disableSignUp: signInOnly,
        expiresIn: MAGIC_LINK_TTL,
        sendMagicLink: async ({ email, token, url }, ctx) => {
          const known = await findAccount(email);
          if (signInOnly && !known) {
            // No account and no sign-up: the link could only fail, so
            // nothing is mailed (Better Auth sends before it checks).
            return;
          }
          await send(
            "auth/magic-link",
            email,
            {
              minutes: minutes(MAGIC_LINK_TTL),
              url: appMagicLinkURL({ siteURL: env.SITE_URL, token, url }),
            },
            { locale: known?.locale ?? null, request: ctx?.request }
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
    socialProviders: socialProviders(env, signInOnly),
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
