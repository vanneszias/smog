import {
  type AdminSponsorshipListInput,
  SPONSORSHIP_QUERY_MAX,
} from "@smog/admin/schema";
import { SPONSORSHIP_STATUSES, type SponsorshipStatus } from "@smog/db/enums";
import { dayRange, type TranslationKey } from "@smog/i18n";

/**
 * The list's tabs (A-04, A-08): Review first and by default, then every
 * sponsorship, the stages, the payments that need the admin, and the
 * closed ones.
 */
export const SPONSORSHIP_TABS = [
  "review",
  "all",
  "awaiting",
  "rendering",
  "live",
  "refund",
  "closed",
] as const;
export type SponsorshipTab = (typeof SPONSORSHIP_TABS)[number];

/** The statuses of each status tab. */
export const TAB_STATUSES = {
  awaiting: ["awaiting_payment"],
  closed: ["rejected", "cancelled", "expired"],
  live: ["live", "expiring"],
  rendering: ["rendering", "render_failed"],
  review: ["in_review"],
} as const satisfies Record<
  Exclude<SponsorshipTab, "all" | "refund">,
  readonly SponsorshipStatus[]
>;

export const TAB_LABEL_KEYS = {
  all: "admin.sponsorships.tabs.all",
  awaiting: "admin.sponsorships.tabs.awaiting",
  closed: "admin.sponsorships.tabs.closed",
  live: "admin.sponsorships.tabs.live",
  refund: "admin.sponsorships.tabs.refund",
  rendering: "admin.sponsorships.tabs.rendering",
  review: "admin.sponsorships.tabs.review",
} as const satisfies Record<SponsorshipTab, TranslationKey>;

/** The list's filters as they live in the URL (`/admin/sponsorships?…`). */
export interface SponsorshipSearch {
  /** The page's start (a cursor from the previous page). */
  cursor?: string | undefined;
  /** `YYYY-MM-DD`, inclusive, Brussels time (the creation day). */
  from?: string | undefined;
  /** Only the sponsorships of this payment (the audit log's payment link). */
  payment?: string | undefined;
  q?: string | undefined;
  /** One status, on the All tab only. */
  status?: SponsorshipStatus | undefined;
  /** `undefined` is the Review tab. */
  tab?: SponsorshipTab | undefined;
  /** `YYYY-MM-DD`, inclusive, Brussels time. */
  to?: string | undefined;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function pick<T extends string>(
  value: unknown,
  values: readonly T[]
): T | undefined {
  return typeof value === "string" &&
    (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max
    ? value
    : undefined;
}

function day(value: unknown): string | undefined {
  return typeof value === "string" && DATE.test(value) && dayRange(value)
    ? value
    : undefined;
}

/**
 * Every key set (`undefined` when absent or invalid): the root route
 * validates no search, so an omitted key would keep the raw value.
 */
export function validateSponsorshipSearch(
  search: Record<string, unknown>
): SponsorshipSearch {
  return {
    cursor: text(search.cursor, 1024),
    from: day(search.from),
    payment: text(search.payment, 200),
    q: text(search.q, SPONSORSHIP_QUERY_MAX),
    status: pick(search.status, SPONSORSHIP_STATUSES),
    tab: pick(search.tab, SPONSORSHIP_TABS),
    to: day(search.to),
  };
}

/** The days as an inclusive range of epoch ms (a reversed range is swapped). */
export function dayBounds(
  from: string | undefined,
  to: string | undefined
): { from?: number; to?: number } {
  const [first, last] = from && to && from > to ? [to, from] : [from, to];
  const start = first ? dayRange(first)?.start : undefined;
  const end = last ? dayRange(last)?.end : undefined;
  return {
    ...(start === undefined ? {} : { from: start }),
    ...(end === undefined ? {} : { to: end }),
  };
}

/** The filters every tab shares (the search, the payment and the days). */
export function sharedListInput(
  search: SponsorshipSearch
): AdminSponsorshipListInput {
  const q = search.q?.trim();
  return {
    ...(search.cursor ? { cursor: search.cursor } : {}),
    ...dayBounds(search.from, search.to),
    ...(search.payment ? { paymentId: search.payment } : {}),
    ...(q ? { q } : {}),
  };
}

/** The list input for the URL's tab and filters. */
export function sponsorshipListInput(
  search: SponsorshipSearch
): AdminSponsorshipListInput {
  const tab = search.tab ?? "review";
  const shared = sharedListInput(search);
  if (tab === "refund") {
    return { ...shared, refundNeeded: true };
  }
  if (tab === "all") {
    return search.status ? { ...shared, status: [search.status] } : shared;
  }
  return { ...shared, status: [...TAB_STATUSES[tab]] };
}

/** A tab's count from the per-status counts (the refund tab has its own). */
export function tabCount(
  tab: SponsorshipTab,
  counts: Readonly<Record<SponsorshipStatus, number>>,
  refundCount: number
): number {
  if (tab === "refund") {
    return refundCount;
  }
  const statuses: readonly SponsorshipStatus[] =
    tab === "all" ? SPONSORSHIP_STATUSES : TAB_STATUSES[tab];
  return statuses.reduce((sum, status) => sum + counts[status], 0);
}
