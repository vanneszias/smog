/**
 * The catalogue transform (phase 8 ruling 9; carry 16 (d)): Convex
 * `categories` and `gestures` → `category`, `gesture`, `gesture_keyword`
 * and `gesture_category`, in `20-catalog`.
 *
 * - **Categories:** `slug = slugify(name)` (`category` when that is
 *   empty), deduplicated `-2`, `-3` … in `_creationTime, _id` order, so a
 *   newer export that adds rows never moves an older row's slug;
 *   `sort_order` = the rank by `normalizeText(name)` (ties in export
 *   order); `published_at = isActive ? _creationTime : NULL`.
 * - **Gestures:** slugs by the same rule (`gesture` when empty);
 *   `sort_name = gestureSortName(name)`; `description = info` trimmed;
 *   `published_at = isActive ? lastUpdated : NULL`; `created_at =
 *   _creationTime`; `updated_at = lastUpdated`.
 * - **The video (B1):** `playback_id` is `resolveGesturePlayback` over the
 *   export's sponsorship rows, so a sponsored gesture gets its own video
 *   back; every warning it gives is reported. `mux_asset_id` is the Mux
 *   map's asset of the **resolved** playback id; without one it is NULL
 *   with a warning. Staging drops it (`pseudonymiser(target).assetId`).
 * - **Keywords** from `concept`: trimmed, empties and exact duplicates
 *   dropped, positions `0..n-1` in order.
 * - **Categories of a gesture** from `categoryIds`: unknown ids are
 *   dropped and counted (a repeated id once).
 *
 * Every row's id is `legacyUuid(<table>, _id)`; every migrated gesture
 * goes to the `gesture_fts` rebuild (`90-fts`).
 */
import {
  category,
  gesture,
  gestureCategory,
  gestureKeyword,
  gestureSortName,
} from "@smog/db";
import { normalizeText, slugify } from "@smog/utils";
import { insertRow } from "../emit";
import { resolveGesturePlaybacks } from "../gesture-video";
import { legacyUuids } from "../ids";
import type { TransformContext, TransformResult } from "../plan";
import { type ReportIssue, section } from "../report";
import { pseudonymiser } from "../target";
import { ISSUE_IDS_MAX } from "./users";

/**
 * The slug of each name, in the given order: `slugify(name)` (or
 * `fallback`), and `-2`, `-3` … for the names whose slug an earlier one
 * took. The order is the export's (`_creationTime`, `_id`).
 */
export function assignSlugs(
  names: readonly string[],
  fallback: string
): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const base = slugify(name) || fallback;
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) {
      slug = `${base}-${n}`;
    }
    taken.add(slug);
    return slug;
  });
}

/** The rank (0-based) of each name by `normalizeText`, ties in the given order. */
export function sortRanks(names: readonly string[]): number[] {
  const keyed = names.map((name, index) => ({
    index,
    key: normalizeText(name),
  }));
  keyed.sort((a, b) => {
    if (a.key !== b.key) {
      return a.key < b.key ? -1 : 1;
    }
    return a.index - b.index;
  });
  const ranks = new Array<number>(names.length).fill(0);
  for (const [rank, entry] of keyed.entries()) {
    ranks[entry.index] = rank;
  }
  return ranks;
}

/** `concept` as keywords: trimmed, empties and exact duplicates dropped, in order. */
export function keywordsOf(concept: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of concept) {
    const keyword = raw.trim();
    if (keyword.length > 0 && !out.includes(keyword)) {
      out.push(keyword);
    }
  }
  return out;
}

/** The new ids of the export's gestures and categories (`legacyUuid`), by `_id`. */
export interface CatalogIds {
  readonly categories: ReadonlyMap<string, string>;
  readonly gestures: ReadonlyMap<string, string>;
}

/** Every migrated gesture and category id (all of them migrate). */
export async function catalogIds(
  context: Pick<TransformContext, "data">
): Promise<CatalogIds> {
  return {
    categories: await legacyUuids(
      "category",
      context.data.categories.map((row) => row._id)
    ),
    gestures: await legacyUuids(
      "gesture",
      context.data.gestures.map((row) => row._id)
    ),
  };
}

