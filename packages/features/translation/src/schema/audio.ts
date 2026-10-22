/**
 * The spoken name of a gesture (phase 10b task 6): one MP3 or M4A clip per
 * gesture and language, at most 1 MiB and 10 s. Translators and admins
 * upload it with a presigned PUT, then finalize it (the server reads the
 * object and checks its bytes). Client-safe.
 */
import { localeCodeSchema } from "@smog/config/locale";
import { AUDIO_CONTENT_TYPES, AUDIO_MAX_BYTES } from "@smog/db/enums";
import { z } from "zod";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LOCALE = "[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}";

/** `audio/<gestureId>/<locale>/<uuid>`: the only key shape the server issues and accepts. */
export const AUDIO_KEY_PATTERN = new RegExp(
  `^audio/(${UUID})/(${LOCALE})/(${UUID})$`
);

export const audioKeySchema = z.string().regex(AUDIO_KEY_PATTERN);

/** The gesture and language a key names, or `null` when it is not an audio key. */
export function parseAudioKey(
  key: string
): { gestureId: string; locale: string; uuid: string } | null {
  if (!AUDIO_KEY_PATTERN.test(key)) {
    return null;
  }
  // `audio/<gestureId>/<locale>/<uuid>`: neither id nor tag contains a slash.
  const [, gestureId = "", locale = "", uuid = ""] = key.split("/");
  return { gestureId, locale, uuid };
}

export const audioContentTypeSchema = z.enum(AUDIO_CONTENT_TYPES);

export const audioUploadInputSchema = z.object({
  contentType: audioContentTypeSchema,
  gestureId: z.uuid(),
  locale: localeCodeSchema,
  size: z.number().int().min(1).max(AUDIO_MAX_BYTES),
});
export type AudioUploadInput = z.infer<typeof audioUploadInputSchema>;

/** A PUT the browser makes itself, with exactly these headers. */
export const audioUploadResultSchema = z.object({
  /** Epoch ms after which the URL no longer works. */
  expiresAt: z.number().int(),
  headers: z.object({ "content-type": audioContentTypeSchema }),
  key: audioKeySchema,
  uploadUrl: z.url(),
});
export type AudioUploadResult = z.infer<typeof audioUploadResultSchema>;

export const audioFinalizeInputSchema = z.object({
  gestureId: z.uuid(),
  key: audioKeySchema,
  locale: localeCodeSchema,
});
export type AudioFinalizeInput = z.infer<typeof audioFinalizeInputSchema>;

/** Why a finalize refuses (`VALIDATION`, field `file`). */
export const AUDIO_REFUSALS = [
  "missing",
  "tooLarge",
  "format",
  "duration",
  "key",
] as const;
export type AudioRefusal = (typeof AUDIO_REFUSALS)[number];

export const audioRowSchema = z.object({
  contentType: audioContentTypeSchema,
  durationMs: z.number().int(),
  gestureId: z.string(),
  locale: z.string(),
  /** Where the clip is served from (same origin). */
  path: z.string(),
  size: z.number().int(),
  updatedAt: z.number().int(),
});
export type AudioRow = z.infer<typeof audioRowSchema>;

export const audioListInputSchema = z.object({ gestureId: z.uuid() });
export const audioListSchema = z.object({ items: z.array(audioRowSchema) });
export type AudioList = z.infer<typeof audioListSchema>;

export const audioDeleteInputSchema = z.object({
  gestureId: z.uuid(),
  locale: localeCodeSchema,
});
export const audioDeleteResultSchema = z.object({ deleted: z.boolean() });
