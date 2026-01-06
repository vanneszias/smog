/**
 * @smog/auth - Shared authentication package
 *
 * This package provides unified authentication utilities for the Smog monorepo,
 * including WorkOS integration, token handling, and type definitions.
 *
 * ## Usage
 *
 * ### Types (all platforms)
 * ```ts
 * import type { WorkOSUser, AuthState, AuthContextType } from "@smog/auth";
 * ```
 *
 * ### Config (all platforms)
 * ```ts
 * import { getWorkOSConfig, buildAuthorizationUrl, WORKOS_ENDPOINTS } from "@smog/auth";
 * ```
 *
 * ### Token utilities (all platforms)
 * ```ts
 * import { isTokenExpired, getTokenExpiry, generateGuestId } from "@smog/auth";
 * ```
 *
 * ### Server utilities (server-side only!)
 * ```ts
 * import { exchangeCodeForTokens, refreshAccessToken } from "@smog/auth/server";
 * ```
 */

// Configuration
export {
  buildAuthorizationUrl,
  getWorkOSConfig,
  WORKOS_ENDPOINTS,
  type WorkOSConfig,
} from "./config";

// Token utilities
export {
  generateGuestId,
  getTokenExpiry,
  getTokenSubject,
  isTokenExpired,
  type JWTPayload,
  parseJWT,
} from "./tokens";
// Types
export type {
  AuthActions,
  AuthContextType,
  AuthMode,
  AuthState,
  ConvexAuthState,
  TokenResponse,
  WorkOSUser,
} from "./types";
