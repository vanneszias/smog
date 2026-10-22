/**
 * `translation.uploadAudio`, `finalizeAudio`, `deleteAudio` and `listAudio`
 * (phase 10b task 6, ruling 6): a gesture's spoken name, one MP3 or M4A
 * clip per language in R2 under `audio/<gestureId>/<locale>/<uuid>`.
 *
 * The browser PUTs the file itself (`audioUploadUrl`). `finalizeAudio` then
 * reads the object, checks its bytes (`inspectAudio`: the declared type is
 * never trusted), copies the verified bytes to a fresh key no client has a
 * URL for (a presigned PUT that is still valid cannot change what was
 * checked), records the clip with its audit entry in one batch, and removes
 * the upload and the clip it replaces. A refused upload is deleted.
 */
import { gesture, gestureAudio } from "@smog/db";
import type { Db } from "@smog/db/client";
import { AUDIO_MAX_BYTES } from "@smog/db/enums";
import { markUnchanged } from "@smog/rpc/audit";
import { audioPath } from "@smog/utils";
import { and, eq } from "drizzle-orm";
import {
  AUDIO_KEY_PATTERN,
  type AudioRefusal,
  type AudioRow,
  parseAudioKey,
} from "../schema";
import { audioUploadUrl } from "./audio-upload";
import { type AudioVerdict, inspectAudio } from "./audio-verify";
import { auditStatement } from "./audit";
import { translatorProcedure } from "./procedure";
import { readLanguages } from "./store";

interface GestureRef {
  id: string;
  name: string;
  slug: string;
}

async function readGesture(db: Db, id: string): Promise<GestureRef | null> {
  try {
    const [row] = await db
      .select({ id: gesture.id, name: gesture.name, slug: gesture.slug })
      .from(gesture)
      .where(eq(gesture.id, id))
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.error("[translation] Failed to read a gesture:", error);
    throw error;
  }
}

async function isEnabled(db: Db, code: string): Promise<boolean> {
  return (await readLanguages(db)).some(
    (item) => item.code === code && item.enabled
  );
}

function refusal(reason: AudioRefusal) {
  return {
    data: { fieldErrors: { file: [reason] }, formErrors: [] as string[] },
  };
}

function toRow(row: {
  contentType: AudioRow["contentType"];
  durationMs: number;
  gestureId: string;
  locale: string;
  r2Key: string;
  size: number;
  updatedAt: Date;
}): AudioRow {
  return {
    contentType: row.contentType,
    durationMs: row.durationMs,
    gestureId: row.gestureId,
    locale: row.locale,
    path: audioPath(row.r2Key),
    size: row.size,
    updatedAt: row.updatedAt.getTime(),
  };
}

/** Deletes an object; a failure is logged (it is an orphan, never a wrong clip). */
async function deleteObject(media: R2Bucket, key: string): Promise<void> {
  try {
    await media.delete(key);
  } catch (error) {
    console.error(`[translation] Failed to delete the audio ${key}:`, error);
  }
}

async function readStored(db: Db, gestureId: string, locale: string) {
  try {
    const [row] = await db
      .select()
      .from(gestureAudio)
      .where(
        and(
          eq(gestureAudio.gestureId, gestureId),
          eq(gestureAudio.locale, locale)
        )
      )
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.error("[translation] Failed to read the audio:", error);
    throw error;
  }
}

/** The bytes of an upload when it is within the size cap, else why not. */
async function readUpload(
  media: R2Bucket,
  key: string
): Promise<
  | { bytes: Uint8Array<ArrayBuffer>; declaredType: string | undefined }
  | { reason: AudioRefusal }
