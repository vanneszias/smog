/**
 * The users transform (phase 8 rulings 7 and 8; U-07, U-12): Convex
 * `users` → Better Auth `user` rows, in `10-users`.
 *
 * - **Guests are skipped.** A row with no `workosId` is a guest; it is
 *   skipped with every row it owns (its favorites, its lists and their
 *   items, its consents), and counted. A row with both `guestId` and
 *   `workosId` is an upgraded guest: a real user.
 * - **Email.** Trimmed and lower-cased. With `--workos-users`, the WorkOS
 *   email wins (Convex stored the email only at creation); differences
 *   are counted. The name is the WorkOS `first last`, trimmed to 80, or
 *   `""`. A user with no email after that is dropped with a warning that
 *   counts what is lost.
 * - **Duplicate emails** merge into the oldest account (`createdAt`, then
 *   `_creationTime`, then `_id`): its `_id` is the merged user's
 *   `legacy_id`, the others' favorites and lists move to it (the learning
 *   transform maps them through `resolveUsers`), and the role is admin if
 *   any of them was.
 * - **The row:** `email_verified = 1`, no `account` row, `role` = Convex
 *   `role ?? "user"` set at insert, `locale` and `image` NULL, `banned`
 *   0, `created_at = createdAt`, `updated_at = lastActiveAt`,
 *   `legacy_id = _id`, `welcomed_at = --now` (never welcomed).
 * - **Existing accounts are claimed, not overwritten** (ruling 7): first
 *   `UPDATE user SET legacy_id = ? WHERE email = ? AND legacy_id IS NULL`
 *   (it never touches `role`, so 0007's trigger never fires, and an admin
 *   made by `admin:grant --create` stays an admin), then
 *   `INSERT … ON CONFLICT (legacy_id) DO NOTHING ON CONFLICT (email) DO
 *   NOTHING`. Child rows find users through `legacyIdRef("user", …)`. A
 *   claimed account whose role differs is reported by the preflight
 *   (task 10, from `claims`), never changed.
 * - **At least one admin:** the plan blocks when no migrated user is an
 *   admin.
 *
 * Staging pseudonymises `user.email` and `user.name` through
 * `pseudonymiser(target)`; the claim then names the pseudonymised address
 * (it matches nothing), so no real address reaches a staging plan.
 */
import { user } from "@smog/db";
import { sql } from "drizzle-orm";
import { insertRow, type ResetUser, renderSql } from "../emit";
import type { UserRow } from "../export-schema";
import { legacyUuid } from "../ids";
import type { WorkosUser } from "../inputs";
import type { TransformContext, TransformResult } from "../plan";
import { type ReportIssue, section } from "../report";
import { pseudonymiser } from "../target";

/** `user.name` is the WorkOS `first last`, trimmed to this many characters. */
const USER_NAME_MAX = 80;

/** Apple's private-relay domain: mail reaches it only after the owner registers the sending domain. */
const PRIVATE_RELAY_DOMAIN = "@privaterelay.appleid.com";

/** At most this many ids in one report issue (report.json); the count is exact. */
export const ISSUE_IDS_MAX = 200;

/**
 * `text` cut to at most `max` UTF-16 units without splitting a surrogate
 * pair, then trimmed at the end (so it never ends in white space).
 */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  let out = text.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd8_00 && last <= 0xdb_ff) {
    out = out.slice(0, -1);
  }
  return out.trimEnd();
}

/** An address as the import stores it: trimmed and lower-cased, or null when empty. */
export function normalizeEmail(
  email: string | null | undefined
): string | null {
  const value = email?.trim().toLowerCase() ?? "";
  return value.length > 0 ? value : null;
}

/** Oldest first: `createdAt`, then `_creationTime`, then `_id`. */
function oldestFirst(a: UserRow, b: UserRow): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  if (a._creationTime !== b._creationTime) {
    return a._creationTime - b._creationTime;
  }
  if (a._id === b._id) {
    return 0;
  }
  return a._id < b._id ? -1 : 1;
}

/** What became of a Convex `users` row. */
type UserResolution =
  /** Migrated; `legacyId` is the merged account's `_id` (the oldest of its email). */
  | { readonly kind: "migrated"; readonly legacyId: string }
  /** A guest (no `workosId`): skipped with everything it owns. */
  | { readonly kind: "guest" }
  /** A real user left with no email: dropped, with everything it owns. */
  | { readonly kind: "noEmail" };

