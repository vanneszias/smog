import type { AnyContractProcedure } from "@orpc/contract";
import { baseContract } from "@smog/rpc/contract";
import { SPONSORSHIP_ERRORS } from "../schema/status";

/** Every procedure path of a contract slice (`"reedit.get"`, `"checkout"`). */
export type ProcedurePath<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends AnyContractProcedure
    ? `${Prefix}${K}`
    : ProcedurePath<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/**
 * The guards of a public sponsorship procedure (ruling 5), on top of the
 * transport's `RL_API` per IP, which every request passes:
 * - `rateLimit: "RL_SPONSOR"` adds the sponsor bucket (5 per 60 s per IP);
 * - `turnstile` requires a valid Turnstile token (`x-turnstile-token`).
 */
export interface SponsorshipGuard {
  rateLimit: "RL_API" | "RL_SPONSOR";
  turnstile: boolean;
}

/** Every procedure of a slice with its guards; the router enforces them. */
export type SponsorshipGuards<TSlice> = Record<
  ProcedurePath<TSlice>,
  SponsorshipGuard
>;

/** A read: the transport's `RL_API` only. */
export const READ_GUARD = {
  rateLimit: "RL_API",
  turnstile: false,
} as const satisfies SponsorshipGuard;

/** A public mutation that takes money or changes a sponsorship. */
export const MUTATION_GUARD = {
  rateLimit: "RL_SPONSOR",
  turnstile: true,
} as const satisfies SponsorshipGuard;

/** The start of every sponsorship procedure: the shared errors plus ours. */
export const sponsorshipContract = baseContract.errors(SPONSORSHIP_ERRORS);