export interface CatalogTransformResult extends TransformResult {
  readonly ftsGestureIds: readonly string[];
  readonly rows: {
    readonly category: readonly (typeof category.$inferInsert)[];
    readonly gesture: readonly (typeof gesture.$inferInsert)[];
    readonly gestureCategory: readonly {
      readonly categoryId: string;
      readonly gestureId: string;
    }[];
    readonly gestureKeyword: readonly (typeof gestureKeyword.$inferInsert)[];
  };
}

function limited(ids: readonly string[]): readonly string[] {
  return ids.slice(0, ISSUE_IDS_MAX);
}

type CategoryValues = typeof category.$inferInsert;
type GestureValues = typeof gesture.$inferInsert;
type KeywordValues = typeof gestureKeyword.$inferInsert;
interface LinkValues {
  readonly categoryId: string;
  readonly gestureId: string;
}

function categoryRowsOf(
  categories: TransformContext["data"]["categories"],
  ids: CatalogIds
): CategoryValues[] {
  const names = categories.map((row) => row.name.trim());
  const slugs = assignSlugs(names, "category");
  const ranks = sortRanks(names);
  return categories.map((row, index) => ({
    createdAt: new Date(row._creationTime),
    id: ids.categories.get(row._id) ?? "",
    legacyId: row._id,
    name: names[index] ?? "",
    publishedAt: row.isActive ? new Date(row._creationTime) : null,
    slug: slugs[index] ?? "",
    sortOrder: ranks[index] ?? 0,
    updatedAt: new Date(row._creationTime),
  }));
}

/** A gesture's category links (known ids, each once) and how many ids were unknown. */
function linksOf(
  categoryIds: readonly string[],
  gestureId: string,
  ids: CatalogIds
): { links: LinkValues[]; unknown: number } {
  const links: LinkValues[] = [];
  let unknown = 0;
  for (const categoryId of categoryIds) {
    const target = ids.categories.get(categoryId);
    if (!target) {
      unknown += 1;
    } else if (!links.some((link) => link.categoryId === target)) {
      links.push({ categoryId: target, gestureId });
    }
  }
  return { links, unknown };
}

interface GestureTally {
  issues: ReportIssue[];
  noAsset: string[];
  restored: number;
  uncategorised: number;
  unknownLinkGestures: string[];
  unknownLinks: number;
  withoutAsset: number;
}

function catalogIssues(
  tally: GestureTally,
  gestures: number,
  hasMuxMap: boolean
): ReportIssue[] {
  const issues = [...tally.issues];
  if (!hasMuxMap && gestures > 0) {
    issues.push({
      code: "noMuxMap",
      count: gestures,
      message: `No Mux map (--mux-map) was given: ${gestures} gesture(s) get no mux_asset_id (run \`mux scan\` and plan again).`,
      severity: "warning",
    });
  }
  if (tally.noAsset.length > 0) {
    issues.push({
      code: "muxAssetMissing",
      count: tally.noAsset.length,
      ids: limited(tally.noAsset),
      message: `${tally.noAsset.length} gesture(s) have a playback id the Mux map does not know: their mux_asset_id stays NULL.`,
      severity: "warning",
    });
  }
  if (tally.unknownLinks > 0) {
    issues.push({
      code: "unknownCategory",
      count: tally.unknownLinks,
      ids: limited(tally.unknownLinkGestures),
      message: `${tally.unknownLinks} category link(s) of ${tally.unknownLinkGestures.length} gesture(s) name a category the export does not have; they are dropped.`,
      severity: "warning",
    });
  }
  return issues;
}