export interface MigratedUser {
  readonly createdAt: number;
  /** The address the import stores (real; the pseudonymiser applies at emit). */
  readonly email: string;
  /** `legacyUuid("user", legacyId)`: the row's id when the import creates it. */
  readonly id: string;
  readonly lastActiveAt: number;
  /** The `_id` of the oldest account of this email. */
  readonly legacyId: string;
  /** The `_id`s of the younger accounts merged into this one (oldest first). */
  readonly mergedFrom: readonly string[];
  /** 1-based, in plan order (for the staging name). */
  readonly n: number;
  /** The WorkOS name, or `""`. */
  readonly name: string;
  readonly role: "user" | "admin";
}

export interface ResolvedUsers {
  /** Every Convex `users` `_id` → what became of it. */
  readonly byConvexId: ReadonlyMap<string, UserResolution>;
  readonly counts: {
    readonly guests: number;
    readonly mergedDuplicates: number;
    readonly mergedWorkosDuplicates: number;
    readonly noEmail: number;
    readonly privateRelay: number;
    readonly workosEmailDiffers: number;
    readonly workosEmailFilled: number;
    readonly workosMissing: number;
    readonly workosNames: number;
  };
  /** The duplicate groups: the kept `_id` and the merged ones. */
  readonly duplicateGroups: readonly (readonly string[])[];
  /** Rows sharing one `workosId` (review M-3): the kept `_id` and the merged ones. */
  readonly duplicateWorkosGroups: readonly (readonly string[])[];
  readonly noEmailIds: readonly string[];
  readonly privateRelayIds: readonly string[];
  /** The migrated users, in plan order (`_creationTime`, `_id` of the kept row). */
  readonly users: readonly MigratedUser[];
}

/** One WorkOS identity: its Convex rows (oldest first; usually one) and its address. */
interface Candidate {
  readonly email: string;
  readonly name: string;
  /** The oldest row. */
  readonly row: UserRow;
  readonly rows: readonly UserRow[];
}

function workosName(workos: WorkosUser | undefined): string {
  const name = [workos?.firstName, workos?.lastName]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .trim();
  return truncateText(name, USER_NAME_MAX);
}

type UserCounts = { -readonly [K in keyof ResolvedUsers["counts"]]: number };

/**
 * The address and WorkOS name of a real user (the WorkOS email wins), or
 * null when it has none; counts the WorkOS differences.
 */
function contactOf(
  rows: readonly UserRow[],
  workosId: string,
  workosUsers: ReadonlyMap<string, WorkosUser> | null,
  counts: UserCounts
): { email: string; name: string } | null {
  const workos = workosUsers?.get(workosId);
  if (workosUsers && !workos) {
    counts.workosMissing += 1;
  }
  // The oldest row's address that is set (Convex stored it at creation).
  const convexEmail =
    rows
      .map((row) => normalizeEmail(row.email))
      .find((address) => address !== null) ?? null;
  const workosEmail = normalizeEmail(workos?.email);
  if (workosEmail && convexEmail && workosEmail !== convexEmail) {
    counts.workosEmailDiffers += 1;
  }
  if (workosEmail && !convexEmail) {
    counts.workosEmailFilled += 1;
  }
  const email = workosEmail ?? convexEmail;
  if (!email) {
    return null;
  }
  const name = workosName(workos);
  if (name.length > 0) {
    counts.workosNames += 1;
  }
  return { email, name };
}

/** The export's order of two groups' oldest rows: `_creationTime`, then `_id`. */
function exportOrder(a: readonly Candidate[], b: readonly Candidate[]): number {
  const left = a[0]?.row;
  const right = b[0]?.row;
  if (!(left && right)) {
    return 0;
  }
  if (left._creationTime !== right._creationTime) {
    return left._creationTime - right._creationTime;
  }
  return left._id < right._id ? -1 : 1;
}

/**
 * Each address's accounts, oldest first, in plan order (the oldest
 * account's export order); maps every account to the oldest one.
 */
