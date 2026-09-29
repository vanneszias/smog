import { ORPCError, os } from "@orpc/server";
import type { WorkerEnv } from "@smog/config/env/worker";
import { ERRORS } from "../errors";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The header clients send the Turnstile widget token in. */
export const TURNSTILE_HEADER = "x-turnstile-token";

interface VerifyTurnstileOptions {
  ip: string;
  secret: string;
  token: string;
}

/** Verifies a Turnstile token with Cloudflare's siteverify endpoint. */
export async function verifyTurnstile({
  ip,
  secret,
  token,
}: VerifyTurnstileOptions): Promise<boolean> {
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  body.set("remoteip", ip);
  try {
    const response = await fetch(SITEVERIFY_URL, { body, method: "POST" });
    if (!response.ok) {
      return false;
    }
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch (error) {
    console.error("[rpc] Failed to verify a Turnstile token:", error);
    throw error;
  }
}

/**
 * Requires a valid Turnstile token in the `x-turnstile-token` header, for
 * public mutations. Skipped when `TURNSTILE_SECRET_KEY` is unset (dev).
 */
export const requireTurnstile = os
  .$context<{
    env: Pick<WorkerEnv, "TURNSTILE_SECRET_KEY">;
    ip: string;
    request: Request;
  }>()
  .middleware(async ({ context, next }) => {
    const secret = context.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      return await next();
    }
    const token = context.request.headers.get(TURNSTILE_HEADER);
    const valid =
      token !== null &&
      token !== "" &&
      (await verifyTurnstile({ ip: context.ip, secret, token }));
    if (!valid) {
      throw new ORPCError("TURNSTILE_FAILED", {
        status: ERRORS.TURNSTILE_FAILED.status,
      });
    }
    return await next();
  });
