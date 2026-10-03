import { ORPCError, os } from "@orpc/server";
import type { MollieFetch } from "@smog/payments";
import {
  checkRateLimit,
  ERRORS,
  implementRpc,
  type RpcContext,
  TURNSTILE_HEADER,
  verifyTurnstile,
} from "@smog/rpc";
import {
  SPONSORSHIP_PROCEDURE_GUARDS,
  type SponsorshipGuard,
  sponsorshipsContract,
} from "../contract";
import type { SponsorshipBindings } from "./bindings";

/** The guards of the procedure at `path` (with or without the mount). */
function guardAt(
  guards: Readonly<Record<string, SponsorshipGuard>>,
  path: readonly string[]
): SponsorshipGuard | undefined {
  const full = path.join(".");
  if (Object.hasOwn(guards, full)) {
    return guards[full];
  }
  if (path[0] === "sponsorships") {
    const local = path.slice(1).join(".");
    return Object.hasOwn(guards, local) ? guards[local] : undefined;
  }
}

/**
 * Enforces each procedure's declared guards (ruling 5), before its input
 * is used: `RL_SPONSOR` per IP and procedure, then Turnstile (skipped when
 * `TURNSTILE_SECRET_KEY` is unset, as `requireTurnstile`). A procedure
 * without guards fails closed.
 */
function sponsorshipGuard(guards: Readonly<Record<string, SponsorshipGuard>>) {
  return os
    .$context<RpcContext>()
    .middleware(async ({ context, next, path }) => {
      const name = path.join(".");
      const guard = guardAt(guards, path);
      if (!guard) {
        console.error(`[sponsorships] ${name || "(no path)"} has no guards`);
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
      if (
        guard.rateLimit === "RL_SPONSOR" &&
        !(await checkRateLimit(context.env.RL_SPONSOR, `${context.ip}:${name}`))
      ) {
        throw new ORPCError("RATE_LIMITED", {
          defined: true,
          status: ERRORS.RATE_LIMITED.status,
        });
      }
      if (guard.turnstile) {
        const secret = context.env.TURNSTILE_SECRET_KEY;
        const token = context.request.headers.get(TURNSTILE_HEADER);
        const valid =
          !secret ||
          (token !== null &&
            token !== "" &&
            (await verifyTurnstile({ ip: context.ip, secret, token })));
        if (!valid) {
          throw new ORPCError("TURNSTILE_FAILED", {
            defined: true,
            status: ERRORS.TURNSTILE_FAILED.status,
          });
        }
      }
      return await next();
    });
}

/** The builder of every sponsorship procedure: the contract, `logErrors`, the guards. */
export const sponsorshipProcedure = implementRpc(sponsorshipsContract).use(
  sponsorshipGuard(SPONSORSHIP_PROCEDURE_GUARDS)
);

export type SponsorshipsImplementer = typeof sponsorshipProcedure;

/** What `@smog/api` (and the tests) inject. */
export interface SponsorshipsDeps {
  /**
   * The queue and bucket bindings (`./bindings`). Unset in the Worker (its
   * own, from `cloudflare:workers`); the tests inject recording fakes.
   */
  bindings?: () => SponsorshipBindings;
  /**
   * The `fetch` the Mollie client uses. Unset in production (the Worker's
   * `fetch`, to `api.mollie.com`); the tests inject the Mollie fake.
   */
  mollieFetch?: MollieFetch;
}

/** A slice that a later phase 6 task implements. */
export function notImplemented(): never {
  throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "not implemented" });
}
