/**
 * The account export (`account.export`, version 2): everything stored
 * about the user in one read batch. Sign-in methods are provider names
 * and dates only (never a token, a password hash or a passkey key), share
 * links only the active ones, and sponsorships only those whose sponsor
 * email is the user's verified email (contact and invoice details, status
 * and dates; no payment ids or amounts).
 */
import {
  account,
  consentEvent,
  favorite,
  gesture,
  invoiceRequest,
  list,
  listItem,
  listShare,
  passkey,
  sponsor,
  sponsorship,
  user,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { ACCOUNT_EXPORT_VERSION, type AccountExport } from "../schema";
import { AccountNotFoundError } from "./profile";

/** `@smog/lists/server` `shareUrl`, wired by `@smog/api`. */
export type ShareUrl = (siteUrl: string, token: string) => string;

export interface ExportDeps {
  db: Db;
  shareUrl: ShareUrl;
  /** `SITE_URL`, for the share links. */
  siteUrl: string;
}

const iso = (date: Date): string => date.toISOString();
const isoOrNull = (date: Date | null): string | null =>
  date ? date.toISOString() : null;

const gestureColumns = {
  id: gesture.id,
  name: gesture.name,
  slug: gesture.slug,
};

/** Groups rows by a key, keeping their order. */
function groupBy<T>(
  rows: readonly T[],
  key: (row: T) => string
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row)) ?? [];
    group.push(row);
    groups.set(key(row), group);
  }
  return groups;
}

/**
 * The ids of the checkouts paid with the user's email, once it is
 * verified (compared case-insensitively: sponsors type their address).
 */
function sponsorIdsOf(userId: string) {
  return sql`SELECT ${sponsor.id} FROM ${sponsor} JOIN ${user} ON lower(${sponsor.email}) = lower(${user.email}) WHERE ${user.id} = ${userId} AND ${user.emailVerified} = 1`;
}

