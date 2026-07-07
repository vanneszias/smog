import { getWorkOSConfig, WORKOS_ENDPOINTS } from "@smog/auth";
import type { Context as HonoContext } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface CreateContextOptions {
  context: HonoContext;
}

let cachedClientId: string | null = null;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getWorkOSJwks(clientId: string) {
  if (!(cachedJwks && cachedClientId === clientId)) {
    cachedClientId = clientId;
    cachedJwks = createRemoteJWKSet(new URL(WORKOS_ENDPOINTS.jwks(clientId)));
  }
  return cachedJwks;
}

async function verifyWorkOSAccessToken(token: string): Promise<string | null> {
  const { clientId } = getWorkOSConfig(process.env);
  if (!clientId) {
    console.error("[Auth] WORKOS_CLIENT_ID is not configured");
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getWorkOSJwks(clientId), {
      issuer: [
        WORKOS_ENDPOINTS.issuerUserManagement(clientId),
        WORKOS_ENDPOINTS.issuerSSO,
      ],
    });

    return typeof payload.sub === "string" ? payload.sub : null;
  } catch (error) {
    console.error("[Auth] Failed to verify WorkOS access token:", error);
    return null;
  }
}

export async function createContext({ context }: CreateContextOptions) {
  // Web/native clients send a WorkOS access token as `Bearer <token>`.
  const authHeader = context.req.raw.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  const workosId = bearerToken
    ? await verifyWorkOSAccessToken(bearerToken)
    : null;

  return {
    workosId,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
