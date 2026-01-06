/**
 * Token utilities for JWT handling
 *
 * Shared token parsing and validation logic used across all platforms.
 */

/**
 * Parsed JWT payload structure from WorkOS tokens
 */
export type JWTPayload = {
  sub: string; // WorkOS user ID
  exp: number; // Expiration timestamp (seconds)
  iat: number; // Issued at timestamp (seconds)
  iss: string; // Issuer
  aud?: string; // Audience
};

/**
 * Parse a JWT token and extract its payload
 * Does NOT validate the signature - that's done by Convex/server
 */
export function parseJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    if (!payload) {
      return null;
    }
    // Handle base64url encoding
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");

    // Browser/Node compatible base64 decode
    const decoded =
      typeof atob === "function"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("utf-8");

    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Get the expiration time of a JWT token in milliseconds
 */
export function getTokenExpiry(token: string): number {
  const payload = parseJWT(token);
  if (!payload) {
    // Default to 5 minutes if parsing fails
    return Date.now() + 5 * 60 * 1000;
  }
  return payload.exp * 1000;
}

/**
 * Check if a token is expired (with optional buffer time)
 * @param token - JWT token string
 * @param bufferMs - Buffer time in milliseconds before actual expiry (default: 60s)
 */
export function isTokenExpired(token: string, bufferMs = 60_000): boolean {
  const expiry = getTokenExpiry(token);
  return Date.now() >= expiry - bufferMs;
}

/**
 * Extract the WorkOS user ID (subject) from a token
 */
export function getTokenSubject(token: string): string | null {
  const payload = parseJWT(token);
  return payload?.sub ?? null;
}

/**
 * Generate a unique guest ID
 * Uses crypto.randomUUID when available, falls back to timestamp-based ID
 */
export function generateGuestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `guest_${crypto.randomUUID()}`;
  }
  // Fallback for environments without crypto.randomUUID
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `guest_${timestamp}_${random}`;
}
