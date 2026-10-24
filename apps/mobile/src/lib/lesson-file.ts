import type { LessonTemplate } from "@smog/lessons/schema";
import { File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { Platform } from "react-native";
import { remove, sweepExportFiles } from "./export-file";

/**
 * Why a lesson PDF could not be made or shared. The first four are the
 * route's own typed errors (`GET /api/teacher/lessons/<id>/pdf`, docs/API.md),
 * `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` its refusals, `OFFLINE` a
 * request that never reached the site, `SHARING_UNAVAILABLE` a device with no
 * share sheet, `FAILED` anything else.
 */
export type LessonPdfErrorCode =
  | "FAILED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "OFFLINE"
  | "RATE_LIMITED"
  | "SHARING_UNAVAILABLE"
  | "TIMEOUT"
  | "TOO_LARGE"
  | "TOO_MANY"
  | "UNAUTHORIZED";

export class LessonPdfError extends Error {
  readonly code: LessonPdfErrorCode;
  constructor(code: LessonPdfErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "LessonPdfError";
    this.code = code;
  }
}

const BODY_CODES: readonly LessonPdfErrorCode[] = [
  "RATE_LIMITED",
  "TIMEOUT",
  "TOO_LARGE",
  "TOO_MANY",
];

/** The error for a refused response: the typed `code` of its JSON body, else the status. */
async function refusalOf(response: Response): Promise<LessonPdfError> {
  let code: unknown;
  try {
    ({ code } = (await response.json()) as { code?: unknown });
  } catch {
    // Not JSON (a proxy page): the status decides.
  }
  const typed = BODY_CODES.find((known) => known === code);
  if (typed) {
    return new LessonPdfError(typed);
  }
  if (response.status === 401) {
    return new LessonPdfError("UNAUTHORIZED");
  }
  if (response.status === 403) {
    return new LessonPdfError("FORBIDDEN");
  }
  if (response.status === 404) {
    return new LessonPdfError("NOT_FOUND");
  }
  return new LessonPdfError(
    response.status === 429 ? "RATE_LIMITED" : "FAILED"
  );
}

/** `/api/teacher/lessons/<id>/pdf?template=&locale=`, to put on the API origin. */
export function lessonPdfPath(
  lessonId: string,
  template: LessonTemplate,
  locale: string
): string {
  return `/api/teacher/lessons/${encodeURIComponent(lessonId)}/pdf?template=${template}&locale=${encodeURIComponent(locale)}`;
}

const UNSAFE_FILE_CHARS = /[^A-Za-z0-9-]/g;

/** The cache file's name: each template and language of a lesson gets its own. */
export function lessonPdfFileName(
  lessonId: string,
  template: LessonTemplate,
  locale: string
): string {
  const lesson = lessonId.replace(UNSAFE_FILE_CHARS, "").slice(0, 8);
  return `les-${lesson}-${template}-${locale.replace(UNSAFE_FILE_CHARS, "")}.pdf`;
}

export interface LessonPdfRequest {
  /** The session cookie, as every authenticated call sends it. */
  cookie: string;
  fetchImpl?: typeof fetch;
  /** The PDF route on the API origin (`apiUrl(lessonPdfPath(…))`). */
  url: string;
}

/** Downloads the PDF through the authenticated route. Throws a `LessonPdfError`. */
export async function fetchLessonPdf({
  cookie,
  fetchImpl = fetch,
  url,
}: LessonPdfRequest): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      // The cookie is sent by hand (SecureStore); the native jar stays out of it.
      credentials: "omit",
      headers: cookie ? { cookie } : {},
    });
  } catch (error) {
    console.error("[lessons] Failed to reach the PDF route:", error);
    throw new LessonPdfError("OFFLINE", { cause: error });
  }
  if (!response.ok) {
    throw await refusalOf(response);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Writes the PDF to the cache directory and opens the share sheet (save to
 * Files, mail, print, ...). It is a teacher's private material, so the file
 * does not stay (as the account export, `shareJsonFile`): deleted when the
 * sheet closes on iOS, on Android at the next sweep (launch, the next
 * export, account deletion), because the receiving app may still be reading
 * the content URI. A device with no share sheet gets `SHARING_UNAVAILABLE`
 * and nothing is written.
 */
export async function shareLessonPdf(
  bytes: Uint8Array,
  fileName: string,
  title: string,
  platform: typeof Platform.OS = Platform.OS
): Promise<void> {
  if (!(await isAvailableAsync())) {
    throw new LessonPdfError("SHARING_UNAVAILABLE");
  }
  sweepExportFiles();
  const file = new File(Paths.cache, fileName);
  try {
    file.create({ overwrite: true });
    file.write(bytes);
    await shareAsync(file.uri, {
      dialogTitle: title,
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
    });
  } catch (error) {
    console.error("[lessons] Failed to share the PDF:", error);
    throw error;
  } finally {
    if (platform !== "android") {
      remove(file);
    }
  }
}