> {
  const head = await media.head(key);
  if (!head) {
    return { reason: "missing" };
  }
  if (head.size < 1 || head.size > AUDIO_MAX_BYTES) {
    return { reason: "tooLarge" };
  }
  const object = await media.get(key);
  if (!object) {
    return { reason: "missing" };
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  return bytes.byteLength > AUDIO_MAX_BYTES
    ? { reason: "tooLarge" }
    : { bytes, declaredType: object.httpMetadata?.contentType };
}

type UploadCheck =
  | {
      ok: true;
      upload: { bytes: Uint8Array<ArrayBuffer> };
      verdict: Extract<AudioVerdict, { ok: true }>;
    }
  | { ok: false; reason: AudioRefusal };

/**
 * Reads an upload and checks its bytes against the type it was sent with.
 * An upload that fails any check (size, format, duration) is deleted.
 */
async function checkUpload(media: R2Bucket, key: string): Promise<UploadCheck> {
  const upload = await readUpload(media, key);
  if ("reason" in upload) {
    if (upload.reason !== "missing") {
      console.warn(`[translation] Refused the audio ${key}: ${upload.reason}`);
      await deleteObject(media, key);
    }
    return { ok: false, reason: upload.reason };
  }
  const verdict = inspectAudio(upload.bytes);
  if (verdict.ok && upload.declaredType === verdict.contentType) {
    return { ok: true, upload, verdict };
  }
  const reason = verdict.ok ? "format" : verdict.reason;
  console.warn(`[translation] Refused the audio ${key}: ${reason}`);
  await deleteObject(media, key);
  return { ok: false, reason };
}

/** The audio procedures of the translation router. */
export function audioRoutes() {
  return {
    deleteAudio: translatorProcedure.deleteAudio.handler(
      async ({ context, input }) => {
        const { db } = context;
        const stored = await readStored(db, input.gestureId, input.locale);
        const target = stored ? await readGesture(db, input.gestureId) : null;
        if (!(stored && target)) {
          markUnchanged(db);
          return { deleted: false };
        }
        try {
          await db.batch([
            db
              .delete(gestureAudio)
              .where(
                and(
                  eq(gestureAudio.gestureId, input.gestureId),
                  eq(gestureAudio.locale, input.locale)
                )
              ),
            auditStatement(db, {
              action: "translation.audio_delete",
              actorId: context.user.id,
              data: {
                locale: input.locale,
                name: target.name,
                slug: target.slug,
              },
              targetId: target.id,
              targetType: "gesture",
            }),
          ]);
        } catch (error) {
          console.error("[translation] Failed to delete the audio:", error);
          throw error;
        }
        if (context.env.MEDIA) {
          await deleteObject(context.env.MEDIA, stored.r2Key);
        }
        return { deleted: true };
      }
    ),

    finalizeAudio: translatorProcedure.finalizeAudio.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        const { gestureId, key, locale } = input;
        const media = context.env.MEDIA;
        if (!media) {
          throw new Error("[translation] The MEDIA bucket is not bound");
        }
        const parsed = parseAudioKey(key);
        if (parsed?.gestureId !== gestureId || parsed.locale !== locale) {
          throw errors.VALIDATION(refusal("key"));
        }
        const target = await readGesture(db, gestureId);
        if (!(target && (await isEnabled(db, locale)))) {
          throw errors.NOT_FOUND();
        }
        // A key a clip is already stored under is never an upload to claim.
        const [inUse] = await db
          .select({ gestureId: gestureAudio.gestureId })
          .from(gestureAudio)
          .where(eq(gestureAudio.r2Key, key))
          .limit(1);
        if (inUse) {
          throw errors.VALIDATION(refusal("key"));
        }
        const checked = await checkUpload(media, key);
        if (!checked.ok) {
          throw errors.VALIDATION(refusal(checked.reason));
        }
        const { verdict, upload } = checked;
        // The bytes checked are the bytes stored: copy them to a key that
        // no client has a URL for, then drop the upload.
        const stored = `audio/${gestureId}/${locale}/${crypto.randomUUID()}`;
        if (!AUDIO_KEY_PATTERN.test(stored)) {
          throw new Error(
            `[translation] Built an invalid audio key for ${locale}`
          );
        }
        await media.put(stored, upload.bytes, {
          customMetadata: { uploadedAt: new Date().toISOString() },
          httpMetadata: { contentType: verdict.contentType },
        });
        await deleteObject(media, key);
        const previous = await readStored(db, gestureId, locale);
        const now = new Date();
        const values = {
          contentType: verdict.contentType,
          durationMs: verdict.durationMs,
          r2Key: stored,
          size: upload.bytes.byteLength,
          updatedAt: now,
          updatedBy: context.user.id,
        };
        try {
          await db.batch([
            db
              .insert(gestureAudio)
              .values({ gestureId, locale, ...values })
              .onConflictDoUpdate({
                set: values,
                target: [gestureAudio.gestureId, gestureAudio.locale],
              }),
            auditStatement(db, {
              action: "translation.audio_upload",
              actorId: context.user.id,
              data: {
                durationMs: verdict.durationMs,
                locale,
                name: target.name,
                replaced: previous !== null,
                size: upload.bytes.byteLength,
                slug: target.slug,
              },
              targetId: target.id,
              targetType: "gesture",
            }),
          ]);
        } catch (error) {
          await deleteObject(media, stored);
          console.error("[translation] Failed to record the audio:", error);
          throw error;
        }
        if (previous) {
          await deleteObject(media, previous.r2Key);
        }
        return toRow({ ...values, gestureId, locale });
      }
    ),

    listAudio: translatorProcedure.listAudio.handler(
      async ({ context, input }) => {
        try {
          const rows = await context.db
            .select()
            .from(gestureAudio)
            .where(eq(gestureAudio.gestureId, input.gestureId))
            .orderBy(gestureAudio.locale);
          return { items: rows.map(toRow) };
        } catch (error) {
          console.error("[translation] Failed to list the audio:", error);
          throw error;
        }
      }
    ),

    uploadAudio: translatorProcedure.uploadAudio.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        if (
          !(
            (await readGesture(db, input.gestureId)) &&
            (await isEnabled(db, input.locale))
          )
        ) {
          throw errors.NOT_FOUND();
        }
        return await audioUploadUrl(context.env, {
          contentType: input.contentType,
          key: `audio/${input.gestureId}/${input.locale}/${crypto.randomUUID()}`,
          now: Date.now(),
          size: input.size,
        });
      }
    ),
  };
}
