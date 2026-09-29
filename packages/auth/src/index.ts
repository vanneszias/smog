// biome-ignore-all lint/performance/noBarrelFile: the package entry point (`@smog/auth`): server-side helpers and types.
export { type AuthEnv, authEnvSchema, parseAuthEnv } from "./env";
export { type Auth, type CreateAuthOptions, createAuth } from "./server";
export {
  AuthError,
  getSession,
  type Role,
  requireAdminUser,
  requireUser,
  type SessionUser,
  type SessionWithUser,
} from "./session";
