/**
 * Internal email trigger helper
 *
 * Calls the server's /api/email/trigger endpoint to enqueue transactional
 * emails from within oRPC route handlers.
 *
 * The server and the oRPC handler run in the same process, but packages/api
 * cannot directly import apps/server services. Using an HTTP call to the
 * loopback endpoint keeps the dependency boundary clean.
 */

export interface EmailTriggerPayload {
  type: string;
  to: string;
  [key: string]: unknown;
}

/**
 * Enqueue a transactional email by calling the internal trigger endpoint.
 * Errors are logged and swallowed so they never fail the calling handler.
 */
export async function triggerEmail(
  payload: EmailTriggerPayload
): Promise<void> {
  const serverUrl = process.env.SERVER_URL ?? "http://localhost:3000";

  try {
    const apiKey = process.env.INTERNAL_API_KEY;
    if (!apiKey && process.env.NODE_ENV === "production") {
      throw new Error("INTERNAL_API_KEY must be set in production");
    }
    const response = await fetch(`${serverUrl}/api/email/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey ?? "dev-internal-secret"}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[EmailTrigger] HTTP ${response.status} from /api/email/trigger: ${body}`
      );
    }
  } catch (error) {
    console.error("[EmailTrigger] Failed to call /api/email/trigger:", error);
  }
}
