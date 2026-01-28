/**
 * Server-side WorkOS authentication utilities
 *
 * These functions should only be used on the server (never in client code)
 * as they require the client secret.
 */

import { getWorkOSConfig, WORKOS_ENDPOINTS } from "./config";
import type { TokenResponse, WorkOSUser } from "./types";

// Re-export config utilities for server use
export { getWorkOSConfig };

// Re-export payments (server-only)
export { mollieClient } from "./lib/payments";

/**
 * WorkOS API response types (internal)
 */
interface WorkOSAuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    email_verified: boolean;
    profile_picture_url?: string;
    created_at: string;
    updated_at: string;
  };
}

/**
 * Transform WorkOS user response to our user type
 */
function transformUser(workosUser: WorkOSAuthResponse["user"]): WorkOSUser {
  return {
    id: workosUser.id,
    email: workosUser.email,
    firstName: workosUser.first_name,
    lastName: workosUser.last_name,
    emailVerified: workosUser.email_verified,
    profilePictureUrl: workosUser.profile_picture_url,
    createdAt: workosUser.created_at,
    updatedAt: workosUser.updated_at,
  };
}

/**
 * Exchange an authorization code for tokens
 * @param code - Authorization code from OAuth callback
 * @param clientId - WorkOS client ID
 * @param clientSecret - WorkOS client secret (server-side only!)
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
  const response = await fetch(WORKOS_ENDPOINTS.authenticate, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  const data = (await response.json()) as WorkOSAuthResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: transformUser(data.user),
  };
}

/**
 * Refresh an access token using a refresh token
 * @param refreshToken - Current refresh token
 * @param clientId - WorkOS client ID
 * @param clientSecret - WorkOS client secret (server-side only!)
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret?: string
): Promise<TokenResponse> {
  const body: Record<string, string> = {
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };

  // Client secret is optional for refresh in some WorkOS configurations
  if (clientSecret) {
    body.client_secret = clientSecret;
  }

  const response = await fetch(WORKOS_ENDPOINTS.authenticate, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = (await response.json()) as WorkOSAuthResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: transformUser(data.user),
  };
}
