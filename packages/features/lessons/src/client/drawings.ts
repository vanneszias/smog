/**
 * The drawing card's upload (phase 10c task 3): `teacher.uploadDrawing`
 * hands out a PUT URL (a presigned R2 URL, or the signed same-origin
 * fallback), the browser PUTs the file there with exactly the answered
 * headers, and `finalizeDrawing` has the server read and check it. The
 * checks here only save a trip; the server never trusts them.
 */
import { DRAWING_MAX_BYTES, type DrawingContentType } from "@smog/db/enums";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { type DrawingRow, drawingContentTypeSchema } from "../schema";
import {
  TEACHER_STALE_TIME,
  type TeacherClient,
  useInvalidateTeacher,
  useTeacherClient,
  useTeacherKey,
  useTeacherRpc,
} from "./slice";

/** The file the card holds (a `File` on the web). */
export interface DrawingFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

const PNG = /\.png$/i;
const JPEG = /\.jpe?g$/i;
const WEBP = /\.webp$/i;

/** The accepted type of a file (a name decides when the browser gives no type), or `null`. */
export function drawingTypeOf(file: DrawingFile): DrawingContentType | null {
  const declared = drawingContentTypeSchema.safeParse(file.type);
  if (declared.success) {
    return declared.data;
  }
  if (file.type === "" || file.type === "application/octet-stream") {
    if (PNG.test(file.name)) {
      return "image/png";
    }
    if (JPEG.test(file.name)) {
      return "image/jpeg";
    }
    return WEBP.test(file.name) ? "image/webp" : null;
  }
  return null;
}

/** Why a drawing was refused: the `teacher.drawings.errors` key. */
export type DrawingProblem =
  | "dimensions"
  | "format"
  | "generic"
  | "key"
  | "missing"
  | "network"
  | "tooLarge";

/** `null` for a PNG, JPEG or WebP of at most 1 MiB. */
export function drawingFileProblem(file: DrawingFile): DrawingProblem | null {
  if (drawingTypeOf(file) === null) {
    return "format";
  }
  return file.size < 1 || file.size > DRAWING_MAX_BYTES ? "tooLarge" : null;
}

/** The PUT was refused. */
export class DrawingUploadError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`[lessons] The drawing upload answered ${status}`);
    this.name = "DrawingUploadError";
    this.status = status;
  }
}

const validationDataSchema = z.object({
  fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
});

/** The first field error code of a `VALIDATION` error, else `null`. */
function validationCodeOf(error: unknown, field: string): string | null {
  const { code, data } =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown; data?: unknown })
      : {};
  if (code !== "VALIDATION") {
    return null;
  }
  const parsed = validationDataSchema.safeParse(data);
  return parsed.success ? (parsed.data.fieldErrors[field]?.[0] ?? null) : null;
}

const PUT_PROBLEMS: Readonly<Record<number, DrawingProblem>> = {
  413: "tooLarge",
  415: "format",
  422: "dimensions",
};

/** What to tell the editor about a failed upload or finalize. */
export function drawingProblemOf(error: unknown): DrawingProblem {
  if (error instanceof DrawingUploadError) {
    return PUT_PROBLEMS[error.status] ?? "network";
  }
  const code = validationCodeOf(error, "file");
  if (
    code === "dimensions" ||
    code === "format" ||
    code === "key" ||
    code === "missing" ||
    code === "tooLarge"
  ) {
    return code;
  }
  if (error instanceof TypeError) {
    // `fetch` rejects with a TypeError when the network fails.
    return "network";
  }
  return "generic";
}

export interface DrawingUploadParams {
  credit: string;
  file: Blob & DrawingFile;
  gestureId: string;
  step: 1 | 2;
}

/** Asks for the URL, PUTs the file, finalizes: answers the stored drawing. */
export async function uploadDrawingFile(
  client: TeacherClient,
  { credit, file, gestureId, step }: DrawingUploadParams,
  fetchImpl: typeof fetch = fetch
): Promise<DrawingRow> {
  const contentType = drawingTypeOf(file);
  if (contentType === null) {
    throw new DrawingUploadError(415);
  }
  try {
    const ticket = await client.uploadDrawing({
      contentType,
      gestureId,
      size: file.size,
      step,
    });
    const response = await fetchImpl(ticket.uploadUrl, {
      body: file,
      headers: ticket.headers,
      method: "PUT",
    });
    if (!response.ok) {
      throw new DrawingUploadError(response.status);
    }
    return await client.finalizeDrawing({
      credit,
      gestureId,
      key: ticket.key,
      step,
    });
  } catch (error) {
    console.error("[lessons] Failed to upload the drawing:", error);
    throw error;
  }
}

/** A gesture's drawings (step 1, and 2 when set). */
export function useGestureDrawings(gestureId: string) {
  const rpc = useTeacherRpc();
  const scoped = useTeacherKey();
  const options = rpc.listDrawings.queryOptions({
    input: { gestureId },
    staleTime: TEACHER_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** Upload (or replace) and delete a drawing; each refetches the `teacher.*` queries. */
export function useDrawingActions() {
  const client = useTeacherClient();
  const rpc = useTeacherRpc();
  const invalidate = useInvalidateTeacher();
  const upload = useMutation({
    mutationFn: (input: DrawingUploadParams) =>
      uploadDrawingFile(client, input),
    onSettled: invalidate,
  });
  const remove = useMutation(
    rpc.deleteDrawing.mutationOptions({ onSettled: invalidate })
  );
  return { remove, upload };
}
