/**
 * The audio editor's upload (phase 10b task 6): `translation.uploadAudio`
 * hands out a PUT URL (a presigned R2 URL, or the signed same-origin
 * fallback), the browser PUTs the file there with exactly the answered
 * headers, and `finalizeAudio` has the server read and check it. The
 * checks here only save a trip; the server never trusts them.
 */

import type { AUDIO_CONTENT_TYPES } from "@smog/db/enums";
import { AUDIO_MAX_BYTES } from "@smog/db/enums";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AudioRow } from "../schema";
import { validationCodeOf } from "./hooks";
import {
  TRANSLATION_STALE_TIME,
  type TranslationClient,
  useInvalidateTranslation,
  useTranslationClient,
  useTranslationKey,
  useTranslationRpc,
} from "./slice";

type AudioType = (typeof AUDIO_CONTENT_TYPES)[number];

/** The file the editor holds (a `File` on the web). */
export interface AudioFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

const MP3 = /\.mp3$/i;
const M4A = /\.(?:m4a|mp4)$/i;
const MP4_TYPES = new Set(["audio/mp4", "audio/x-m4a", "audio/m4a"]);

/** The accepted type of a file (browsers name an M4A `audio/x-m4a` or nothing), or `null`. */
export function audioTypeOf(file: AudioFile): AudioType | null {
  if (file.type === "audio/mpeg") {
    return "audio/mpeg";
  }
  if (MP4_TYPES.has(file.type)) {
    return "audio/mp4";
  }
  if (file.type === "" || file.type === "application/octet-stream") {
    if (MP3.test(file.name)) {
      return "audio/mpeg";
    }
    return M4A.test(file.name) ? "audio/mp4" : null;
  }
  return null;
}

/** Why a clip was refused: the `media.admin.audio.errors` key. */
export type AudioProblem =
  | "duration"
  | "format"
  | "generic"
  | "key"
  | "missing"
  | "network"
  | "tooLarge";

/** `null` for an MP3 or M4A of at most 1 MiB. */
export function audioFileProblem(file: AudioFile): AudioProblem | null {
  if (audioTypeOf(file) === null) {
    return "format";
  }
  return file.size < 1 || file.size > AUDIO_MAX_BYTES ? "tooLarge" : null;
}

/** The PUT was refused. */
export class AudioUploadError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`[translation] The audio upload answered ${status}`);
    this.name = "AudioUploadError";
    this.status = status;
  }
}

const PUT_PROBLEMS: Readonly<Record<number, AudioProblem>> = {
  413: "tooLarge",
  415: "format",
  422: "duration",
};

/** What to tell the editor about a failed upload or finalize. */
export function audioProblemOf(error: unknown): AudioProblem {
  if (error instanceof AudioUploadError) {
    return PUT_PROBLEMS[error.status] ?? "network";
  }
  const code = validationCodeOf(error, "file");
  if (
    code === "duration" ||
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

export interface AudioUploadInput {
  file: Blob & AudioFile;
  gestureId: string;
  locale: string;
}

/** Asks for the URL, PUTs the file, finalizes: answers the stored clip. */
export async function uploadAudioFile(
  client: TranslationClient,
  { file, gestureId, locale }: AudioUploadInput,
  fetchImpl: typeof fetch = fetch
): Promise<AudioRow> {
  const contentType = audioTypeOf(file);
  if (contentType === null) {
    throw new AudioUploadError(415);
  }
  try {
    const ticket = await client.uploadAudio({
      contentType,
      gestureId,
      locale,
      size: file.size,
    });
    const response = await fetchImpl(ticket.uploadUrl, {
      body: file,
      headers: ticket.headers,
      method: "PUT",
    });
    if (!response.ok) {
      throw new AudioUploadError(response.status);
    }
    return await client.finalizeAudio({ gestureId, key: ticket.key, locale });
  } catch (error) {
    console.error("[translation] Failed to upload the audio:", error);
    throw error;
  }
}

/** A gesture's clips, one per language. */
export function useGestureAudio(gestureId: string) {
  const rpc = useTranslationRpc();
  const scoped = useTranslationKey();
  const options = rpc.listAudio.queryOptions({
    input: { gestureId },
    staleTime: TRANSLATION_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** Upload (or replace) and delete a clip; each refetches the translation queries. */
export function useAudioActions() {
  const client = useTranslationClient();
  const rpc = useTranslationRpc();
  const invalidate = useInvalidateTranslation();
  const upload = useMutation({
    mutationFn: (input: AudioUploadInput) => uploadAudioFile(client, input),
    onSettled: invalidate,
  });
  const remove = useMutation(
    rpc.deleteAudio.mutationOptions({ onSettled: invalidate })
  );
  return { remove, upload };
}
