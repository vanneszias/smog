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
