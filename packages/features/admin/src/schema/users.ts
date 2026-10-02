/**
 * Task 5: the user admin schemas (list filters, the user detail, guards' reason codes). Everything exported here is part of `@smog/admin/schema`
 * (`index.ts` re-exports this file), so Task 5 edits only this file.
 *
 * Client-safe: the roles come from `@smog/db/enums` (no tables).
 */
import { ROLES } from "@smog/db/enums";
import { z } from "zod";

export const USERS_PAGE_MAX = 100;
export const USERS_PAGE_DEFAULT = 50;
/** A ban reason, after trimming. */
export const BAN_REASON_MAX = 200;
/** The longest timed ban; without `expiresInDays` a ban has no end. */
export const BAN_DAYS_MAX = 365;
/** The longest search text. */
export const USER_QUERY_MAX = 200;

export const adminRoleSchema = z.enum(ROLES);
export type AdminRole = z.infer<typeof adminRoleSchema>;

const userIdSchema = z.string().min(1).max(200);

export const adminUserListInputSchema = z.object({
  /** Only accounts whose ban is in force (`true`) or not (`false`). */
  banned: z.boolean().optional(),
  cursor: z.string().min(1).max(1024).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(USERS_PAGE_MAX)
    .default(USERS_PAGE_DEFAULT),
  /**
   * Part of the email or the name, case-insensitive, taken literally
   * (`%` and `_` are no wildcards).
   */
  q: z.string().trim().min(1).max(USER_QUERY_MAX).optional(),
  role: adminRoleSchema.optional(),
});

export type AdminUserListInput = z.input<typeof adminUserListInputSchema>;
/** The list input after defaults (`limit` set). */
export type AdminUserListQuery = z.output<typeof adminUserListInputSchema>;

/** One account as the users table shows it. */
export const adminUserSchema = z.object({
  /** Epoch milliseconds; `null` for a ban without end (or no ban). */
  banExpires: z.number().int().nullable(),
  /** Whether a ban is in force now (an expired ban reads `false`). */
  banned: z.boolean(),
  banReason: z.string().nullable(),
  /** Epoch milliseconds. */
  createdAt: z.number().int(),
  email: z.string(),
  emailVerified: z.boolean(),
  id: z.string(),
  name: z.string(),
  role: adminRoleSchema,
});

export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserPageSchema = z.object({
  items: z.array(adminUserSchema),
  /** Pass as `cursor` for the next (older) page; `null` on the last. */
  nextCursor: z.string().nullable(),
});

export type AdminUserPage = z.infer<typeof adminUserPageSchema>;

/**
 * One account with how it signs in and what it holds. Phase 6 adds the
 * sponsorships by email.
 */
export const adminUserDetailSchema = adminUserSchema.extend({
  favorites: z.number().int().nonnegative(),
  lists: z.number().int().nonnegative(),
  /**
   * Its sign-in methods: the account providers (`credential` for a
   * password, `google`, `apple`) and `passkey` when it has one. Codes and
   * magic links need none.
   */
  methods: z.array(z.string()),
  /** Sessions that have not expired. */
  sessions: z.number().int().nonnegative(),
});

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

export const getUserInputSchema = z.object({ id: userIdSchema });

export const userIdInputSchema = z.object({ userId: userIdSchema });

export const setRoleInputSchema = z.object({
  role: adminRoleSchema,
  userId: userIdSchema,
});

export const banUserInputSchema = z.object({
  /** Days until the ban ends; without it the ban has no end. */
  expiresInDays: z.number().int().min(1).max(BAN_DAYS_MAX).optional(),
  reason: z.string().trim().min(1).max(BAN_REASON_MAX),
  userId: userIdSchema,
});

export type BanUserInput = z.input<typeof banUserInputSchema>;

export const deleteUserInputSchema = z.object({
  /** Must equal the account's email (case-insensitive), else `VALIDATION`. */
  confirmEmail: z.string().trim().min(1).max(320),
  userId: userIdSchema,
});

/**
 * Why a user action was refused (`INVALID_STATE` `data.reason`, ruling 7),
 * before anything changed:
 * - `self`: an admin cannot change their own role, ban or delete themselves;
 * - `lastAdmin`: the last admin cannot be demoted;
 * - `adminTarget`: an admin must be demoted before a ban or a delete;
 * - `targetBanned`: an account whose ban is in force is not promoted;
 * - `unchanged`: the account already has that role;
 * - `alreadyBanned` / `notBanned`: the ban is already (not) in force.
 */
export const USER_GUARD_REASONS = [
  "self",
  "lastAdmin",
  "adminTarget",
  "targetBanned",
  "unchanged",
  "alreadyBanned",
  "notBanned",
] as const;

export type UserGuardReason = (typeof USER_GUARD_REASONS)[number];

export const userInvalidStateDataSchema = z.object({
  reason: z.enum(USER_GUARD_REASONS),
});

export const userResultSchema = z.object({ user: adminUserSchema });

export const userDeletedResultSchema = z.object({ id: z.string() });
