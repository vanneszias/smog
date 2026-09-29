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
export {
  baseContract,
  type RpcClientContext,
  TURNSTILE_HEADER,
} from "./contract";
export { ERRORS, type RpcErrorCode } from "./errors";
export { loadSession, rpcHandlerOptions } from "./handler";
export { requireAdmin, requireUser } from "./middleware/auth";
export { logErrors } from "./middleware/log";
export { checkOrigin, isForeignRequest } from "./middleware/origin";
export {
  checkRateLimit,
  limitRequests,
  rateLimit,
} from "./middleware/rate-limit";
export { requireTurnstile, verifyTurnstile } from "./middleware/turnstile";
export { mapValidationErrors } from "./validation";
