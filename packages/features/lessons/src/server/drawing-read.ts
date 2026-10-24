/**
 * The one read the private drawing route needs (`GET /api/teacher/drawings/
 * <gestureId>/<step>`, phase 10c task 3): where a step's image lives and
 * the content type its bytes were verified as. The route checks the session
 * first; this only maps a gesture and step to the stored object.
 */
import { gestureDrawing } from "@smog/db";
import type { Db } from "@smog/db/client";
import type { DrawingContentType } from "@smog/db/enums";
import { and, eq } from "drizzle-orm";

export interface StoredDrawing {
  contentType: DrawingContentType;
  r2Key: string;
}

/** The stored drawing of `step`, or `null` when the gesture has none. */
export async function findDrawing(
  db: Db,
  gestureId: string,
  step: number
): Promise<StoredDrawing | null> {
  try {
    const [row] = await db
      .select({
        contentType: gestureDrawing.contentType,
        r2Key: gestureDrawing.r2Key,
      })
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
    console.error("[lessons] Failed to read a drawing:", error);
    throw error;
  }
}