/** The `20-catalog` transform (see the module comment). */
export async function catalogTransform(
  context: TransformContext
): Promise<CatalogTransformResult> {
  const pseudo = pseudonymiser(context.target);
  const { gestures } = context.data;
  const ids = await catalogIds(context);
  const categoryRows = categoryRowsOf(context.data.categories, ids);
  const playbacks = resolveGesturePlaybacks(
    gestures,
    context.data.sponsorships
  );
  const { muxMap } = context.inputs;
  const names = gestures.map((row) => row.name.trim());
  const slugs = assignSlugs(names, "gesture");
  const tally: GestureTally = {
    issues: [],
    noAsset: [],
    restored: 0,
    uncategorised: 0,
    unknownLinkGestures: [],
    unknownLinks: 0,
    withoutAsset: 0,
  };
  const gestureRows: GestureValues[] = [];
  const keywordRows: KeywordValues[] = [];
  const linkRows: LinkValues[] = [];
  for (const [index, row] of gestures.entries()) {
    const id = ids.gestures.get(row._id) ?? "";
    const playback = playbacks.get(row._id);
    const playbackId = playback?.playbackId ?? row.playbackId;
    tally.restored += playback?.restoredFrom.length ? 1 : 0;
    tally.issues.push(
      ...(playback?.warnings ?? []).map(
        (warning): ReportIssue => ({
          code: warning.code,
          ids: [warning.gestureId, warning.sponsorshipId],
          message: warning.message,
          severity: "warning",
        })
      )
    );
    const assetId = muxMap?.get(playbackId)?.assetId ?? null;
    if (!assetId) {
      tally.withoutAsset += 1;
      tally.noAsset.push(...(muxMap ? [row._id] : []));
    }
    const name = names[index] ?? "";
    gestureRows.push({
      createdAt: new Date(row._creationTime),
      description: row.info.trim(),
      id,
      legacyId: row._id,
      muxAssetId: pseudo.assetId(assetId),
      name,
      playbackId,
      publishedAt: row.isActive ? new Date(row.lastUpdated) : null,
      slug: slugs[index] ?? "",
      sortName: gestureSortName(name),
      updatedAt: new Date(row.lastUpdated),
    });
    keywordRows.push(
      ...keywordsOf(row.concept).map((keyword, position) => ({
        gestureId: id,
        keyword,
        position,
      }))
    );
    const { links, unknown } = linksOf(row.categoryIds, id, ids);
    linkRows.push(...links);
    tally.uncategorised += links.length === 0 ? 1 : 0;
    tally.unknownLinks += unknown;
    tally.unknownLinkGestures.push(...(unknown > 0 ? [row._id] : []));
  }

  const statements = [
    ...categoryRows.map((row) =>
      insertRow(category, row, [[category.legacyId]])
    ),
    ...gestureRows.map((row) => insertRow(gesture, row, [[gesture.legacyId]])),
    ...keywordRows.map((row) =>
      insertRow(gestureKeyword, row, [
        [gestureKeyword.gestureId, gestureKeyword.keyword],
      ])
    ),
    ...linkRows.map((row) =>
      insertRow(gestureCategory, row, [
        [gestureCategory.gestureId, gestureCategory.categoryId],
      ])
    ),
  ];
  const gestureIds = gestureRows.map((row) => row.id);
  return {
    ftsGestureIds: gestureIds,
    group: "20-catalog",
    resetKeys: {
      rows: {
        category: categoryRows.map((row) => row.id),
        gesture: gestureIds,
        gesture_category: linkRows.map((row) => [
          row.gestureId,
          row.categoryId,
        ]),
        gesture_keyword: keywordRows.map((row) => [row.gestureId, row.keyword]),
      },
    },
    rows: {
      category: categoryRows,
      gesture: gestureRows,
      gestureCategory: linkRows,
      gestureKeyword: keywordRows,
    },
    sections: [
      section(
        "catalog",
        {
          categories: categoryRows.length,
          categoriesUnpublished: categoryRows.filter(
            (row) => row.publishedAt === null
          ).length,
          gestureCategoryLinks: linkRows.length,
          gestureKeywords: keywordRows.length,
          gestures: gestureRows.length,
          gesturesUncategorised: tally.uncategorised,
          gesturesUnpublished: gestureRows.filter(
            (row) => row.publishedAt === null
          ).length,
          gesturesVideoRestored: tally.restored,
          gesturesWithoutAsset: tally.withoutAsset,
          unknownCategoryLinks: tally.unknownLinks,
        },
        catalogIssues(tally, gestures.length, muxMap !== null)
      ),
    ],
    statements,
  };
}
