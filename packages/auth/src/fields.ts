/**
 * Client-safe auth definitions shared by the server config and the web and
 * Expo clients. This module must never import `./server`, `./env`,
 * `./session` or anything that references Workers types
 * (`test/client-entries.test.ts` and `tsconfig.client.json` guard that).
 */
import { localeCodeSchema } from "@smog/config/locale";
import { z } from "zod";

export type Role = "user" | "admin";

/**
 * The roles a user can hold besides being a learner (phase 10b, the
 * `user_role` table; `@smog/db` `USER_ROLES` is the same list, a test keeps
 * them equal). `admin` implies every other role (`hasRole`).
 */
export const USER_ROLES = ["translator", "teacher", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** `roles` of a session user, from raw values: known roles only, sorted, once each. */
export function normalizeRoles(values: readonly unknown[]): UserRole[] {
  return USER_ROLES.filter((role) => values.includes(role));
}

/**
 * Whether a user holding `roles` may act as one of `allowed`: the `admin`
 * role passes every check, anything else must hold one of them.
 */
export function hasRole(
  roles: readonly string[] | null | undefined,
  ...allowed: readonly UserRole[]
): boolean {
  if (!roles) {
    return false;
  }
  return (
    roles.includes("admin") || allowed.some((role) => roles.includes(role))
  );
}

/** Password bounds: set on the server and checked by the forms first. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * `user.name`, trimmed: 1..80 characters. `account.updateProfile` and
 * sign-up by email use this schema; a code, magic-link or Apple sign-up
 * may leave the name empty (the account is shown by its email).
 */
export const PROFILE_NAME_MAX = 80;

export const profileNameSchema = z.string().trim().min(1).max(PROFILE_NAME_MAX);

/** Digits in an email sign-in code. */
export const OTP_LENGTH = 6;

/**
 * Our columns on Better Auth's `user` (spec §5.1): `locale` is set by the
 * client (a well-formed language code here; the sign-up hook replaces one
 * that is not an enabled language with the default, `signUpLocale`),
 * `legacyId` only by the migration.
 */
export const USER_ADDITIONAL_FIELDS = {
  legacyId: { input: false, required: false, type: "string" },
  locale: {
    input: true,
    required: false,
    type: "string",
    validator: { input: localeCodeSchema.nullish() },
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
