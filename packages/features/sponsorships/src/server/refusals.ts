/**
 * The defined errors the link procedures answer with (ruling 11), built
 * outside a handler so the steps that decide them can throw them: the
 * same codes, statuses and data the contract declares
 * (`SPONSORSHIP_ERRORS` over the shared map).
 */
import { ORPCError } from "@orpc/server";
import { ERRORS } from "@smog/rpc";
import { type InvalidStateReason, SPONSORSHIP_ERRORS } from "../schema/status";
import type { TokenLink } from "./token-link";

export function tokenInvalid() {
  return new ORPCError("TOKEN_INVALID", {
    defined: true,
    status: ERRORS.TOKEN_INVALID.status,
  });
}

function tokenExpired(expiresAt: Date) {
  return new ORPCError("TOKEN_EXPIRED", {
    data: { expiresAt: expiresAt.getTime() },
    defined: true,
    status: SPONSORSHIP_ERRORS.TOKEN_EXPIRED.status,
  });
}

export function invalidState(reason: InvalidStateReason) {
  return new ORPCError("INVALID_STATE", {
    data: { reason },
    defined: true,
    status: SPONSORSHIP_ERRORS.INVALID_STATE.status,
  });
}

/** The open link, or the refusal of an unknown, used or expired one. */
export function requireOpen(
  link: TokenLink
): Extract<TokenLink, { kind: "open" }> {
  if (link.kind === "expired") {
    throw tokenExpired(link.expiresAt);
  }
  if (link.kind === "invalid") {
    throw tokenInvalid();
  }
  return link;
}
