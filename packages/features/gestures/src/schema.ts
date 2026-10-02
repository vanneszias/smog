/**
 * `@smog/gestures/schema`: the Zod schemas and types shared by the contract,
 * the server, the hooks and the UI. Client-safe (no server imports).
 */
import { z } from "zod";

/** A URL slug or a legacy (Convex) id: what `/gestures/<slug>` carries. */
export const slugSchema = z.string().trim().min(1).max(120);

/** A category on a gesture card: enough to link and label it. */
export const categoryRefSchema = z.object({
  name: z.string(),
  slug: z.string(),
});

/** A gesture in a list, a search result or a related row. */
export const gestureSummarySchema = z.object({
  /** Published categories only, in category order (`sort_order`, name). */
  categories: z.array(categoryRefSchema),
  id: z.string(),
  name: z.string(),
  /** The sponsored video's playback id while a sponsorship is live or expiring. */
  playbackId: z.string(),
  slug: z.string(),
});

/** The sponsor credited on a gesture while its sponsorship runs. */
export const sponsorCreditSchema = z.object({
  /** The display name shown in the video. */
  name: z.string(),
  /** When the sponsorship ends (epoch milliseconds). */
  until: z.number().int(),
});

/**
 * The gesture page. Related gestures are a separate call (`related`), so the
 * detail can be cached and prefetched on its own.
 */
export const gestureDetailSchema = gestureSummarySchema.extend({
  description: z.string(),
  /** "Related concepts": synonyms, in the editor's order. */
  keywords: z.array(z.string()),
  related: z.never().optional(),
  sponsor: sponsorCreditSchema.nullable(),
});

/** `bySlug`: the detail plus the slug to redirect to (a legacy id or old slug). */
export const gestureBySlugSchema = gestureDetailSchema.extend({
  canonicalSlug: z.string(),
  /** First published (epoch ms): the page's `VideoObject.uploadDate`. */
  publishedAt: z.number().int(),
  /** Last edited (epoch ms): `dateModified`. */
  updatedAt: z.number().int(),
});

export const categorySchema = z.object({
  /** Published gestures in the category. */
  gestureCount: z.number().int().nonnegative(),
  name: z.string(),
  slug: z.string(),
});

/** The field a search result matched in (spec §7.1 weights). */
export const MATCH_FIELDS = [
  "name",
  "keyword",
  "category",
  "description",
] as const;
export const matchFieldSchema = z.enum(MATCH_FIELDS);

/** How it matched: the direct tiers, or the typo tier (`fuzzy`). */
export const MATCH_TYPES = [
  "exact",
  "startsWith",
  "wordBoundary",
  "fuzzy",
] as const;
export const matchTypeSchema = z.enum(MATCH_TYPES);

/**
 * A search result. `matchedField`/`matchType` are null (and `score` 0) for
 * the browse list an empty query returns.
 */
export const searchResultSchema = gestureSummarySchema.extend({
  matchedField: matchFieldSchema.nullable(),
  matchType: matchTypeSchema.nullable(),
  score: z.number(),
});

export const sitemapEntrySchema = z.object({
  slug: z.string(),
  /** `gesture.updated_at` (epoch milliseconds). */
  updatedAt: z.number().int(),
});

export type CategoryRef = z.infer<typeof categoryRefSchema>;
export type GestureSummary = z.infer<typeof gestureSummarySchema>;
export type SponsorCredit = z.infer<typeof sponsorCreditSchema>;
export type GestureDetail = z.infer<typeof gestureDetailSchema>;
export type GestureBySlug = z.infer<typeof gestureBySlugSchema>;
export type Category = z.infer<typeof categorySchema>;
export type MatchField = z.infer<typeof matchFieldSchema>;
export type MatchType = z.infer<typeof matchTypeSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SitemapEntry = z.infer<typeof sitemapEntrySchema>;
