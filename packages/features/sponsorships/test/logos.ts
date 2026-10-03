/** Logo fixtures: the first bytes of each format, padded to a small file. */
import { env } from "cloudflare:workers";
import { newId } from "@smog/utils";

function file(head: readonly number[], size = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set(head);
  return bytes;
}

const ascii = (text: string): number[] =>
  Array.from(text, (char) => char.charCodeAt(0));

export const PNG = file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const JPEG = file([0xff, 0xd8, 0xff, 0xe0]);
export const WEBP = file([
  ...ascii("RIFF"),
  0x24,
  0x00,
  0x00,
  0x00,
  ...ascii("WEBP"),
]);
export const GIF = file(ascii("GIF89a"));

export function media(): R2Bucket {
  if (!env.MEDIA) {
    throw new Error("[test] The MEDIA binding is missing");
  }
  return env.MEDIA;
}

/** Stores a logo as an upload would and answers its key. */
export async function putLogo(
  bytes: Uint8Array<ArrayBuffer> = PNG,
  contentType = "image/png"
): Promise<string> {
  const key = `logos/${newId()}`;
  await media().put(key, bytes, {
    customMetadata: { uploadedAt: new Date().toISOString() },
    httpMetadata: { contentType },
  });
  return key;
}
