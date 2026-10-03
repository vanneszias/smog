/**
 * The logo dropzone's upload (ruling 10): `sponsorships.uploadLogo` hands
 * out a PUT URL (a presigned R2 URL, or the signed same-origin fallback),
 * the browser PUTs the file there with exactly the answered headers, and
 * the checkout (or the re-edit) sends the key. The server checks the type,
 * the size and the magic bytes again; the checks here only save a trip.
 */
import { useMutation } from "@tanstack/react-query";
import {
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  type LogoContentType,
} from "../schema/wizard";
import { type SponsorshipsClient, useSponsorshipsClient } from "./slice";

/** What the client checks before uploading. */
export type LogoFileError = "logoType" | "logoTooLarge";

/** The file the dropzone holds (a `File` on the web). */
export interface LogoFile {
  readonly size: number;
  readonly type: string;
}

function isLogoType(type: string): type is LogoContentType {
  return (LOGO_CONTENT_TYPES as readonly string[]).includes(type);
}

/** `null` for a PNG, JPEG or WebP of at most 2 MiB (S-06). */
export function logoFileError(file: LogoFile): LogoFileError | null {
  if (!isLogoType(file.type)) {
    return "logoType";
  }
  if (file.size < 1 || file.size > LOGO_MAX_BYTES) {
    return "logoTooLarge";
  }
  return null;
}

/** The PUT was refused (an expired URL, a type the URL was not signed for). */
export class LogoUploadError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`[sponsorships] The logo upload answered ${status}`);
    this.name = "LogoUploadError";
    this.status = status;
  }
}

/**
 * Asks for an upload URL, PUTs the file and answers its key
 * (`logos/<uuid>`). Throws `LogoUploadError` when the PUT fails.
 */
export async function uploadLogoFile(
  client: SponsorshipsClient,
  file: Blob,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (!isLogoType(file.type)) {
    throw new LogoUploadError(415);
  }
  try {
    const ticket = await client.uploadLogo({
      contentType: file.type,
      size: file.size,
    });
    const response = await fetchImpl(ticket.uploadUrl, {
      body: file,
      headers: ticket.headers,
      method: "PUT",
    });
    if (!response.ok) {
      throw new LogoUploadError(response.status);
    }
    return ticket.key;
  } catch (error) {
    console.error("[sponsorships] Failed to upload the logo:", error);
    throw error;
  }
}

/** `uploadLogoFile` as a mutation: `mutateAsync(file)` answers the key. */
export function useLogoUpload() {
  const client = useSponsorshipsClient();
  return useMutation({
    mutationFn: (file: Blob) => uploadLogoFile(client, file),
  });
}
