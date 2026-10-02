/** `POST /api/maintenance/bypass` (`src/worker/maintenance.ts`). */
const BYPASS_URL = "/api/maintenance/bypass";
const TOO_MANY_REQUESTS = 429;

/** The bypass endpoint refused or failed (the status says why). */
export class BypassRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`[maintenance] The bypass cookie request answered ${status}`);
    this.name = "BypassRequestError";
    this.status = status;
  }
}

/** Whether a bypass request failed on the rate limit (`RL_AUTH`). */
export function isBypassRateLimited(error: unknown): boolean {
  return (
    error instanceof BypassRequestError && error.status === TOO_MANY_REQUESTS
  );
}

/** What the endpoint issued: the cookie's expiry and the version it signed. */
export interface IssuedBypass {
  bypassVersion: number;
  /** ISO 8601. */
  expiresAt: string;
}

/**
 * Asks for this browser's 12 h bypass cookie (HttpOnly, set by the
 * response) with the admin session, same-origin. Resolves with what was
 * issued; throws `BypassRequestError` when it was refused.
 */
export async function requestBypassCookie(
  fetcher: typeof fetch = fetch
): Promise<IssuedBypass> {
  const response = await fetcher(BYPASS_URL, {
    credentials: "same-origin",
    method: "POST",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new BypassRequestError(response.status);
  }
  return (await response.json()) as IssuedBypass;
}
