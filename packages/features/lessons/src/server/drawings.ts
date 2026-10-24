/**
 * `teacher.uploadDrawing`, `finalizeDrawing`, `deleteDrawing` and
 * `listDrawings` (phase 10c task 3, plan ruling 6): a gesture's drawings,
 * one PNG, JPEG or WebP per step in R2 under
 * `teacher/drawings/<gestureId>/<step>/<uuid>`.
 *
 * The browser PUTs the file itself (`drawingUploadUrl`). `finalizeDrawing`
 * then reads the object, checks its bytes (`inspectDrawing`: the declared
 * type is never trusted), copies the verified bytes to a fresh key no client
 * has a URL for (a presigned PUT that is still valid cannot change what was
 * checked), records the drawing with its audit entry in one batch, and
 * removes the upload and the drawing it replaces. A refused upload is
 * deleted. Nothing here is public: the image is read back through
 * `GET /api/teacher/drawings/<gestureId>/<step>` (teacher, translator or
 * admin session).
 */
import { gesture, gestureDrawing } from "@smog/db";
import type { Db } from "@smog/db/client";
import { DRAWING_MAX_BYTES } from "@smog/db/enums";
import { markUnchanged } from "@smog/rpc/audit";
import { and, eq } from "drizzle-orm";
import {
  DRAWING_KEY_PATTERN,
  type DrawingRefusal,
  type DrawingRow,
  drawingPath,
  parseDrawingKey,
} from "../schema";
import { auditStatement } from "./audit";
import { drawingUploadUrl } from "./drawing-upload";
import { type DrawingVerdict, inspectDrawing } from "./drawing-verify";
import { teacherWriteProcedure, teachingProcedure } from "./procedure";

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
    console.error("[lessons] Failed to read a gesture:", error);
    throw error;
  }
}

function refusal(reason: DrawingRefusal) {
  return {
    data: { fieldErrors: { file: [reason] }, formErrors: [] as string[] },
  };
}

function toRow(row: {
  contentType: DrawingRow["contentType"];
  credit: string;
  gestureId: string;
  height: number;
  size: number;
  step: number;
  updatedAt: Date;
  width: number;
}): DrawingRow {
  const stamp = row.updatedAt.getTime();
  return {
    contentType: row.contentType,
    credit: row.credit,
    gestureId: row.gestureId,
    height: row.height,
    path: drawingPath(row.gestureId, row.step, stamp),
    size: row.size,
    step: row.step === 2 ? 2 : 1,
    updatedAt: stamp,
    width: row.width,
  };
}

/** Deletes an object; a failure is logged (it is an orphan, never a wrong drawing). */
async function deleteObject(media: R2Bucket, key: string): Promise<void> {
  try {
    await media.delete(key);
  } catch (error) {
    console.error(`[lessons] Failed to delete the drawing ${key}:`, error);
  }
}

async function readStored(db: Db, gestureId: string, step: number) {
  try {
    const [row] = await db
      .select()
      .from(gestureDrawing)
      .where(
        and(
          eq(gestureDrawing.gestureId, gestureId),
          eq(gestureDrawing.step, step)
        )
      )
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.error("[lessons] Failed to read the drawing:", error);
    throw error;
  }
}

/** The bytes of an upload when it is within the size cap, else why not. */
async function readUpload(
  media: R2Bucket,
  key: string
): Promise<
  | { bytes: Uint8Array<ArrayBuffer>; declaredType: string | undefined }
  | { reason: DrawingRefusal }
