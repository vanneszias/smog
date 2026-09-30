import { MAGIC_LINK_TTL_SECONDS } from "@smog/auth/react";

/**
 * The magic link this app asked for, in memory: the address and when. A
 * link that arrives for that address within the link's lifetime is
 * exchanged without a prompt; any other link (sent by someone else, or
 * after the app restarted) asks first, so a link cannot sign the app into
 * another account unnoticed (login CSRF).
 */
let pending: { at: number; email: string } | null = null;

const normalize = (email: string): string => email.trim().toLowerCase();

export function markMagicLinkRequested(email: string, at = Date.now()): void {
  pending = { at, email: normalize(email) };
}

export function isMagicLinkPending(email: string, now = Date.now()): boolean {
  return (
    pending !== null &&
    pending.email === normalize(email) &&
    now - pending.at < MAGIC_LINK_TTL_SECONDS * 1000
  );
}

export function clearMagicLinkRequest(): void {
  pending = null;
}
