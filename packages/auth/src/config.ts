/**
 * WorkOS configuration and constants
 *
 * Centralized WorkOS configuration used by all apps in the monorepo.
 */

/**
 * WorkOS API endpoints
 */
export const WORKOS_ENDPOINTS = {
  authorize: "https://api.workos.com/user_management/authorize",
  authenticate: "https://api.workos.com/user_management/authenticate",
  jwks: (clientId: string) => `https://api.workos.com/sso/jwks/${clientId}`,
  issuerUserManagement: (clientId: string) =>
    `https://api.workos.com/user_management/${clientId}`,
  issuerSSO: "https://api.workos.com/",
} as const;

/**
 * WorkOS OAuth configuration
 * Note: clientSecret should only be used server-side
 */
export type WorkOSConfig = {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
};

/**
 * Get WorkOS config from environment variables
 * Works in both Node.js and browser environments
 */
export function getWorkOSConfig(
  env?: Record<string, string | undefined>
): WorkOSConfig {
  // Allow passing env vars directly (for Node.js/server)
  // Fall back to import.meta.env (Vite) or process.env (Expo/Node)
  const getVar = (key: string): string | undefined => {
    if (env?.[key]) {
      return env[key];
    }
    const envValue = (
      import.meta as unknown as Record<string, Record<string, string>>
    ).env?.[key];
    if (typeof import.meta !== "undefined" && envValue) {
      return envValue;
    }
    if (typeof process !== "undefined" && process.env?.[key]) {
      return process.env[key];
    }
    return;
  };

  return {
    clientId:
      getVar("WORKOS_CLIENT_ID") ||
      getVar("VITE_WORKOS_CLIENT_ID") ||
      getVar("EXPO_PUBLIC_WORKOS_CLIENT_ID") ||
      "",
    clientSecret: getVar("WORKOS_CLIENT_SECRET"),
    redirectUri:
      getVar("WORKOS_REDIRECT_URI") ||
      getVar("VITE_WORKOS_REDIRECT_URI") ||
      getVar("EXPO_PUBLIC_WORKOS_REDIRECT_URI") ||
      "",
  };
}

/**
 * Build WorkOS authorization URL
 */
export function buildAuthorizationUrl(config: {
  clientId: string;
  redirectUri: string;
  state?: string;
}): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    provider: "authkit",
  });

  if (config.state) {
    params.set("state", config.state);
  }

  return `${WORKOS_ENDPOINTS.authorize}?${params.toString()}`;
}