function mergeByEmail(
  byEmail: ReadonlyMap<string, Candidate[]>,
  byConvexId: Map<string, UserResolution>,
  counts: UserCounts
): { duplicateGroups: string[][]; groups: Candidate[][] } {
  const groups: Candidate[][] = [];
  const duplicateGroups: string[][] = [];
  for (const group of byEmail.values()) {
    group.sort((a, b) => oldestFirst(a.row, b.row));
    const legacyId = group[0]?.row._id ?? "";
    for (const row of group.flatMap((member) => member.rows)) {
      byConvexId.set(row._id, { kind: "migrated", legacyId });
    }
    if (group.length > 1) {
      counts.mergedDuplicates += group.length - 1;
      duplicateGroups.push(group.map((member) => member.row._id));
    }
    groups.push(group);
  }
  groups.sort(exportOrder);
  duplicateGroups.sort((a, b) => ((a[0] ?? "") < (b[0] ?? "") ? -1 : 1));
  return { duplicateGroups, groups };
}

/** One migrated user from its accounts (oldest first). */
async function migratedUser(
  group: readonly Candidate[],
  n: number
): Promise<MigratedUser> {
  const [oldest] = group;
  if (!oldest) {
    throw new Error("[migrate-convex] An email group cannot be empty");
  }
  const legacyId = oldest.row._id;
  const rows = group.flatMap((member) => member.rows);
  return {
    createdAt: oldest.row.createdAt,
    email: oldest.email,
    id: await legacyUuid("user", legacyId),
    lastActiveAt: Math.max(...rows.map((row) => row.lastActiveAt)),
    legacyId,
    mergedFrom: rows.map((row) => row._id).filter((id) => id !== legacyId),
    n,
    name: group.find((member) => member.name.length > 0)?.name ?? "",
    role: rows.some((row) => row.role === "admin") ? "admin" : "user",
  };
}

/**
 * The real users' rows by `workosId`, oldest first (review M-3: the old
 * `migrateGuestToUser` could give a second row an id another row had);
 * guests go to `byConvexId` at once.
 */
function groupByWorkosId(
  users: readonly UserRow[],
  byConvexId: Map<string, UserResolution>,
  counts: UserCounts
): Map<string, UserRow[]> {
  const byWorkos = new Map<string, UserRow[]>();
  for (const row of users) {
    if (!row.workosId) {
      counts.guests += 1;
      byConvexId.set(row._id, { kind: "guest" });
      continue;
    }
    const rows = byWorkos.get(row.workosId) ?? [];
    rows.push(row);
    byWorkos.set(row.workosId, rows);
  }
  for (const rows of byWorkos.values()) {
    rows.sort(oldestFirst);
  }
  return byWorkos;
}

/**
 * Resolves every Convex user (guests, emails, duplicates). Pure and
 * deterministic: each transform that needs the user map calls it.
 */
export async function resolveUsers(
  context: Pick<TransformContext, "data" | "inputs">
): Promise<ResolvedUsers> {
  const workosUsers = context.inputs.workosUsers
    ? new Map(context.inputs.workosUsers.map((entry) => [entry.id, entry]))
    : null;
  const byConvexId = new Map<string, UserResolution>();
  const counts: UserCounts = {
    guests: 0,
    mergedDuplicates: 0,
    mergedWorkosDuplicates: 0,
    noEmail: 0,
    privateRelay: 0,
    workosEmailDiffers: 0,
    workosEmailFilled: 0,
    workosMissing: 0,
    workosNames: 0,
  };
  const noEmailIds: string[] = [];
  const byWorkos = groupByWorkosId(context.data.users, byConvexId, counts);
  const duplicateWorkosGroups: string[][] = [];
  const byEmail = new Map<string, Candidate[]>();
  for (const [workosId, rows] of byWorkos) {
    if (rows.length > 1) {
      counts.mergedWorkosDuplicates += rows.length - 1;
      duplicateWorkosGroups.push(rows.map((row) => row._id));
    }
    const contact = contactOf(rows, workosId, workosUsers, counts);
    const [oldest] = rows;
    if (!(contact && oldest)) {
      counts.noEmail += rows.length;
      for (const row of rows) {
        noEmailIds.push(row._id);
        byConvexId.set(row._id, { kind: "noEmail" });
      }
      continue;
    }
    const group = byEmail.get(contact.email) ?? [];
    group.push({ ...contact, row: oldest, rows });
    byEmail.set(contact.email, group);
  }
  duplicateWorkosGroups.sort((a, b) => ((a[0] ?? "") < (b[0] ?? "") ? -1 : 1));
  const { duplicateGroups, groups } = mergeByEmail(byEmail, byConvexId, counts);
  const users = await Promise.all(
    groups.map((group, index) => migratedUser(group, index + 1))
  );
  const privateRelayIds = users
    .filter((entry) => entry.email.endsWith(PRIVATE_RELAY_DOMAIN))
    .map((entry) => entry.legacyId);
  counts.privateRelay = privateRelayIds.length;
  return {
    byConvexId,
    counts,
    duplicateGroups,
    duplicateWorkosGroups,
    noEmailIds,
    privateRelayIds,
    users,
  };
}

