import { getTokenSubject } from "@smog/auth";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  // Extract WorkOS user id from Authorization bearer token.
  // Web/native clients send the WorkOS access token (JWT) as `Bearer <token>`.
  // For backwards compatibility, we also accept raw WorkOS user ids.
  const authHeader = context.req.raw.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  const jwtSubject = bearerToken ? getTokenSubject(bearerToken) : null;

  const workosId =
    jwtSubject ??
    (bearerToken && /^user_[A-Za-z0-9]+$/.test(bearerToken)
      ? bearerToken
      : null);

  return {
    workosId,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
