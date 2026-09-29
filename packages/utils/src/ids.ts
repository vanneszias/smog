/** A new random id (UUID v4) for a primary key. */
export function newId(): string {
  return crypto.randomUUID();
}

const BASE64_PADDING = /[=]+$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING, "");
}

/** A random capability token: `bytes` random bytes as unpadded base64url. */
export function newToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** The SHA-256 of `input` (UTF-8) as lowercase hex, using Web Crypto. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
