/**
 * Roles as a set (phase 10b, migration 0020). A user with no row is a plain
 * learner; `translator`, `teacher` and `admin` are rows, and `admin` implies
 * every other role (the guards in `@smog/rpc`, not this table, say so).
 *
 * `user.role` stays the legacy single value Better Auth's admin plugin reads:
 * `admin` while the user holds the `admin` row here, else `user`. Triggers
 * created by the migration keep the two in step in both directions until the
 * code writes both (docs/DECISIONS.md, phase 10b task 1), and
 * `user_role_keep_one_admin` refuses to remove the last admin whose ban is
 * not in force, like `user_keep_one_admin` (migration 0007, recreated by
 * 0015) does on `user.role`. A user delete (a cascade) is not refused:
 * account deletion is guarded in `account.delete`.
 */
import {
  check,
  index,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { USER_ROLES } from "../enums";
import { user } from "./auth";
import { inValues, timestamp } from "./columns";

export const userRole = sqliteTable(
  "user_role",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: USER_ROLES }).notNull(),
    /** The admin who granted it; NULL for the migration's copy, the CLI grant and a deleted admin. */
    grantedBy: text("granted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.role] }),
    check("user_role_role_check", inValues(t.role, USER_ROLES)),
    // Who holds a role (the admin list, the last-admin check, the digest).
    index("user_role_role_user_idx").on(t.role, t.userId),
    index("user_role_granted_by_idx").on(t.grantedBy),
  ]
);
