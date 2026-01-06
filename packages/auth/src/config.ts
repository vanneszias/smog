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
 *
 * Usage:
 * - Server: Pass process.env explicitly: getWorkOSConfig(process.env)
 * - Native: Reads from process.env automatically (Expo injects EXPO_PUBLIC_*)
 * - Web: Pass env vars explicitly or read directly via import.meta.env in your app
 *
 * Note: import.meta.env is NOT used here as it's not supported in React Native/Hermes.
 * Web apps should read import.meta.env directly and pass values to this function.
 */
export function getWorkOSConfig(
  env?: Record<string, string | undefined>
): WorkOSConfig {
  const getVar = (key: string): string | undefined => {
    // Check explicitly passed env first
    if (env?.[key]) {
      return env[key];
    }
    // Fall back to process.env (works in Node.js and React Native via Expo)
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
