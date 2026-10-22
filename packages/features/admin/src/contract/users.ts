import { baseContract } from "@smog/rpc/contract";
import {
  adminUserDetailSchema,
  adminUserListInputSchema,
  adminUserPageSchema,
  banUserInputSchema,
  deleteUserInputSchema,
  getUserInputSchema,
  roleInputSchema,
  userDeletedResultSchema,
  userIdInputSchema,
  userInvalidStateDataSchema,
  userResultSchema,
} from "../schema";
import type { AdminProcedures } from "./audit-map";

/**
 * A refused user action's `INVALID_STATE`, with its reason
 * (`userInvalidStateDataSchema`: `self`, `lastAdmin`, `adminTarget`, …).
 */
const USERS_ERRORS = {
  INVALID_STATE: { data: userInvalidStateDataSchema, status: 409 },
} as const;

const usersContract = baseContract.errors(USERS_ERRORS);

/**
 * `admin.users.*`: users, their set of roles and bans (A-23, rulings 6 and 7; phase 10b ruling 5). Task 5 fills this slice (and only this file,
 * `../server/users.ts` and its own tests), so the areas never share lines.
 *
 * Reads come from D1. The writes go through Better Auth's `auth.api`
 * with the request's headers (its `/api/auth/admin/*` HTTP routes are
 * disabled), then write their audit entry (ruling 5: the change first; a
 * failed entry is logged and rethrown). The guards run first: no change to
 * one's own account, the last admin stays, and an admin is demoted before a
 * ban or a delete (`INVALID_STATE` with a `reason`). `NOT_FOUND` for an
 * unknown account.
 */
export const usersSlice = {
  users: {
    /**
     * Bans the account (`reason`, and an end after `expiresInDays`, else
     * none) and revokes its sessions, so its next request is a guest's.
     */
    ban: usersContract.input(banUserInputSchema).output(userResultSchema),
    /**
     * Deletes the account; `confirmEmail` must equal its email
     * (`VALIDATION`). Its data cascades; its audit entries stay with a
     * `null` actor.
     */
    delete: usersContract
      .input(deleteUserInputSchema)
      .output(userDeletedResultSchema),
    /** One account with its sign-in methods and counts. */
    get: baseContract.input(getUserInputSchema).output(adminUserDetailSchema),
    /**
     * Adds translator, teacher or admin to the account's roles (audited
     * `user.role_grant`); its next request has the role. Not for one's own
     * account, and a banned account is not made admin.
     */
    grantRole: usersContract.input(roleInputSchema).output(userResultSchema),
    /**
     * Accounts newest first (`created_at, id` keyset), filtered by role,
     * ban and `q` (email or name, case-insensitive, taken literally).
     */
    list: baseContract
      .input(adminUserListInputSchema)
      .output(adminUserPageSchema),
    /**
     * Removes one role (audited `user.role_revoke`); the next request of the
     * account no longer has it. The last admin keeps the admin role.
     */
    revokeRole: usersContract.input(roleInputSchema).output(userResultSchema),
    /** Lifts a ban in force. */
    unban: usersContract.input(userIdInputSchema).output(userResultSchema),
  },
};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {
  "users.ban": { audit: "user.ban" },
  "users.delete": { audit: "user.delete" },
  "users.get": "read",
  "users.grantRole": { audit: "user.role_grant" },
  "users.list": "read",
  "users.revokeRole": { audit: "user.role_revoke" },
  "users.unban": { audit: "user.unban" },
} as const satisfies AdminProcedures<typeof usersSlice>;
