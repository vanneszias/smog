/**
 * The session module `payloadFetch` calls when a request asks for
 * `auth: true`.
 *
 * Stubbed on purpose for this task: `getToken` always resolves `null`, so
 * every authenticated request behaves exactly like an unauthenticated one
 * (no `Authorization` header) until Task 8 wires this up to real storage
 * (`expo-secure-store`). Building that here would be ahead of the task that
 * owns it — see this repo's Stage 8 plan, Task 8. `payloadFetch`'s own
 * tests only assert the no-session case, which this satisfies without it.
 */
export function getToken(): Promise<string | null> {
  return Promise.resolve(null);
}

/**
 * Called by `payloadFetch` on a 401, so a rejected session is dropped
 * rather than retried forever with the same stale token. A no-op until
 * Task 8 gives this module something to clear.
 */
export function clearSession(): Promise<void> {
  return Promise.resolve();
}
