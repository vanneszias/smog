import type {
  AdminGestureDetail,
  CreateGestureInput,
  GesturePatchInput,
} from "@smog/admin/schema";
import { GESTURE_DESCRIPTION_MAX, GESTURE_NAME_MAX } from "@smog/admin/schema";
import type { VideoFieldValue } from "@/components/admin/video/video-field";

/** The gesture editor's form state. */
export interface GestureDraft {
  categoryIds: string[];
  description: string;
  keywords: string[];
  name: string;
  published: boolean;
  video: VideoFieldValue | null;
}

/** A new gesture is published by default (A-16). */
export const EMPTY_DRAFT: GestureDraft = {
  categoryIds: [],
  description: "",
  keywords: [],
  name: "",
  published: true,
  video: null,
};

export function draftOf(gesture: AdminGestureDetail): GestureDraft {
  return {
    categoryIds: gesture.categories.map((category) => category.id),
    description: gesture.description,
    keywords: gesture.keywords,
    name: gesture.name,
    published: gesture.publishedAt !== null,
    video: {
      muxAssetId: gesture.muxAssetId ?? undefined,
      playbackId: gesture.playbackId,
    },
  };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  return left.size === new Set(b).size && b.every((value) => left.has(value));
}

/** The fields `update` must change (empty: nothing to save but maybe publish). */
export function patchOf(
  saved: GestureDraft,
  draft: GestureDraft
): GesturePatchInput {
  const patch: GesturePatchInput = {};
  if (draft.name.trim() !== saved.name.trim()) {
    patch.name = draft.name.trim();
  }
  if (draft.description.trim() !== saved.description.trim()) {
    patch.description = draft.description.trim();
  }
  if (!sameList(draft.keywords, saved.keywords)) {
    patch.keywords = draft.keywords;
  }
  if (!sameSet(draft.categoryIds, saved.categoryIds)) {
    patch.categoryIds = draft.categoryIds;
  }
  const { video } = draft;
  if (
    video &&
    (video.playbackId !== saved.video?.playbackId ||
      (video.muxAssetId ?? null) !== (saved.video?.muxAssetId ?? null))
  ) {
    patch.playbackId = video.playbackId;
    patch.muxAssetId = video.muxAssetId ?? null;
  }
  return patch;
}

/** The form fields a merge compares, in form order. */
export const DRAFT_FIELDS = [
  "video",
  "name",
  "description",
  "keywords",
  "categoryIds",
  "published",
] as const satisfies readonly (keyof GestureDraft)[];
export type DraftField = (typeof DRAFT_FIELDS)[number];

/** Whether two drafts agree on `field` (as `patchOf` would compare it). */
export function sameField(
  field: DraftField,
  a: GestureDraft,
  b: GestureDraft
): boolean {
  switch (field) {
    case "name":
    case "description":
      return a[field].trim() === b[field].trim();
    case "keywords":
      return sameList(a.keywords, b.keywords);
    case "categoryIds":
      return sameSet(a.categoryIds, b.categoryIds);
    case "published":
      return a.published === b.published;
    default:
      return (
        a.video?.playbackId === b.video?.playbackId &&
        (a.video?.muxAssetId ?? null) === (b.video?.muxAssetId ?? null)
      );
  }
}

function pick(
  target: GestureDraft,
  source: GestureDraft,
  field: DraftField
): GestureDraft {
  return { ...target, [field]: source[field] };
}

export interface DraftMerge {
  /** Fields both sides changed to different values (`merged` has theirs). */
  conflicts: DraftField[];
  /** Theirs where only they changed a field, mine where only I did. */
  merged: GestureDraft;
}

/**
 * The three-way merge of a stale save (C1): `base` is the version the
 * form was based on, `mine` the form, `theirs` the newer version. Nothing
 * of theirs is dropped silently: a field both changed differently is a
 * conflict, and `merged` keeps their value until the admin chooses.
 */
export function mergeDrafts(
  base: GestureDraft,
  mine: GestureDraft,
  theirs: GestureDraft
): DraftMerge {
  let merged = theirs;
  const conflicts: DraftField[] = [];
  for (const field of DRAFT_FIELDS) {
    const mineChanged = !sameField(field, base, mine);
    if (!mineChanged) {
      continue;
    }
    const theirsChanged = !sameField(field, base, theirs);
    if (theirsChanged && !sameField(field, mine, theirs)) {
      conflicts.push(field);
    } else {
      merged = pick(merged, mine, field);
    }
  }
  return { conflicts, merged };
}

/** `merged` with my values for `fields` ("Overwrite with mine"). */
export function withMine(
  merged: GestureDraft,
  mine: GestureDraft,
  fields: readonly DraftField[]
): GestureDraft {
  return fields.reduce((draft, field) => pick(draft, mine, field), merged);
}

export type DraftProblem = "categories" | "description" | "name" | "video";

/** What the contract would refuse, shown once the admin tries to save. */
export function draftProblems(draft: GestureDraft): Set<DraftProblem> {
  const problems = new Set<DraftProblem>();
  const name = draft.name.trim();
  if (name.length === 0 || name.length > GESTURE_NAME_MAX) {
    problems.add("name");
  }
  if (draft.description.trim().length > GESTURE_DESCRIPTION_MAX) {
    problems.add("description");
  }
  if (!draft.video) {
    problems.add("video");
  }
  if (draft.categoryIds.length === 0) {
    problems.add("categories");
  }
  return problems;
}

/** The `create` input of a valid draft (the video is set). */
export function createInputOf(
  draft: GestureDraft & { video: VideoFieldValue }
): CreateGestureInput {
  return {
    categoryIds: draft.categoryIds,
    description: draft.description.trim(),
    keywords: draft.keywords,
    ...(draft.video.muxAssetId ? { muxAssetId: draft.video.muxAssetId } : {}),
    name: draft.name.trim(),
    playbackId: draft.video.playbackId,
    published: draft.published,
  };
}
