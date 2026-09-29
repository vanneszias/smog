// biome-ignore-all lint/performance/noBarrelFile: the package entry point (`@smog/rpc`): server-side builders and middleware.
export {
  adminProcedure,
  base,
  implementRpc,
  publicProcedure,
  userProcedure,
} from "./base";
export {
  RATE_LIMIT_BINDINGS,
  type RateLimitBinding,
  type RateLimiter,
  type RpcContext,
  type RpcEnv,
} from "./context";
export { baseContract } from "./contract";
export { ERRORS, type RpcErrorCode } from "./errors";
export { requireAdmin, requireUser } from "./middleware/auth";
export { logErrors } from "./middleware/log";
export {
  checkRateLimit,
  limitRequests,
  rateLimit,
} from "./middleware/rate-limit";
export {
  requireTurnstile,
  TURNSTILE_HEADER,
  verifyTurnstile,
} from "./middleware/turnstile";
export { mapValidationErrors } from "./validation";