/** The `_id` of the account a Convex user id maps to, or null (a guest, no email, unknown). */
export function migratedLegacyId(
  users: ResolvedUsers,
  convexId: string | undefined
): string | null {
  if (convexId === undefined) {
    return null;
  }
  const resolution = users.byConvexId.get(convexId);
  return resolution?.kind === "migrated" ? resolution.legacyId : null;
}

/** An address the users file claims, for the preflight (task 10). */
interface UserClaim {
  /** The address as the statements name it (pseudonymised on staging). */
  readonly email: string;
  readonly legacyId: string;
  /** The role the import would insert; a claimed account keeps its own. */
  readonly role: "user" | "admin";
}

export interface UsersTransformResult extends TransformResult {
  /** Every address the claim statements name, for the preflight's claim list and role report. */
  readonly claims: readonly UserClaim[];
  readonly rows: { readonly user: readonly (typeof user.$inferInsert)[] };
}

function ids(list: readonly string[]): readonly string[] {
  return list.slice(0, ISSUE_IDS_MAX);
}

/** Counts of what the users in `dropped` owned (favorites, lists, list items, consents). */
function ownedCounts(
  context: Pick<TransformContext, "data">,
  dropped: ReadonlySet<string>
): {
  consents: number;
  favorites: number;
  listItems: number;
  lists: number;
} {
  const owned = context.data.gesture_lists.filter((row) =>
    dropped.has(row.ownerId)
  );
  const lists = new Set(
    owned.filter((row) => !row.isDefaultFavorites).map((row) => row._id)
  );
  const defaults = new Set(
    owned.filter((row) => row.isDefaultFavorites).map((row) => row._id)
  );
  const items = context.data.gesture_list_items;
  return {
    consents: context.data.user_consents.filter((row) =>
      dropped.has(row.userId)
    ).length,
    // The default list's items are favorites in the new model.
    favorites:
      context.data.user_favorites.filter((row) => dropped.has(row.userId))
        .length + items.filter((row) => defaults.has(row.listId)).length,
    listItems: items.filter((row) => lists.has(row.listId)).length,
    lists: lists.size,
  };
}

function idsOf(
  resolved: ResolvedUsers,
  kind: UserResolution["kind"]
): Set<string> {
  return new Set(
    [...resolved.byConvexId]
      .filter(([, resolution]) => resolution.kind === kind)
      .map(([id]) => id)
  );
}

