import { MAGIC_LINK_TTL_SECONDS } from "@smog/auth/react";

/**
 * The magic link this app asked for, in memory: the address and when. A
 * link that arrives within the link's lifetime is exchanged without a
 * prompt (and must sign in that address); any other link (sent by someone
 * else, or after the app restarted) asks first, so a link cannot sign the
 * app into another account unnoticed (login CSRF). The link itself carries
 * only the token.
 */
let pending: { at: number; email: string } | null = null;

const normalize = (email: string): string => email.trim().toLowerCase();

export function markMagicLinkRequested(email: string, at = Date.now()): void {
  pending = { at, email: normalize(email) };
}

/** The address of the request still pending, or null. */
export function pendingMagicLinkEmail(now = Date.now()): string | null {
  return pending && now - pending.at < MAGIC_LINK_TTL_SECONDS * 1000
    ? pending.email
    : null;
}

export function isMagicLinkPending(now = Date.now()): boolean {
  return pendingMagicLinkEmail(now) !== null;
}

export function clearMagicLinkRequest(): void {
  pending = null;
}
