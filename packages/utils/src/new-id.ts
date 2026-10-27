/** A new random id (UUID v4) for a primary key. */
export function newId(): string {
  return crypto.randomUUID();
}
