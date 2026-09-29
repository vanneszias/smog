import { ORPCError, ValidationError } from "@orpc/server";
import { z } from "zod";
import { ERRORS } from "./errors";

/**
 * A client interceptor for the handlers (`clientInterceptors`): input
 * validation failures (`BAD_REQUEST` caused by a `ValidationError`) become
 * the typed `VALIDATION` error with Zod's flattened field errors as data.
 */
export async function mapValidationErrors<T>({
  next,
}: {
  next: () => Promise<T>;
}): Promise<T> {
  try {
    return await next();
  } catch (error) {
    if (
      error instanceof ORPCError &&
      error.code === "BAD_REQUEST" &&
      error.cause instanceof ValidationError
    ) {
      const zodError = new z.ZodError(error.cause.issues as z.core.$ZodIssue[]);
      throw new ORPCError("VALIDATION", {
        cause: error,
        data: z.flattenError(zodError),
        status: ERRORS.VALIDATION.status,
      });
    }
    throw error;
  }
}
