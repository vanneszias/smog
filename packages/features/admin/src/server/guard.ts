// biome-ignore-all lint/performance/noBarrelFile: the guard moved to `@smog/rpc/audit` (shared with `@smog/translation`); the admin names stay.
export {
  AUTH_READ_METHODS,
  adminGuard,
  type GuardKind,
  markUnchanged,
} from "@smog/rpc/audit";
