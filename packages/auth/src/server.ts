import { expo } from "@better-auth/expo";
import { passkey } from "@better-auth/passkey";
import { LOCALES } from "@smog/config/constants";
import {
  account,
  passkey as passkeyTable,
  session,
  user,
  verification,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import {
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
import { z } from "zod";
import { COOKIE_PREFIX } from "./cookie";
import type { AuthEnv } from "./env";
import { kvSecondaryStorage } from "./kv-storage";

export type { AuthEnv } from "./env";

/** Link and code lifetimes (seconds), shared by the config and the emails. */
const VERIFY_EMAIL_TTL = 60 * 60;
const RESET_PASSWORD_TTL = 60 * 60;
const OTP_TTL = 5 * 60;
const MAGIC_LINK_TTL = 5 * 60;

/** Endpoints that need a Turnstile token when TURNSTILE_SECRET_KEY is set. */
const CAPTCHA_ENDPOINTS = [
  "/sign-up/email",
  "/sign-in/email",
  "/request-password-reset",
  "/email-otp/send-verification-otp",
  "/sign-in/magic-link",
];

export interface CreateAuthOptions {
  /** The site origin, e.g. `http://localhost:5173` (`SITE_URL`). */
  baseURL: string;
  db: Db;
  email: EmailSender;
  env: AuthEnv;
  kv: KVNamespace;
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
 * KV secondary storage, every sign-in method, and our emails.
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
    appName: "SMOG & Co",
    basePath: "/api/auth",
    baseURL: options.baseURL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { account, passkey: passkeyTable, session, user, verification },
    }),
    emailAndPassword: {
      enabled: true,
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
          { minutes: minutes(VERIFY_EMAIL_TTL), name: target.name, url },
          { locale: localeOf(target), request }
        );
      },
    },
    plugins: [
      admin({ adminRoles: ["admin"], defaultRole: "user" }),
      emailOTP({
        expiresIn: OTP_TTL,
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
        sendMagicLink: async ({ email, url }, ctx) => {
          await send(
            "auth/magic-link",
            email,
            { minutes: minutes(MAGIC_LINK_TTL), url },
            { locale: await userLocale(email), request: ctx?.request }
          );
        },
        storeToken: "hashed",
      }),
      passkey({
        origin: env.SITE_URL,
        rpID: new URL(env.SITE_URL).hostname,
        rpName: "SMOG & Co",
      }),
      expo(),
      ...(env.TURNSTILE_SECRET_KEY
        ? [
            captcha({
              endpoints: CAPTCHA_ENDPOINTS,
              provider: "cloudflare-turnstile",
              secretKey: env.TURNSTILE_SECRET_KEY,
            }),
          ]
        : []),
    ],
    rateLimit: { enabled: env.ENVIRONMENT !== "dev" },
    secondaryStorage: kvSecondaryStorage(options.kv),
    secret: env.BETTER_AUTH_SECRET,
    session: {
      // Sessions live in D1 too: admin revocation, the account export and
      // the admin user list read them. KV is the fast read path.
      storeSessionInDatabase: true,
    },
    socialProviders: socialProviders(env),
    trustedOrigins: trustedOrigins(env),
    user: {
      additionalFields: {
        legacyId: { input: false, required: false, type: "string" },
        locale: {
          input: true,
          required: false,
          type: "string",
          validator: { input: z.enum(LOCALES).nullish() },
        },
      },
    },
    verification: {
      // Single-use tokens and codes are consumed in D1 (strongly
      // consistent); KV has no atomic get-and-delete.
      storeInDatabase: true,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
