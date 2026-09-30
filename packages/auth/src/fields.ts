/**
 * Client-safe auth definitions shared by the server config and the web and
 * Expo clients. This module must never import `./server`, `./env`,
 * `./session` or anything that references Workers types
 * (`test/client-entries.test.ts` and `tsconfig.client.json` guard that).
 */
import { LOCALES } from "@smog/config/constants";
import { z } from "zod";

export type Role = "user" | "admin";

/** Password bounds: set on the server and checked by the forms first. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Digits in an email sign-in code. */
export const OTP_LENGTH = 6;

/**
 * Our columns on Better Auth's `user` (spec §5.1): `locale` is set by the
 * client (validated `nl|en|fr`), `legacyId` only by the migration.
 */
export const USER_ADDITIONAL_FIELDS = {
  legacyId: { input: false, required: false, type: "string" },
  locale: {
    input: true,
    required: false,
    type: "string",
    validator: { input: z.enum(LOCALES).nullish() },
  },
} as const;

/**
 * The site path of a magic link the app requested (a universal / app
 * link): `?token=` only. The app opens it and exchanges the single-use
 * token itself (`magicLink.verify` without a callback), so no session
 * cookie ever travels in a URL. In a browser the site offers to sign in
 * there instead.
 */
export const APP_MAGIC_LINK_PATH = "/magic-link/app";

/**
 * A magic link's lifetime (seconds). The app also uses it: it exchanges a
 * link without asking only within this window after it requested one.
 */
export const MAGIC_LINK_TTL_SECONDS = 5 * 60;

/** Better Auth's magic-link token: 32 letters; generous but strict. */
export const MAGIC_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
