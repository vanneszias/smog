import { oc } from "@orpc/contract";
import { z } from "zod";
import { ERRORS } from "./errors";

// biome-ignore lint/performance/noBarrelFile: the `@smog/rpc/contract` entry point re-exports the error map for contracts.
export { ERRORS, type RpcErrorCode } from "./errors";

/**
 * The start of every contract procedure: `oc` with the shared error map.
 * Contract-only (no server code), so it is safe in the app bundles.
 *
 * ```ts
 * export const gesturesContract = {
 *   bySlug: baseContract.input(z.object({ slug: z.string() })).output(gesture),
 * };
 * ```
 */
export const baseContract = oc.errors(ERRORS);

/**
 * The user roles (`@smog/auth` `Role`, `@smog/db` `ROLES`), for contract
 * outputs. Written out so the app bundles never import the db schema; a
 * type test keeps it equal to `Role`.
 */
export const roleSchema = z.enum(["user", "admin"]);

/**
 * The header `requireTurnstile` reads the widget token from. Better Auth's
 * captcha plugin (the `/api/auth/*` endpoints) reads `x-captcha-response`
 * instead; the auth client sends that one.
 */
export const TURNSTILE_HEADER = "x-turnstile-token";

/**
 * Per-call client context for every app client (`ApiClient`, slice clients):
 * `client.sponsorships.checkout(input, { context: { turnstileToken } })` or
 * `mutationOptions({ context: { turnstileToken } })` sends the token in
 * `x-turnstile-token` for that call only.
 */
export interface RpcClientContext {
  turnstileToken?: string | undefined;
}
