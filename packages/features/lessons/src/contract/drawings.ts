/**
 * The drawing procedures (phase 10c task 3), mounted as `teacher` in
 * `@smog/api`'s `appContract` beside the teacher-info ones.
 *
 * Who may call what (`packages/api/test/authz.test.ts` lists each):
 * - `uploadDrawing`, `finalizeDrawing`, `deleteDrawing`: the `teacher` role
 *   (an `admin` passes). A translator may not: the drawing card is read-only
 *   for them (plan ruling 5);
 * - `listDrawings`: a teacher, a translator or an admin (the card shows the
 *   drawings; a translator sees them and cannot change them).
 * `UNAUTHORIZED` for a guest, `FORBIDDEN` for any other account; the roles
 * are read from D1 on every request. A refused finalize is `VALIDATION`,
 * field `file`: `missing`, `tooLarge`, `format` (not a PNG or JPEG by
 * its bytes), `dimensions` (over 1,200 px on a side), `key`; the refused
 * upload is deleted from storage. A replaced drawing's object is removed.
 */
import type { AdminProcedures } from "@smog/admin/contract";
import { baseContract } from "@smog/rpc/contract";
import {
  drawingDeleteInputSchema,
  drawingDeleteResultSchema,
  drawingFinalizeInputSchema,
  drawingListInputSchema,
  drawingListSchema,
  drawingRowSchema,
  drawingUploadInputSchema,
  drawingUploadResultSchema,
} from "../schema";

export const drawingsSlice = {
  /** Removes a step's drawing and its object; `{ deleted: false }` (nothing audited) when there was none. */
  deleteDrawing: baseContract
    .input(drawingDeleteInputSchema)
    .output(drawingDeleteResultSchema),
  /** Reads the uploaded object, checks its bytes, stores it under a fresh key and records it with its credit. */
  finalizeDrawing: baseContract
    .input(drawingFinalizeInputSchema)
    .output(drawingRowSchema),
  /** A gesture's drawings (step 1 and 2, when set), metadata only. */
  listDrawings: baseContract
    .input(drawingListInputSchema)
    .output(drawingListSchema),
  /** The PUT URL for a drawing (`NOT_FOUND` for an unknown gesture); the file never passes through a procedure. */
  uploadDrawing: baseContract
    .input(drawingUploadInputSchema)
    .output(drawingUploadResultSchema),
};

export type DrawingsContract = typeof drawingsSlice;

/** Every drawing procedure with its kind (reads write nothing, mutations build their audit entry). */
export const DRAWING_KINDS = {
  deleteDrawing: {
    audit: "teacher.drawing_delete",
    noop: "deleting a drawing that is not there changes nothing",
  },
  finalizeDrawing: { audit: "teacher.drawing_upload" },
  listDrawings: "read",
  uploadDrawing: "read",
} as const satisfies AdminProcedures<DrawingsContract>;
