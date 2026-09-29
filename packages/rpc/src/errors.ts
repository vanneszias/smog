import { z } from "zod";

/**
 * The shared error map (spec §7). Every contract declares it through
 * `baseContract` (`@smog/rpc/contract`), so clients get the codes typed
 * (`isDefinedError(error) && error.code === "NOT_FOUND"`). There are no
 * messages here: clients show `@smog/i18n` copy for the code.
 */
export const ERRORS = {
  CONFLICT: { status: 409 },
  FORBIDDEN: { status: 403 },
  GESTURE_UNAVAILABLE: { status: 409 },
  INVALID_STATE: { status: 409 },
  NOT_FOUND: { status: 404 },
  PAYMENT_MISMATCH: { status: 409 },
  RATE_LIMITED: { status: 429 },
  TOKEN_EXPIRED: { status: 410 },
  TOKEN_INVALID: { status: 400 },
  TURNSTILE_FAILED: { status: 403 },
  UNAUTHORIZED: { status: 401 },
  VALIDATION: {
    data: z.object({
      fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
      formErrors: z.array(z.string()),
    }),
    status: 422,
  },
} as const;

export type RpcErrorCode = keyof typeof ERRORS;
