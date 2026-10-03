/**
 * `@smog/sponsorships/contract`: the public sponsorship procedures (spec
 * §7, phase 6). Mounted as `sponsorships` in `@smog/api`'s `appContract`.
 * Anyone may call them (no account). Every procedure declares its guards
 * (ruling 5): Turnstile and `RL_SPONSOR` on `checkout`, `reedit.submit` and
 * `renewal.checkout`; `RL_SPONSOR` alone on `uploadLogo`; the reads only
 * the transport's `RL_API`. The router enforces the map and fails closed
 * on a procedure without one.
 *
 * One slice file per area, so the tasks that fill them never edit this
 * file.
 */
import { CHECKOUT_GUARDS, checkoutSlice } from "./checkout";
import type { SponsorshipGuards } from "./guards";
import { LOGO_GUARDS, logoSlice } from "./logo";
import { PUBLIC_GUARDS, publicSlice } from "./public";
import { REEDIT_GUARDS, reeditSlice } from "./reedit";
import { RENEWAL_GUARDS, renewalSlice } from "./renewal";
import { STATUS_GUARDS, statusSlice } from "./status";

export type {
  ProcedurePath,
  SponsorshipGuard,
  SponsorshipGuards,
} from "./guards";

export const sponsorshipsContract = {
  ...publicSlice,
  ...checkoutSlice,
  ...logoSlice,
  ...statusSlice,
  ...reeditSlice,
  ...renewalSlice,
};

export type SponsorshipsContract = typeof sponsorshipsContract;

/**
 * Every procedure's guards, by path (`"reedit.submit"`). Not `Partial`:
 * `check-types` fails on a procedure without guards.
 */
export const SPONSORSHIP_PROCEDURE_GUARDS = {
  ...PUBLIC_GUARDS,
  ...CHECKOUT_GUARDS,
  ...LOGO_GUARDS,
  ...STATUS_GUARDS,
  ...REEDIT_GUARDS,
  ...RENEWAL_GUARDS,
} as const satisfies SponsorshipGuards<SponsorshipsContract>;
