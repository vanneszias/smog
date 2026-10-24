/**
 * Teacher information and drawings (phase 10c, spec 4.1 to 4.3): the shapes
 * and caps shared by the contract, the server, the editor and the PDFs.
 * Client-safe. **Private material:** nothing here may be reachable from a
 * public output schema (`packages/api/test/teacher-privacy.test.ts`).
 */
import { localeCodeSchema } from "@smog/config/locale";
import {
  DRAWING_CONTENT_TYPES,
  DRAWING_CREDIT_MAX,
  DRAWING_UPLOAD_TYPES,
  TEACHER_FIELD_MAX,
} from "@smog/db/enums";
import { z } from "zod";

/**
 * The text fields of a gesture's teacher information, in the order the
 * teachers' sheet prints them (HC, PL, OR, BW, then the C note, the free
 * note and the participants' summary). `or` is `or_` in D1 (`OR` is an SQL
 * keyword): `TEACHER_FIELD_COLUMNS` maps the two.
 */
export const TEACHER_INFO_FIELDS = [
  "hc",
  "pl",
  "or",
  "bw",
  "cNote",
  "note",
  "summary",
] as const;
export type TeacherInfoField = (typeof TEACHER_INFO_FIELDS)[number];

/** The D1 column of each field (`gesture_teacher_info`). */
export const TEACHER_FIELD_COLUMNS = {
  bw: "bw",
  cNote: "c_note",
  hc: "hc",
  note: "note",
  or: "or_",
  pl: "pl",
  summary: "summary",
} as const satisfies Record<TeacherInfoField, string>;

const teacherTextSchema = z.string().max(TEACHER_FIELD_MAX);

/** The seven text fields of one language (empty string = nothing entered). */
export const teacherInfoFieldsSchema = z.object({
  bw: teacherTextSchema,
  cNote: teacherTextSchema,
  hc: teacherTextSchema,
  note: teacherTextSchema,
  or: teacherTextSchema,
  pl: teacherTextSchema,
  summary: teacherTextSchema,
});
export type TeacherInfoFields = z.infer<typeof teacherInfoFieldsSchema>;

/** A language's row: the fields and the stale-lock version (`gesture_teacher_info.version`). */
export const teacherInfoRowSchema = teacherInfoFieldsSchema.extend({
  gestureId: z.string(),
  locale: localeCodeSchema,
  updatedAt: z.number().int(),
  version: z.number().int().min(1),
});
export type TeacherInfoRow = z.infer<typeof teacherInfoRowSchema>;

/** Nothing entered yet: what the editor shows for a language without a row. */
export const EMPTY_TEACHER_INFO: TeacherInfoFields = {
  bw: "",
  cNote: "",
  hc: "",
  note: "",
  or: "",
  pl: "",
  summary: "",
};

export const drawingStepSchema = z.union([z.literal(1), z.literal(2)]);
export type DrawingStepValue = z.infer<typeof drawingStepSchema>;

export const drawingContentTypeSchema = z.enum(DRAWING_CONTENT_TYPES);
/** What an upload may be (PNG or JPEG); a stored row can still be an older WebP. */
export const drawingUploadTypeSchema = z.enum(DRAWING_UPLOAD_TYPES);

/** The credit line printed under a drawing in the participants' PDF. */
export const drawingCreditSchema = z.string().trim().max(DRAWING_CREDIT_MAX);

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** `teacher/drawings/<gestureId>/<step>/<uuid>`: the only key shape the server issues and accepts. */
export const DRAWING_KEY_PATTERN = new RegExp(
  `^teacher/drawings/(${UUID})/([12])/(${UUID})$`
);

export const drawingKeySchema = z.string().regex(DRAWING_KEY_PATTERN);

/** The gesture and step a key names, or `null` when it is not a drawing key. */
export function parseDrawingKey(
  key: string
): { gestureId: string; step: DrawingStepValue; uuid: string } | null {
  if (!DRAWING_KEY_PATTERN.test(key)) {
    return null;
  }
  // `teacher/drawings/<gestureId>/<step>/<uuid>`: no id contains a slash.
  const [, , gestureId = "", step = "", uuid = ""] = key.split("/");
  return { gestureId, step: step === "2" ? 2 : 1, uuid };
}

/** A drawing's metadata (never the bytes, never the object key). */
export const drawingRowSchema = z.object({
  contentType: drawingContentTypeSchema,
  credit: z.string(),
  gestureId: z.string(),
  height: z.number().int(),
  /** The private route the image is served from (teachers and admins only). */
  path: z.string(),
  size: z.number().int(),
  step: drawingStepSchema,
  updatedAt: z.number().int(),
  width: z.number().int(),
});
export type DrawingRow = z.infer<typeof drawingRowSchema>;
