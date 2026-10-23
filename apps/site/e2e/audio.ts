import type { APIRequestContext } from "@playwright/test";
import { adminRpc } from "./admin";
import { ORIGIN } from "./helpers";

/*
 * Shared helpers of the media specs (phase 10b task 6): a gesture of the
 * spec's own (`Zz…`, created and deleted through the admin API, so no seeded
 * row changes) and a spoken-name clip uploaded the way the editor does it
 * (the dev same-origin PUT, then finalize). No `expect` here, so a helper
 * never registers anything with a spec.
 */

export const SAMPLE_PLAYBACK_ID =
  "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";

export function letters(length: number): string {
  return Array.from(
    { length },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("");
}

export interface MadeGesture {
  id: string;
  name: string;
  slug: string;
}

/** A gesture in the first published category; `textless` says its video has no text in the picture. */
export async function createGesture(
  request: APIRequestContext,
  options: { name: string; published: boolean; textless: boolean }
): Promise<MadeGesture> {
  const categories = await adminRpc<
    { id: string; publishedAt: number | null }[]
  >(request, "admin/categories/list");
  const category = categories.find((item) => item.publishedAt !== null);
  if (!category) {
    throw new Error("[e2e] the dev seed has no published category");
  }
  const gesture = await adminRpc<{ id: string; slug: string }>(
    request,
    "admin/gestures/create",
    {
      categoryIds: [category.id],
      name: options.name,
      playbackId: SAMPLE_PLAYBACK_ID,
      published: options.published,
      textless: options.textless,
    }
  );
  return { id: gesture.id, name: options.name, slug: gesture.slug };
}

/** Unpublishes and deletes a gesture of the spec's own (its clips go with it). */
export async function deleteGesture(
  request: APIRequestContext,
  gesture: MadeGesture
): Promise<void> {
  await adminRpc(request, "admin/gestures/setPublished", {
    id: gesture.id,
    published: false,
  }).catch(() => undefined);
  await adminRpc(request, "admin/gestures/delete", {
    confirmName: gesture.name,
    id: gesture.id,
  });
}

export interface StoredClip {
  durationMs: number;
  path: string;
}

/** Uploads a clip through the same-origin PUT and finalizes it, as the editor does. */
export async function uploadClip(
  request: APIRequestContext,
  options: {
    bytes: Uint8Array;
    contentType: "audio/mp4" | "audio/mpeg";
    gestureId: string;
    locale: string;
  }
): Promise<StoredClip> {
  const ticket = await adminRpc<{
    headers: Record<string, string>;
    key: string;
    uploadUrl: string;
  }>(request, "translation/uploadAudio", {
    contentType: options.contentType,
    gestureId: options.gestureId,
    locale: options.locale,
    size: options.bytes.length,
  });
  const put = await request.put(ticket.uploadUrl, {
    data: Buffer.from(options.bytes),
    headers: { ...ticket.headers, origin: ORIGIN },
  });
  if (!put.ok()) {
    throw new Error(`[e2e] The audio PUT answered ${put.status()}`);
  }
  return await adminRpc<StoredClip>(request, "translation/finalizeAudio", {
    gestureId: options.gestureId,
    key: ticket.key,
    locale: options.locale,
  });
}
