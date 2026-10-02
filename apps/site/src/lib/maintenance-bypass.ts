/** `POST /api/maintenance/bypass` (`src/worker/maintenance.ts`). */
const BYPASS_URL = "/api/maintenance/bypass";

/** The bypass endpoint refused or failed (the status says why). */
class BypassRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`[maintenance] The bypass cookie request answered ${status}`);
    this.name = "BypassRequestError";
    this.status = status;
  }
}

/**
 * Asks for this browser's 12 h bypass cookie (HttpOnly, set by the
 * response) with the admin session, same-origin. Resolves with its expiry
 * (ISO 8601); throws `BypassRequestError` when it was refused.
 */
export async function requestBypassCookie(
  fetcher: typeof fetch = fetch
): Promise<string> {
  const response = await fetcher(BYPASS_URL, {
    credentials: "same-origin",
    method: "POST",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new BypassRequestError(response.status);
  }
  const { expiresAt } = (await response.json()) as { expiresAt: string };
  return expiresAt;
}
