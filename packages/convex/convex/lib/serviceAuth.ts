/**
 * Authenticate calls made by the trusted API server and background workers.
 *
 * Public Convex functions remain reachable over the Convex endpoint, so
 * server-only functions must verify a secret at the data boundary instead of
 * relying solely on the HTTP layer that normally calls them.
 */
export function isValidServiceToken(token: string | undefined): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  return Boolean(expected && token && token === expected);
}

export function requireServiceAuth(
  token: string | undefined,
  operation: string
): void {
  if (!isValidServiceToken(token)) {
    throw new Error(`[${operation}] Unauthorized`);
  }
}
