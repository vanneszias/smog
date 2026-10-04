/**
 * Deterministic ids for migrated rows (phase 8 ruling 7): every row the
 * import writes gets `legacyUuid(table, key)`, so a re-run, a reset plus a
 * re-apply, or a second plan of the same export yields the same ids, and
 * `INSERT … ON CONFLICT … DO NOTHING` makes a re-run change nothing.
 *
 * The id is a UUID v8 (RFC 9562 §5.8): the first 16 bytes of the SHA-256
 * of `smog-convex:<table>:<key>`, with the version and variant bits set.
 * `table` is the D1 table the row goes to (`user`, `gesture`, …); `key` is
 * the Convex `_id`, or `legacyKey(...parts)` (a JSON array) for a key made
 * of several parts.
 */

const PREFIX = "smog-convex";

const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

/** The UUID v8 of `smog-convex:<table>:<key>` (Web Crypto SHA-256). */
export async function legacyUuid(table: string, key: string): Promise<string> {
  if (table.length === 0 || table.includes(":")) {
    throw new Error(`[migrate-convex] Invalid legacyUuid table: ${table}`);
  }
  if (key.length === 0) {
    throw new Error(`[migrate-convex] Empty legacyUuid key for ${table}`);
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${PREFIX}:${table}:${key}`)
  );
  const bytes = new Uint8Array(digest).slice(0, 16);
  // Version 8 in the high nibble of byte 6 (keep the low nibble, add
  // 0x80), variant 0b10 in the top bits of byte 8 (keep the low six bits,
  // add 0x80).
  bytes[6] = ((bytes[6] ?? 0) % 0x10) + 0x80;
  bytes[8] = ((bytes[8] ?? 0) % 0x40) + 0x80;
  const text = hex(bytes);
  return [
    text.slice(0, 8),
    text.slice(8, 12),
    text.slice(12, 16),
    text.slice(16, 20),
    text.slice(20),
  ].join("-");
}

/**
 * The key of a row made from several parts (task 5 review M5): the JSON
 * array of the parts, for example `legacyKey(listId, "2")` for the second
 * part of a split list or `legacyKey(userId, gestureId)` for a favorite.
 * JSON keeps the parts apart whatever they hold (a `:` in a slug or a
 * keyword); a row with one Convex `_id` uses that `_id` as it is.
 */
export function legacyKey(...parts: readonly string[]): string {
  if (parts.length < 2) {
    throw new Error(
      "[migrate-convex] legacyKey is for composite keys: use the _id itself"
    );
  }
  return JSON.stringify(parts);
}

/** `legacyUuid(table, key)` for each distinct key, as a map from key to id. */
export async function legacyUuids(
  table: string,
  keys: Iterable<string>
): Promise<Map<string, string>> {
  const distinct = [...new Set(keys)];
  const ids = await Promise.all(distinct.map((key) => legacyUuid(table, key)));
  return new Map(distinct.map((key, index) => [key, ids[index] ?? ""]));
}