export async function exportAccount(
  deps: ExportDeps,
  userId: string,
  now: Date = new Date()
): Promise<AccountExport> {
  const { db } = deps;
  const sponsorIds = sponsorIdsOf(userId);
  try {
    const [
      users,
      accounts,
      passkeys,
      favorites,
      lists,
      items,
      shares,
      consents,
      sponsors,
      invoices,
      sponsored,
    ] = await db.batch([
      db
        .select({
          createdAt: user.createdAt,
          email: user.email,
          emailVerified: user.emailVerified,
          id: user.id,
          image: user.image,
          locale: user.locale,
          name: user.name,
          role: user.role,
        })
        .from(user)
        .where(eq(user.id, userId)),
      db
        .select({ linkedAt: account.createdAt, provider: account.providerId })
        .from(account)
        .where(eq(account.userId, userId))
        .orderBy(asc(account.createdAt), asc(account.providerId)),
      db
        .select({ createdAt: passkey.createdAt, name: passkey.name })
        .from(passkey)
        .where(eq(passkey.userId, userId))
        .orderBy(asc(passkey.createdAt), asc(passkey.id)),
      db
        .select({ addedAt: favorite.createdAt, gesture: gestureColumns })
        .from(favorite)
        .innerJoin(gesture, eq(gesture.id, favorite.gestureId))
        .where(eq(favorite.userId, userId))
        .orderBy(desc(favorite.createdAt), desc(favorite.gestureId)),
      db
        .select({
          createdAt: list.createdAt,
          description: list.description,
          id: list.id,
          name: list.name,
          updatedAt: list.updatedAt,
        })
        .from(list)
        .where(eq(list.ownerId, userId))
        .orderBy(asc(list.createdAt), asc(list.id)),
      db
        .select({
          addedAt: listItem.createdAt,
          gesture: gestureColumns,
          listId: listItem.listId,
          position: listItem.position,
        })
        .from(listItem)
        .innerJoin(list, eq(list.id, listItem.listId))
        .innerJoin(gesture, eq(gesture.id, listItem.gestureId))
        .where(eq(list.ownerId, userId))
        .orderBy(asc(listItem.listId), asc(listItem.position)),
      db
        .select({
          createdAt: listShare.createdAt,
          listId: listShare.listId,
          role: listShare.role,
          token: listShare.token,
        })
        .from(listShare)
        .innerJoin(list, eq(list.id, listShare.listId))
        .where(and(eq(list.ownerId, userId), isNull(listShare.revokedAt)))
        .orderBy(asc(listShare.createdAt), asc(listShare.role)),
      db
        .select({
          createdAt: consentEvent.createdAt,
          granted: consentEvent.granted,
          policyVersion: consentEvent.policyVersion,
          purpose: consentEvent.purpose,
          source: consentEvent.source,
        })
        .from(consentEvent)
        .where(eq(consentEvent.userId, userId))
        .orderBy(asc(consentEvent.createdAt), asc(sql`${consentEvent}.rowid`)),
      db
        .select({
          company: sponsor.company,
          createdAt: sponsor.createdAt,
          email: sponsor.email,
          id: sponsor.id,
          locale: sponsor.locale,
          name: sponsor.name,
        })
        .from(sponsor)
        .where(sql`${sponsor.id} IN (${sponsorIds})`)
        .orderBy(asc(sponsor.createdAt), asc(sql`${sponsor}.rowid`)),
      // Its own query: D1 batch rows are keyed by column name, so a join
      // with the sponsor's `name` and `email` would mix them up.
      db
        .select({
          email: invoiceRequest.email,
          name: invoiceRequest.name,
          sponsorId: invoiceRequest.sponsorId,
          vatNumber: invoiceRequest.vatNumber,
        })
        .from(invoiceRequest)
        .where(sql`${invoiceRequest.sponsorId} IN (${sponsorIds})`),
      db
        .select({
          createdAt: sponsorship.createdAt,
          displayName: sponsorship.displayName,
          endsAt: sponsorship.endsAt,
          gesture: gestureColumns,
          logoKey: sponsorship.logoKey,
          sponsorId: sponsorship.sponsorId,
          startsAt: sponsorship.startsAt,
          status: sponsorship.status,
          updatedAt: sponsorship.updatedAt,
        })
        .from(sponsorship)
        .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
        .where(sql`${sponsorship.sponsorId} IN (${sponsorIds})`)
        .orderBy(asc(sponsorship.createdAt), asc(sponsorship.id)),
    ]);
    const [profile] = users;
    if (!profile) {
      throw new AccountNotFoundError();
    }

    const itemsByList = groupBy(items, (row) => row.listId);
    const sharesByList = groupBy(shares, (row) => row.listId);
    const sponsoredBy = groupBy(sponsored, (row) => row.sponsorId);
    const invoiceOf = new Map(
      invoices.map(({ sponsorId, ...invoice }) => [sponsorId, invoice])
    );

    return {
      consent: consents.map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
      })),
      exportedAt: iso(now),
      exportVersion: ACCOUNT_EXPORT_VERSION,
      favorites: favorites.map((row) => ({
        addedAt: iso(row.addedAt),
        gesture: row.gesture,
      })),
      lists: lists.map((row) => ({
        createdAt: iso(row.createdAt),
        description: row.description,
        id: row.id,
        items: (itemsByList.get(row.id) ?? []).map((item) => ({
          addedAt: iso(item.addedAt),
          gesture: item.gesture,
          position: item.position,
        })),
        name: row.name,
        shareLinks: (sharesByList.get(row.id) ?? []).map((share) => ({
          createdAt: iso(share.createdAt),
          role: share.role,
          url: deps.shareUrl(deps.siteUrl, share.token),
        })),
        updatedAt: iso(row.updatedAt),
      })),
      profile: { ...profile, createdAt: iso(profile.createdAt) },
      signInMethods: {
        passkeys: passkeys.map((row) => ({
          createdAt: isoOrNull(row.createdAt),
          name: row.name,
        })),
        providers: accounts.map((row) => ({
          linkedAt: iso(row.linkedAt),
          provider: row.provider,
        })),
      },
      sponsorships: sponsors.map((row) => ({
        contact: {
          company: row.company,
          email: row.email,
          locale: row.locale,
          name: row.name,
        },
        createdAt: iso(row.createdAt),
        invoice: invoiceOf.get(row.id) ?? null,
        items: (sponsoredBy.get(row.id) ?? []).map((item) => ({
          createdAt: iso(item.createdAt),
          displayName: item.displayName,
          endsAt: isoOrNull(item.endsAt),
          gesture: item.gesture,
          hasLogo: item.logoKey !== null,
          startsAt: isoOrNull(item.startsAt),
          status: item.status,
          updatedAt: iso(item.updatedAt),
        })),
      })),
    };
  } catch (error) {
    if (!(error instanceof AccountNotFoundError)) {
      console.error("[account] Failed to export the account:", error);
    }
    throw error;
  }
}