function usersIssues(
  context: Pick<TransformContext, "data">,
  resolved: ResolvedUsers
): ReportIssue[] {
  const issues: ReportIssue[] = [];
  if (!resolved.users.some((entry) => entry.role === "admin")) {
    issues.push({
      code: "noAdmin",
      message:
        "No migrated user is an admin: the import would leave the site without one. Give an old account the admin role (or fix its email) and plan again.",
      severity: "blocker",
    });
  }
  if (resolved.noEmailIds.length > 0) {
    const lost = ownedCounts(context, idsOf(resolved, "noEmail"));
    issues.push({
      code: "noEmail",
      count: resolved.noEmailIds.length,
      ids: ids(resolved.noEmailIds),
      message: `${resolved.noEmailIds.length} user(s) have no email (in Convex or the WorkOS export) and are dropped, losing ${lost.favorites} favorite(s) (their default list's items included), ${lost.lists} other list(s) with ${lost.listItems} item(s) and ${lost.consents} consent row(s). Their admin log entries and the list items they added elsewhere keep a NULL actor (the account section's auditLogsUnmappedActor, the learning section's listItemAddedByCleared). A WorkOS user export (--workos-users) may recover them.`,
      severity: "warning",
    });
  }
  if (resolved.duplicateGroups.length > 0) {
    issues.push({
      code: "duplicateEmail",
      count: resolved.counts.mergedDuplicates,
      details: resolved.duplicateGroups.map((group) => ({
        kept: group[0] ?? null,
        merged: group.slice(1).join(", "),
      })),
      ids: ids(resolved.duplicateGroups.flat()),
      message: `${resolved.duplicateGroups.length} email(s) belong to several accounts: each is merged into its oldest account (favorites united, lists moved, admin if any was).`,
      severity: "warning",
    });
  }
  if (resolved.duplicateWorkosGroups.length > 0) {
    issues.push({
      code: "duplicateWorkosId",
      count: resolved.counts.mergedWorkosDuplicates,
      details: resolved.duplicateWorkosGroups.map((group) => ({
        kept: group[0] ?? null,
        merged: group.slice(1).join(", "),
      })),
      ids: ids(resolved.duplicateWorkosGroups.flat()),
      message: `${resolved.duplicateWorkosGroups.length} WorkOS identity(ies) have several Convex rows (an upgraded guest beside an existing row): each is merged into its oldest row, with the first address any of them has.`,
      severity: "warning",
    });
  }
  if (resolved.privateRelayIds.length > 0) {
    issues.push({
      code: "privateRelay",
      count: resolved.privateRelayIds.length,
      ids: ids(resolved.privateRelayIds),
      message: `${resolved.privateRelayIds.length} user(s) have an Apple private-relay address: mail reaches them only after the sending domain is registered with Apple (owner item).`,
      severity: "info",
    });
  }
  if (resolved.counts.workosMissing > 0) {
    issues.push({
      code: "workosUserMissing",
      count: resolved.counts.workosMissing,
      message: `${resolved.counts.workosMissing} user(s) are not in the WorkOS export: their Convex email is used.`,
      severity: "warning",
    });
  }
  return issues;
}

/** The `10-users` transform (see the module comment). */
export async function usersTransform(
  context: TransformContext
): Promise<UsersTransformResult> {
  const pseudo = pseudonymiser(context.target);
  const resolved = await resolveUsers(context);
  const rows: (typeof user.$inferInsert)[] = [];
  const statements: string[] = [];
  const claims: UserClaim[] = [];
  const resetUsers: ResetUser[] = [];
  for (const entry of resolved.users) {
    const email = pseudo.email(entry.id, entry.email);
    const row: typeof user.$inferInsert = {
      banned: false,
      createdAt: new Date(entry.createdAt),
      email,
      emailVerified: true,
      id: entry.id,
      image: null,
      legacyId: entry.legacyId,
      locale: null,
      name: pseudo.name("user", entry.n, entry.name),
      role: entry.role,
      updatedAt: new Date(entry.lastActiveAt),
      welcomedAt: context.now,
    };
    rows.push(row);
    claims.push({ email, legacyId: entry.legacyId, role: entry.role });
    resetUsers.push({ id: entry.id, legacyId: entry.legacyId });
    statements.push(
      renderSql(
        sql`UPDATE ${user} SET ${sql.identifier(user.legacyId.name)} = ${entry.legacyId} WHERE ${sql.identifier(user.email.name)} = ${email} AND ${sql.identifier(user.legacyId.name)} IS NULL`
      ),
      insertRow(user, row, [[user.legacyId], [user.email]])
    );
  }
  const admins = resolved.users.filter(
    (entry) => entry.role === "admin"
  ).length;
  const guestOwned = ownedCounts(context, idsOf(resolved, "guest"));
  return {
    claims,
    group: "10-users",
    resetKeys: { users: resetUsers },
    rows: { user: rows },
    sections: [
      section(
        "users",
        {
          admins,
          exportRows: context.data.users.length,
          guestConsentsSkipped: guestOwned.consents,
          guestFavoritesSkipped: guestOwned.favorites,
          guestListItemsSkipped: guestOwned.listItems,
          guestListsSkipped: guestOwned.lists,
          guestsSkipped: resolved.counts.guests,
          mergedDuplicates: resolved.counts.mergedDuplicates,
          mergedWorkosDuplicates: resolved.counts.mergedWorkosDuplicates,
          migrated: resolved.users.length,
          noEmailDropped: resolved.counts.noEmail,
          privateRelay: resolved.counts.privateRelay,
          workosEmailDiffers: resolved.counts.workosEmailDiffers,
          workosEmailFilled: resolved.counts.workosEmailFilled,
          workosMissing: resolved.counts.workosMissing,
          workosNames: resolved.counts.workosNames,
        },
        usersIssues(context, resolved)
      ),
    ],
    statements,
  };
}
