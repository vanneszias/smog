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
