import { ORPCError, os } from "@orpc/server";

/**
 * Logs unexpected errors with a `[rpc:<path>]` prefix and replaces them
 * with a bare `INTERNAL_SERVER_ERROR`, so no internals reach the client.
 * `ORPCError`s below 500 are expected outcomes and pass through silently.
 */
export const logErrors = os.middleware(async ({ next, path }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof ORPCError && error.status < 500) {
      throw error;
    }
    console.error(
      `[rpc:${path.join(".")}] Failed to handle the request:`,
      error
    );
    if (error instanceof ORPCError) {
      throw error;
    }
    throw new ORPCError("INTERNAL_SERVER_ERROR", { cause: error });
  }
});