> {
  const head = await media.head(key);
  if (!head) {
    return { reason: "missing" };
  }
  if (head.size < 1 || head.size > DRAWING_MAX_BYTES) {
    return { reason: "tooLarge" };
  }
  const object = await media.get(key);
  if (!object) {
    return { reason: "missing" };
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  return bytes.byteLength > DRAWING_MAX_BYTES
    ? { reason: "tooLarge" }
    : { bytes, declaredType: object.httpMetadata?.contentType };
}

type UploadCheck =
  | {
      ok: true;
      upload: { bytes: Uint8Array<ArrayBuffer> };
      verdict: Extract<DrawingVerdict, { ok: true }>;
    }
  | { ok: false; reason: DrawingRefusal };

/**
 * Reads an upload and checks its bytes against the type it was sent with.
 * An upload that fails any check (size, format, dimensions) is deleted.
 */
async function checkUpload(media: R2Bucket, key: string): Promise<UploadCheck> {
  const upload = await readUpload(media, key);
  if ("reason" in upload) {
    if (upload.reason !== "missing") {
      console.warn(`[lessons] Refused the drawing ${key}: ${upload.reason}`);
      await deleteObject(media, key);
    }
    return { ok: false, reason: upload.reason };
  }
  const verdict = inspectDrawing(upload.bytes);
  if (verdict.ok && upload.declaredType === verdict.contentType) {
    return { ok: true, upload, verdict };
  }
  const reason = verdict.ok ? "format" : verdict.reason;
  console.warn(`[lessons] Refused the drawing ${key}: ${reason}`);
  await deleteObject(media, key);
  return { ok: false, reason };
}

/** The drawing procedures of the teacher router. */
export function drawingRoutes() {
  return {
    deleteDrawing: teacherWriteProcedure.deleteDrawing.handler(
      async ({ context, input }) => {
        const { db } = context;
        const stored = await readStored(db, input.gestureId, input.step);
        if (!stored) {
          markUnchanged(db);
          return { deleted: false };
        }
        try {
          await db.batch([
            db
              .delete(gestureDrawing)
              .where(
                and(
                  eq(gestureDrawing.gestureId, input.gestureId),
                  eq(gestureDrawing.step, input.step)
                )
              ),
            auditStatement(db, {
              action: "teacher.drawing_delete",
              actorId: context.user.id,
              data: { step: input.step },
              targetId: `${input.gestureId}:${input.step}`,
              targetType: "gesture_teacher_info",
            }),
          ]);
        } catch (error) {
          console.error("[lessons] Failed to delete the drawing:", error);
          throw error;
        }
        if (context.env.MEDIA) {
          await deleteObject(context.env.MEDIA, stored.r2Key);
        }
        return { deleted: true };
      }
    ),

    finalizeDrawing: teacherWriteProcedure.finalizeDrawing.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        const { credit, gestureId, key, step } = input;
        const media = context.env.MEDIA;
        if (!media) {
          throw new Error("[lessons] The MEDIA bucket is not bound");
        }
        const parsed = parseDrawingKey(key);
        if (parsed?.gestureId !== gestureId || parsed.step !== step) {
          throw errors.VALIDATION(refusal("key"));
        }
        if (!(await readGesture(db, gestureId))) {
          throw errors.NOT_FOUND();
        }
        // A key a drawing is already stored under is never an upload to claim.
        const [inUse] = await db
          .select({ gestureId: gestureDrawing.gestureId })
          .from(gestureDrawing)
          .where(eq(gestureDrawing.r2Key, key))
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
        const stored = `teacher/drawings/${gestureId}/${step}/${crypto.randomUUID()}`;
        if (!DRAWING_KEY_PATTERN.test(stored)) {
          throw new Error(
            `[lessons] Built an invalid drawing key for step ${step}`
          );
        }
        await media.put(stored, upload.bytes, {
          customMetadata: { uploadedAt: new Date().toISOString() },
          httpMetadata: { contentType: verdict.contentType },
        });
        await deleteObject(media, key);
        const previous = await readStored(db, gestureId, step);
        const values = {
          contentType: verdict.contentType,
          credit,
          height: verdict.height,
          r2Key: stored,
          size: upload.bytes.byteLength,
          updatedAt: new Date(),
          updatedBy: context.user.id,
          width: verdict.width,
        };
        try {
          await db.batch([
            db
              .insert(gestureDrawing)
              .values({ gestureId, step, ...values })
              .onConflictDoUpdate({
                set: values,
                target: [gestureDrawing.gestureId, gestureDrawing.step],
              }),
            auditStatement(db, {
              action: "teacher.drawing_upload",
              actorId: context.user.id,
              data: previous ? { replaced: true, step } : { step },
              targetId: `${gestureId}:${step}`,
              targetType: "gesture_teacher_info",
            }),
          ]);
        } catch (error) {
          await deleteObject(media, stored);
          console.error("[lessons] Failed to record the drawing:", error);
          throw error;
        }
        if (previous) {
          await deleteObject(media, previous.r2Key);
        }
        return toRow({ ...values, gestureId, step });
      }
    ),

    listDrawings: teachingProcedure.listDrawings.handler(
      async ({ context, input }) => {
        try {
          const rows = await context.db
            .select()
            .from(gestureDrawing)
            .where(eq(gestureDrawing.gestureId, input.gestureId))
            .orderBy(gestureDrawing.step);
          return { items: rows.map(toRow) };
        } catch (error) {
          console.error("[lessons] Failed to list the drawings:", error);
          throw error;
        }
      }
    ),

    uploadDrawing: teacherWriteProcedure.uploadDrawing.handler(
      async ({ context, errors, input }) => {
        if (!(await readGesture(context.db, input.gestureId))) {
          throw errors.NOT_FOUND();
        }
        return await drawingUploadUrl(context.env, {
          contentType: input.contentType,
          key: `teacher/drawings/${input.gestureId}/${input.step}/${crypto.randomUUID()}`,
          now: Date.now(),
          size: input.size,
        });
      }
    ),
  };
}
